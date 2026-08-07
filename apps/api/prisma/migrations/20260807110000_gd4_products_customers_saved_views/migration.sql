-- ============================================================================
-- GĐ4 — products/customers [REF] (JSONB đa ngôn ngữ §3.10) + saved_views +
-- user_preferences (§5C.2, ERD #1: gắn membership)
-- ============================================================================

CREATE TABLE user_preferences (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL,
  created_by_id uuid,
  updated_by_id uuid,
  tenant_id     uuid        NOT NULL,
  membership_id uuid        NOT NULL,
  key           text        NOT NULL,
  value         jsonb       NOT NULL,
  CONSTRAINT user_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT user_preferences_membership_fk
    FOREIGN KEY (tenant_id, membership_id) REFERENCES tenant_memberships (tenant_id, id)
);
CREATE UNIQUE INDEX user_preferences_tenant_membership_key_key
  ON user_preferences (tenant_id, membership_id, key);

CREATE TABLE saved_views (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL,
  created_by_id uuid,
  updated_by_id uuid,
  tenant_id     uuid        NOT NULL,
  membership_id uuid        NOT NULL,
  entity        text        NOT NULL,
  name          text        NOT NULL,
  config        jsonb       NOT NULL,
  is_default    boolean     NOT NULL DEFAULT false,
  is_shared     boolean     NOT NULL DEFAULT false,
  CONSTRAINT saved_views_pkey PRIMARY KEY (id),
  CONSTRAINT saved_views_membership_fk
    FOREIGN KEY (tenant_id, membership_id) REFERENCES tenant_memberships (tenant_id, id)
);
CREATE INDEX saved_views_tenant_membership_entity_idx
  ON saved_views (tenant_id, membership_id, entity);

CREATE TABLE customers (
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
  name           jsonb       NOT NULL,
  tax_code       text,
  name_vi_search text,
  name_en_search text,
  CONSTRAINT customers_pkey PRIMARY KEY (id),
  CONSTRAINT customers_tenant_id_key UNIQUE (tenant_id, id)
);

CREATE TABLE products (
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
  name           jsonb       NOT NULL,
  base_uom       text        NOT NULL,
  tracking_type  text        NOT NULL DEFAULT 'NONE',
  cost_price     decimal(18,2),
  name_vi_search text,
  name_en_search text,
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_tenant_id_key UNIQUE (tenant_id, id)
);

-- UNIQUE partial + composite (§4.5, §6.3): xoá mềm rồi tạo lại cùng code OK (test #14)
CREATE UNIQUE INDEX customers_tenant_code_active_key
  ON customers (tenant_id, code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX products_tenant_code_active_key
  ON products (tenant_id, code) WHERE deleted_at IS NULL;

-- Đối soát hệ thống ngoài (§4.5): UNIQUE (tenant, source, external_id) partial
CREATE UNIQUE INDEX customers_external_key
  ON customers (tenant_id, source, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX products_external_key
  ON products (tenant_id, source, external_id) WHERE external_id IS NOT NULL;

-- §3.10: index cho cột search chuẩn hoá tầng ứng dụng —
-- gin+trgm cho contains, btree cho sort (KHÔNG dùng unaccent trong index)
CREATE INDEX products_name_vi_search_trgm ON products USING gin (name_vi_search gin_trgm_ops);
CREATE INDEX products_name_en_search_trgm ON products USING gin (name_en_search gin_trgm_ops);
CREATE INDEX products_name_vi_search_btree ON products (tenant_id, name_vi_search);
CREATE INDEX products_name_en_search_btree ON products (tenant_id, name_en_search);
CREATE INDEX customers_name_vi_search_trgm ON customers USING gin (name_vi_search gin_trgm_ops);
CREATE INDEX customers_name_en_search_trgm ON customers USING gin (name_en_search gin_trgm_ops);

-- Whitelist sort phải có index (§3.4)
CREATE INDEX products_tenant_code_idx ON products (tenant_id, code);
CREATE INDEX products_tenant_created_idx ON products (tenant_id, created_at);
CREATE INDEX products_tenant_cost_idx ON products (tenant_id, cost_price);
