-- ============================================================================
-- GĐ3b — spec §4.9 luật 2: nhóm security-critical có DB TRIGGER audit riêng,
-- ĐỘC LẬP với tầng ứng dụng. Sửa lén 7 bảng này (kể cả psql trực tiếp) vẫn
-- để lại dấu vết trong audit_logs.
--
-- 7 bảng (tham chiếu BẰNG TÊN theo spec): users, roles, role_permissions,
-- user_roles, tenant_memberships, org_units, settings
-- + tenants (GĐ3b động tới trạng thái tenant — thêm có chủ đích, thuộc nhóm
--   "Đổi setting, role, permission" của bảng phạm vi audit §4.9)
-- ============================================================================

-- Branding cho tenant (§5C.1: logo, tên hệ thống, màu chủ đạo)
ALTER TABLE tenants ADD COLUMN branding jsonb;

-- ----------------------------------------------------------------------------
-- Hàm trigger chung. Ghi vào audit_logs với action DB_INSERT/DB_UPDATE/DB_DELETE.
-- - tenant_id: lấy từ row; bảng GLOBAL (users, settings dòng global) → uuid 0
-- - CHE cột nhạy cảm trước khi ghi (§4.4c nơi 4 + §4.9 redact):
--   password_hash, salary, national_id
-- - actor: đọc từ setting phiên app.actor_id nếu tầng ứng dụng có set;
--   sửa trực tiếp ngoài ứng dụng → 'db:direct' — chính là dấu vết cần bắt
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION security_audit_trigger_fn() RETURNS trigger AS $$
DECLARE
  v_row jsonb;
  v_old jsonb;
  v_new jsonb;
  v_tenant uuid;
  v_entity_id uuid;
BEGIN
  v_row := COALESCE(to_jsonb(NEW), to_jsonb(OLD));
  v_tenant := COALESCE((v_row->>'tenant_id')::uuid,
                       '00000000-0000-0000-0000-000000000000'::uuid);
  v_entity_id := (v_row->>'id')::uuid;

  v_old := CASE WHEN TG_OP IN ('UPDATE','DELETE')
                THEN to_jsonb(OLD) - 'password_hash' - 'salary' - 'national_id' END;
  v_new := CASE WHEN TG_OP IN ('INSERT','UPDATE')
                THEN to_jsonb(NEW) - 'password_hash' - 'salary' - 'national_id' END;

  INSERT INTO audit_logs
    (id, created_at, tenant_id, entity, entity_id, action, actor_id, before, after, trace_id)
  VALUES
    (gen_random_uuid(), now(), v_tenant, TG_TABLE_NAME, v_entity_id,
     'DB_' || TG_OP,
     COALESCE(NULLIF(current_setting('app.actor_id', true), ''), 'db:direct'),
     v_old, v_new,
     NULLIF(current_setting('app.trace_id', true), ''));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 7 bảng security-critical (§4.9) + tenants
CREATE TRIGGER trg_audit_users            AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION security_audit_trigger_fn();
CREATE TRIGGER trg_audit_roles            AFTER INSERT OR UPDATE OR DELETE ON roles
  FOR EACH ROW EXECUTE FUNCTION security_audit_trigger_fn();
CREATE TRIGGER trg_audit_role_permissions AFTER INSERT OR UPDATE OR DELETE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION security_audit_trigger_fn();
CREATE TRIGGER trg_audit_user_roles       AFTER INSERT OR UPDATE OR DELETE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION security_audit_trigger_fn();
CREATE TRIGGER trg_audit_memberships      AFTER INSERT OR UPDATE OR DELETE ON tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION security_audit_trigger_fn();
CREATE TRIGGER trg_audit_org_units        AFTER INSERT OR UPDATE OR DELETE ON org_units
  FOR EACH ROW EXECUTE FUNCTION security_audit_trigger_fn();
CREATE TRIGGER trg_audit_settings         AFTER INSERT OR UPDATE OR DELETE ON settings
  FOR EACH ROW EXECUTE FUNCTION security_audit_trigger_fn();
CREATE TRIGGER trg_audit_tenants          AFTER INSERT OR UPDATE OR DELETE ON tenants
  FOR EACH ROW EXECUTE FUNCTION security_audit_trigger_fn();

-- Mảnh partition audit_logs tới hết 2027-01 (cron tự tạo tiếp — GĐ7)
CREATE TABLE IF NOT EXISTS audit_logs_2026_10 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS audit_logs_2026_11 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS audit_logs_2026_12 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS audit_logs_2027_01 PARTITION OF audit_logs
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
