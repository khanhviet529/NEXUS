-- ============================================================================
-- GĐ5b — Số dư đồng thời (§5B.2/B4, ADR-0003)
-- movements PARTITION BY RANGE (created_at), PK (id, created_at) — #8/#28
-- ============================================================================

CREATE TABLE movements (
  id                     uuid          NOT NULL DEFAULT gen_random_uuid(),
  created_at             timestamptz   NOT NULL DEFAULT now(),
  tenant_id              uuid          NOT NULL,
  account_type           text          NOT NULL,
  account_key            text          NOT NULL,
  movement_type          text          NOT NULL,
  direction              smallint      NOT NULL,
  quantity               decimal(18,3) NOT NULL,
  amount                 decimal(18,2),
  currency               text,
  ref_type               text          NOT NULL,
  ref_id                 uuid          NOT NULL,
  reversal_of_id         uuid,
  reversal_of_created_at timestamptz,
  created_by_id          uuid,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
-- APPEND-ONLY: không UPDATE/DELETE. KHÔNG đặt UNIQUE ở đây (#28) —
-- tính duy nhất nằm ở movement_dedup_keys.

CREATE INDEX movements_account_idx
  ON movements (tenant_id, account_type, account_key, created_at);

-- Mảnh khởi đầu (job/hàm tạo mảnh mới — ensure_movements_partition)
CREATE TABLE movements_2026_08 PARTITION OF movements
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE movements_2026_09 PARTITION OF movements
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE movements_2026_10 PARTITION OF movements
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

-- Hàm tạo mảnh theo tháng — cron gọi trước 1 tháng (§5B.3/C2), test #25 gọi tay
CREATE OR REPLACE FUNCTION ensure_movements_partition(p_month date) RETURNS text AS $$
DECLARE
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := 'movements_' || to_char(v_start, 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF movements FOR VALUES FROM (%L) TO (%L)',
    v_name, v_start, v_end);
  RETURN v_name;
END;
$$ LANGUAGE plpgsql;

-- Bảng dedup — KHÔNG partition, PK là nơi thực thi tính duy nhất (#28).
-- KHÔNG FK về movements (ADR-0003: DETACH mảnh cũ phải dễ)
CREATE TABLE movement_dedup_keys (
  tenant_id           uuid        NOT NULL,
  ref_type            text        NOT NULL,
  ref_id              uuid        NOT NULL,
  movement_type       text        NOT NULL,
  movement_id         uuid        NOT NULL,
  movement_created_at timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, ref_type, ref_id, movement_type)
);

CREATE TABLE warehouses (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL,
  created_by_id uuid,
  updated_by_id uuid,
  tenant_id     uuid        NOT NULL,
  org_unit_id   uuid,
  version       integer     NOT NULL DEFAULT 1,
  external_id   text,
  source        text,
  deleted_at    timestamptz,
  code          text        NOT NULL,
  name          text        NOT NULL,
  CONSTRAINT warehouses_pkey PRIMARY KEY (id),
  CONSTRAINT warehouses_tenant_id_key UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX warehouses_tenant_code_active_key
  ON warehouses (tenant_id, code) WHERE deleted_at IS NULL;

CREATE TABLE lots (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL,
  created_by_id uuid,
  updated_by_id uuid,
  tenant_id     uuid        NOT NULL,
  org_unit_id   uuid,
  version       integer     NOT NULL DEFAULT 1,
  external_id   text,
  source        text,
  deleted_at    timestamptz,
  product_id    uuid        NOT NULL,
  lot_no        text        NOT NULL,
  mfg_date      date,
  expiry_date   date,
  CONSTRAINT lots_pkey PRIMARY KEY (id),
  CONSTRAINT lots_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT lots_tenant_product_lotno_key UNIQUE (tenant_id, product_id, lot_no),
  CONSTRAINT lots_product_fk
    FOREIGN KEY (tenant_id, product_id) REFERENCES products (tenant_id, id)
);

-- ĐIỂM KIỂM SOÁT ĐỒNG THỜI (#60). lot_id NOT NULL — sentinel uuid 0 cho NONE (#59)
CREATE TABLE stock_balances (
  tenant_id        uuid          NOT NULL,
  warehouse_id     uuid          NOT NULL,
  product_id       uuid          NOT NULL,
  lot_id           uuid          NOT NULL,
  on_hand          decimal(18,3) NOT NULL DEFAULT 0,
  reserved         decimal(18,3) NOT NULL DEFAULT 0,
  available        decimal(18,3) NOT NULL DEFAULT 0,
  in_transit       decimal(18,3) NOT NULL DEFAULT 0,
  version          integer       NOT NULL DEFAULT 0,
  last_movement_at timestamptz,
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, warehouse_id, product_id, lot_id),
  CONSTRAINT stock_balances_warehouse_fk
    FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouses (tenant_id, id),
  CONSTRAINT stock_balances_product_fk
    FOREIGN KEY (tenant_id, product_id) REFERENCES products (tenant_id, id)
  -- KHÔNG FK lot_id → lots: sentinel (#59). Service tự kiểm.
);

CREATE TABLE inventory_serials (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL,
  created_by_id uuid,
  updated_by_id uuid,
  tenant_id     uuid        NOT NULL,
  org_unit_id   uuid,
  version       integer     NOT NULL DEFAULT 1,
  external_id   text,
  source        text,
  deleted_at    timestamptz,
  serial_no     text        NOT NULL,
  product_id    uuid        NOT NULL,
  warehouse_id  uuid        NOT NULL,
  lot_id        uuid        NOT NULL,
  status        text        NOT NULL DEFAULT 'IN_STOCK',
  ref_type      text,
  ref_id        uuid,
  CONSTRAINT inventory_serials_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_serials_serial_key UNIQUE (tenant_id, product_id, serial_no),
  CONSTRAINT inventory_serials_product_fk
    FOREIGN KEY (tenant_id, product_id) REFERENCES products (tenant_id, id),
  CONSTRAINT inventory_serials_warehouse_fk
    FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouses (tenant_id, id)
);
CREATE INDEX inventory_serials_status_idx
  ON inventory_serials (tenant_id, warehouse_id, product_id, status);

CREATE TABLE reconciliation_logs (
  id            uuid          NOT NULL DEFAULT gen_random_uuid(),
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL,
  created_by_id uuid,
  updated_by_id uuid,
  tenant_id     uuid          NOT NULL,
  account_type  text          NOT NULL,
  account_key   text          NOT NULL,
  expected      decimal(18,3) NOT NULL,
  actual        decimal(18,3) NOT NULL,
  diff          decimal(18,3) NOT NULL,
  checked_at    timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT reconciliation_logs_pkey PRIMARY KEY (id)
);
