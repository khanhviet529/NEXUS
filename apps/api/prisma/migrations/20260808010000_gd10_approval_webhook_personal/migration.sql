-- GĐ10 — approval_authorities (§5C.12), webhook (§5C.5), recent/favorites (§5C.2)

-- ===== approval_authorities — hạn mức duyệt, KHÔNG trên tenant_memberships (§12 #62)
CREATE TABLE "approval_authorities" (
  "id"             uuid        NOT NULL DEFAULT gen_random_uuid(),
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL,
  "created_by_id"  uuid,
  "updated_by_id"  uuid,
  "tenant_id"      uuid        NOT NULL,
  "deleted_at"     timestamptz,
  "document_type"  text        NOT NULL,
  "currency"       text        NOT NULL DEFAULT 'VND',
  "membership_id"  uuid,
  "role_id"        uuid,
  "org_unit_id"    uuid,
  "min_amount"     decimal(18,2) NOT NULL DEFAULT 0,
  "max_amount"     decimal(18,2),
  "effective_from" date        NOT NULL,
  "effective_to"   date,
  "priority"       integer     NOT NULL DEFAULT 0,
  CONSTRAINT "approval_authorities_pkey" PRIMARY KEY ("id"),
  -- Phải trỏ vào ÍT NHẤT một đối tượng (§6.1)
  CONSTRAINT "approval_authorities_target_check"
    CHECK (num_nonnulls("membership_id", "role_id", "org_unit_id") >= 1),
  -- Composite FK §6.4 — không trỏ chéo tenant
  CONSTRAINT "approval_authorities_membership_fk"
    FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "tenant_memberships" ("tenant_id", "id"),
  CONSTRAINT "approval_authorities_role_fk"
    FOREIGN KEY ("tenant_id", "role_id") REFERENCES "roles" ("tenant_id", "id"),
  CONSTRAINT "approval_authorities_org_unit_fk"
    FOREIGN KEY ("tenant_id", "org_unit_id") REFERENCES "org_units" ("tenant_id", "id")
);
CREATE INDEX "approval_authorities_resolve_idx"
  ON "approval_authorities"("tenant_id", "document_type", "effective_from", "effective_to");

-- ===== webhook_endpoints — secret MÃ HOÁ tầng ứng dụng (§4.11)
CREATE TABLE "webhook_endpoints" (
  "id"                uuid        NOT NULL DEFAULT gen_random_uuid(),
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL,
  "created_by_id"     uuid,
  "updated_by_id"     uuid,
  "tenant_id"         uuid        NOT NULL,
  "url"               text        NOT NULL,
  "secret"            text        NOT NULL,
  "secret_previous"   text,
  "secret_rotated_at" timestamptz,
  "status"            text        NOT NULL DEFAULT 'ACTIVE',
  "failure_count"     integer     NOT NULL DEFAULT 0,
  "disabled_at"       timestamptz,
  CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_endpoints_tenant_id_id_key" UNIQUE ("tenant_id", "id")
);

CREATE TABLE "webhook_subscriptions" (
  "id"            uuid        NOT NULL DEFAULT gen_random_uuid(),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL,
  "created_by_id" uuid,
  "updated_by_id" uuid,
  "tenant_id"     uuid        NOT NULL,
  "endpoint_id"   uuid        NOT NULL,
  "event_type"    text        NOT NULL,
  CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_subscriptions_uniq" UNIQUE ("tenant_id", "endpoint_id", "event_type"),
  CONSTRAINT "webhook_subscriptions_endpoint_fk"
    FOREIGN KEY ("tenant_id", "endpoint_id")
    REFERENCES "webhook_endpoints" ("tenant_id", "id") ON DELETE CASCADE
);

CREATE TABLE "webhook_deliveries" (
  "id"              uuid        NOT NULL DEFAULT gen_random_uuid(),
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL,
  "created_by_id"   uuid,
  "updated_by_id"   uuid,
  "tenant_id"       uuid        NOT NULL,
  "endpoint_id"     uuid        NOT NULL,
  "event_id"        uuid        NOT NULL,
  "event_type"      text        NOT NULL,
  "payload"         jsonb       NOT NULL,
  "status"          text        NOT NULL DEFAULT 'PENDING',
  "response_status" integer,
  "attempts"        integer     NOT NULL DEFAULT 0,
  "next_retry_at"   timestamptz,
  "delivered_at"    timestamptz,
  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id"),
  -- Chống gửi trùng theo event (§8.2 ghi chú outbox)
  CONSTRAINT "webhook_deliveries_uniq" UNIQUE ("tenant_id", "endpoint_id", "event_id"),
  CONSTRAINT "webhook_deliveries_endpoint_fk"
    FOREIGN KEY ("tenant_id", "endpoint_id")
    REFERENCES "webhook_endpoints" ("tenant_id", "id") ON DELETE CASCADE
);
CREATE INDEX "webhook_deliveries_due_idx" ON "webhook_deliveries"("status", "next_retry_at");

-- ===== recent_items / favorite_items — theo membership (erd.md #1), xoá cứng
CREATE TABLE "recent_items" (
  "id"            uuid        NOT NULL DEFAULT gen_random_uuid(),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL,
  "created_by_id" uuid,
  "updated_by_id" uuid,
  "tenant_id"     uuid        NOT NULL,
  "membership_id" uuid        NOT NULL,
  "entity"        text        NOT NULL,
  "entity_id"     uuid        NOT NULL,
  "viewed_at"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recent_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recent_items_uniq" UNIQUE ("tenant_id", "membership_id", "entity", "entity_id"),
  CONSTRAINT "recent_items_membership_fk"
    FOREIGN KEY ("tenant_id", "membership_id")
    REFERENCES "tenant_memberships" ("tenant_id", "id") ON DELETE CASCADE
);
CREATE INDEX "recent_items_membership_viewed_idx"
  ON "recent_items"("tenant_id", "membership_id", "viewed_at" DESC);

CREATE TABLE "favorite_items" (
  "id"            uuid        NOT NULL DEFAULT gen_random_uuid(),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL,
  "created_by_id" uuid,
  "updated_by_id" uuid,
  "tenant_id"     uuid        NOT NULL,
  "membership_id" uuid        NOT NULL,
  "entity"        text        NOT NULL,
  "entity_id"     uuid        NOT NULL,
  "label"         text,
  CONSTRAINT "favorite_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "favorite_items_uniq" UNIQUE ("tenant_id", "membership_id", "entity", "entity_id"),
  CONSTRAINT "favorite_items_membership_fk"
    FOREIGN KEY ("tenant_id", "membership_id")
    REFERENCES "tenant_memberships" ("tenant_id", "id") ON DELETE CASCADE
);

-- ===== Trigger audit — matrix §6.5 đánh dấu trigger cho 2 bảng nhạy cảm mới
-- (hàm security_audit_trigger_fn có từ GĐ3b)
CREATE TRIGGER trg_audit_approval_authorities
  AFTER INSERT OR UPDATE OR DELETE ON approval_authorities
  FOR EACH ROW EXECUTE FUNCTION security_audit_trigger_fn();
CREATE TRIGGER trg_audit_webhook_endpoints
  AFTER INSERT OR UPDATE OR DELETE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION security_audit_trigger_fn();
