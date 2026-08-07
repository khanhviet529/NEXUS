-- GĐ7 — Files (S3 presigned), notification_preferences, business calendar (§5C.4)

-- ===== files (§6.1) — TenantAuditedBase + SoftDelete =====
CREATE TABLE "files" (
  "id"             uuid        NOT NULL DEFAULT gen_random_uuid(),
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL,
  "created_by_id"  uuid,
  "updated_by_id"  uuid,
  "tenant_id"      uuid        NOT NULL,
  "deleted_at"     timestamptz,
  "bucket"         text        NOT NULL,
  "object_key"     text        NOT NULL,
  "filename"       text        NOT NULL,
  "mime"           text        NOT NULL,
  "size"           integer     NOT NULL,
  "checksum"       text,
  "uploaded_by_id" uuid,
  CONSTRAINT "files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "files_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "files_tenant_id_object_key_key" UNIQUE ("tenant_id", "object_key")
);
CREATE INDEX "files_tenant_id_created_at_idx" ON "files"("tenant_id", "created_at" DESC);

-- ===== attachments — POLY (entity, entity_id), quyền kế thừa entity gốc =====
CREATE TABLE "attachments" (
  "id"            uuid        NOT NULL DEFAULT gen_random_uuid(),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL,
  "created_by_id" uuid,
  "updated_by_id" uuid,
  "tenant_id"     uuid        NOT NULL,
  "file_id"       uuid        NOT NULL,
  "entity"        text        NOT NULL,
  "entity_id"     uuid        NOT NULL,
  "category"      text,
  CONSTRAINT "attachments_pkey" PRIMARY KEY ("id"),
  -- Composite FK §6.4: attachment tenant A không trỏ được file tenant B
  CONSTRAINT "attachments_file_fk"
    FOREIGN KEY ("tenant_id", "file_id") REFERENCES "files" ("tenant_id", "id")
);
CREATE INDEX "attachments_tenant_id_entity_entity_id_idx"
  ON "attachments"("tenant_id", "entity", "entity_id");
CREATE INDEX "attachments_tenant_id_file_id_idx" ON "attachments"("tenant_id", "file_id");

-- ===== notification_preferences — theo MEMBERSHIP (erd.md #1) =====
CREATE TABLE "notification_preferences" (
  "id"            uuid        NOT NULL DEFAULT gen_random_uuid(),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL,
  "created_by_id" uuid,
  "updated_by_id" uuid,
  "tenant_id"     uuid        NOT NULL,
  "membership_id" uuid        NOT NULL,
  "type"          text        NOT NULL,
  "channels"      text[]      NOT NULL DEFAULT ARRAY[]::text[],
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_preferences_tenant_membership_type_key"
    UNIQUE ("tenant_id", "membership_id", "type"),
  CONSTRAINT "notification_preferences_membership_fk"
    FOREIGN KEY ("tenant_id", "membership_id")
    REFERENCES "tenant_memberships" ("tenant_id", "id")
);

-- ===== business_calendars (§5C.4) =====
CREATE TABLE "business_calendars" (
  "id"            uuid        NOT NULL DEFAULT gen_random_uuid(),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL,
  "created_by_id" uuid,
  "updated_by_id" uuid,
  "tenant_id"     uuid        NOT NULL,
  "name"          text        NOT NULL,
  "timezone"      text        NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  "is_default"    boolean     NOT NULL DEFAULT false,
  CONSTRAINT "business_calendars_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_calendars_tenant_id_id_key" UNIQUE ("tenant_id", "id")
);
-- Một lịch mặc định mỗi tenant (partial unique — Prisma không mô hình được, DDL tay)
CREATE UNIQUE INDEX "business_calendars_one_default_per_tenant"
  ON "business_calendars"("tenant_id") WHERE "is_default";

CREATE TABLE "calendar_working_hours" (
  "id"            uuid        NOT NULL DEFAULT gen_random_uuid(),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL,
  "created_by_id" uuid,
  "updated_by_id" uuid,
  "tenant_id"     uuid        NOT NULL,
  "calendar_id"   uuid        NOT NULL,
  "day_of_week"   integer     NOT NULL, -- ISO-8601: 1=Thứ 2 … 7=CN
  "from_time"     text        NOT NULL, -- 'HH:mm'
  "to_time"       text        NOT NULL,
  CONSTRAINT "calendar_working_hours_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calendar_working_hours_uniq"
    UNIQUE ("tenant_id", "calendar_id", "day_of_week", "from_time"),
  CONSTRAINT "calendar_working_hours_calendar_fk"
    FOREIGN KEY ("tenant_id", "calendar_id")
    REFERENCES "business_calendars" ("tenant_id", "id") ON DELETE CASCADE,
  CONSTRAINT "calendar_working_hours_dow_check" CHECK ("day_of_week" BETWEEN 1 AND 7)
);

CREATE TABLE "calendar_holidays" (
  "id"            uuid        NOT NULL DEFAULT gen_random_uuid(),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL,
  "created_by_id" uuid,
  "updated_by_id" uuid,
  "tenant_id"     uuid        NOT NULL,
  "calendar_id"   uuid        NOT NULL,
  "date"          date        NOT NULL,
  "name"          text        NOT NULL,
  "is_recurring"  boolean     NOT NULL DEFAULT false,
  CONSTRAINT "calendar_holidays_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calendar_holidays_uniq" UNIQUE ("tenant_id", "calendar_id", "date", "name"),
  CONSTRAINT "calendar_holidays_calendar_fk"
    FOREIGN KEY ("tenant_id", "calendar_id")
    REFERENCES "business_calendars" ("tenant_id", "id") ON DELETE CASCADE
);
CREATE INDEX "calendar_holidays_tenant_id_calendar_id_date_idx"
  ON "calendar_holidays"("tenant_id", "calendar_id", "date");

-- ===== GĐ7g — cron partition: hàm tạo mảnh audit_logs (khuôn ensure_movements_partition GĐ5b) =====
CREATE OR REPLACE FUNCTION ensure_audit_logs_partition(p_month date) RETURNS text AS $$
DECLARE
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := 'audit_logs_' || to_char(v_start, 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
    v_name, v_start, v_end);
  RETURN v_name;
END;
$$ LANGUAGE plpgsql;
