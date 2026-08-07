-- ============================================================================
-- DDL THỦ CÔNG — những gì Prisma schema KHÔNG biểu diễn được.
--
-- Cách dùng: sau khi `prisma migrate dev --create-only` sinh migration đầu,
-- DÁN nội dung file này vào CUỐI migration.sql đó rồi mới `migrate dev`.
-- CI check `migration-contains-manual-ddl` đối chiếu để không ai quên.
--
-- Nguồn: spec §3.10 (search cột), §4.4 (ltree), §4.5 (partial unique),
--        §5B.3/C2 (partition), §6.1 (HYBRID unique)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extension bắt buộc (§2.3). KHÔNG cài unaccent — §3.10 đã chốt.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. UNIQUE partial + composite cho bảng soft delete (§4.5, §6.3)
--    Prisma không hỗ trợ partial index → KHÔNG khai @@unique trong schema,
--    khai ở đây. Xoá mềm rồi tạo lại cùng code phải thành công (test #14).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX org_units_tenant_code_active_key
  ON org_units (tenant_id, code) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX roles_tenant_code_active_key
  ON roles (tenant_id, code) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. HYBRID: NULL không so sánh bằng nhau trong UNIQUE → HAI partial index (§6.1)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX settings_global_key_key
  ON settings (key) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX settings_tenant_key_key
  ON settings (tenant_id, key) WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX feature_flags_global_key_key
  ON feature_flags (key) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX feature_flags_tenant_key_key
  ON feature_flags (tenant_id, key) WHERE tenant_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. org_units.path ltree (§4.4 quyết định #10)
--    Cột thêm bằng SQL vì Unsupported() của Prisma chặn create qua client.
--    Repository tính path trên MỌI đường ghi (cùng nguyên tắc cột *_search §3.10).
-- ---------------------------------------------------------------------------
ALTER TABLE org_units ADD COLUMN path ltree;
CREATE INDEX org_units_path_gist_idx ON org_units USING gist (path);

-- ---------------------------------------------------------------------------
-- 4. audit_logs: PARTITION BY RANGE (created_at), mảnh theo tháng (§5B.3/C2)
--    Prisma sinh CREATE TABLE thường → sửa tay thành partitioned.
--    Trong migration đầu: DROP bảng Prisma sinh ra rồi tạo lại partitioned
--    (an toàn vì bảng còn rỗng ở thời điểm migrate).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS audit_logs;

CREATE TABLE audit_logs (
  id              uuid        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid        NOT NULL,
  entity          text        NOT NULL,
  entity_id       uuid        NOT NULL,
  action          text        NOT NULL,
  actor_id        text,
  actor_name      text,
  on_behalf_of_id uuid,
  before          jsonb,
  after           jsonb,
  ip              text,
  user_agent      text,
  trace_id        text,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX audit_logs_tenant_entity_idx
  ON audit_logs (tenant_id, entity, entity_id, created_at DESC);

-- Mảnh khởi đầu (cron tự tạo mảnh mới trước 1 tháng — job ở GĐ7)
CREATE TABLE audit_logs_2026_08 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_logs_2026_09 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- ---------------------------------------------------------------------------
-- 5. outbox_events: partial index cho claim query (§6.1)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "outbox_events_status_available_at_idx";
CREATE INDEX outbox_events_claim_idx
  ON outbox_events (status, available_at)
  WHERE status IN ('PENDING', 'PROCESSING');
