-- ============================================================================
-- GĐ5 — [REF] orders + order_items (child aggregate #47) + notifications
-- ============================================================================

CREATE TABLE orders (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL,
  created_by_id  uuid,
  updated_by_id  uuid,
  tenant_id      uuid        NOT NULL,
  org_unit_id    uuid,
  version        integer     NOT NULL DEFAULT 1,
  external_id    text,
  source         text,
  deleted_at     timestamptz,
  code           text        NOT NULL,
  customer_id    uuid        NOT NULL,
  status         text        NOT NULL DEFAULT 'DRAFT',
  currency       text        NOT NULL DEFAULT 'VND',
  subtotal       decimal(18,2) NOT NULL DEFAULT 0,
  discount_total decimal(18,2) NOT NULL DEFAULT 0,
  tax_total      decimal(18,2) NOT NULL DEFAULT 0,
  total          decimal(18,2) NOT NULL DEFAULT 0,
  margin         decimal(18,2),
  approved_at    timestamptz,
  approved_by_id uuid,
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_tenant_id_key UNIQUE (tenant_id, id),
  -- Composite FK §6.4: order tenant A không trỏ được customer tenant B
  CONSTRAINT orders_customer_fk
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id)
);

-- Lớp 3 idempotency (§3.9): unique business key trên mã chứng từ
CREATE UNIQUE INDEX orders_tenant_code_active_key
  ON orders (tenant_id, code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX orders_external_key
  ON orders (tenant_id, source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX orders_tenant_status_idx ON orders (tenant_id, status);
CREATE INDEX orders_tenant_customer_idx ON orders (tenant_id, customer_id);
CREATE INDEX orders_tenant_created_idx ON orders (tenant_id, created_at);

CREATE TABLE order_items (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL,
  created_by_id         uuid,
  updated_by_id         uuid,
  tenant_id             uuid        NOT NULL,
  order_id              uuid        NOT NULL,
  product_id            uuid        NOT NULL,
  product_name_snapshot text        NOT NULL,
  quantity              decimal(18,3) NOT NULL,
  uom                   text        NOT NULL,
  uom_factor_snapshot   decimal(18,6) NOT NULL DEFAULT 1,
  unit_price            decimal(18,2) NOT NULL,
  discount_percent      decimal(5,2) NOT NULL DEFAULT 0,
  tax_rate              decimal(5,2) NOT NULL DEFAULT 0,
  amount                decimal(18,2) NOT NULL,
  cost_price            decimal(18,2),
  line_no               integer     NOT NULL,
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  -- §6.4: cả HAI FK đều composite — không lẫn tenant được ở tầng DB
  CONSTRAINT order_items_order_fk
    FOREIGN KEY (tenant_id, order_id) REFERENCES orders (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT order_items_product_fk
    FOREIGN KEY (tenant_id, product_id) REFERENCES products (tenant_id, id)
);
CREATE INDEX order_items_tenant_order_idx ON order_items (tenant_id, order_id);
CREATE INDEX order_items_tenant_product_idx ON order_items (tenant_id, product_id);

CREATE TABLE notifications (
  id            uuid        NOT NULL, -- = eventId khi sinh từ outbox (#20c)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL,
  created_by_id uuid,
  updated_by_id uuid,
  tenant_id     uuid        NOT NULL,
  membership_id uuid        NOT NULL,
  type          text        NOT NULL,
  title         text        NOT NULL,
  body          text,
  data          jsonb,
  read_at       timestamptz,
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_membership_fk
    FOREIGN KEY (tenant_id, membership_id) REFERENCES tenant_memberships (tenant_id, id)
);
CREATE INDEX notifications_inbox_idx
  ON notifications (tenant_id, membership_id, read_at, created_at DESC);
