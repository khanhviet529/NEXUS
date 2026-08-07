/**
 * 5 vai trò SEED — permission-matrix.md §1, spec §12 #61.
 *
 * Đây là DỮ LIỆU SEED, không phải mô hình. Vai trò nghiệp vụ (Kế toán,
 * Thủ kho…) do tenant tự cấu hình trên UI.
 *
 * LUẬT CỨNG: cấm mọi so sánh chuỗi với các mã này trong code nghiệp vụ
 * (apps/api/src, apps/web/src) — CI check `no-role-branching` quét và chặn,
 * chỉ cho phép trong file seed và file này.
 */
export const SEED_ROLES = {
  SYSADMIN: 'SYSADMIN',
  TENANT_ADMIN: 'TENANT_ADMIN',
  MANAGER: 'MANAGER',
  STAFF: 'STAFF',
  VIEWER: 'VIEWER',
} as const;

export type SeedRole = (typeof SEED_ROLES)[keyof typeof SEED_ROLES];

/**
 * Quyền của bộ vai trò seed — rút từ docs/permission-matrix.md §2.
 * Dùng ở HAI nơi: prisma/seed.ts và TenantProvisionService (tạo tenant mới
 * kèm seed dữ liệu khởi tạo §5C.1). 'ALL' = mọi permission trong registry.
 */
export const SEED_ROLE_PERMISSIONS: Record<
  SeedRole,
  'ALL' | Array<{ code: string; scope: string }>
> = {
  [SEED_ROLES.SYSADMIN]: 'ALL',
  [SEED_ROLES.TENANT_ADMIN]: [
    { code: 'user:read', scope: 'all' },
    { code: 'user:invite', scope: 'all' },
    { code: 'user:update', scope: 'all' },
    { code: 'user:disable', scope: 'all' },
    { code: 'user:unlock', scope: 'all' },
    { code: 'user:transfer', scope: 'all' },
    { code: 'user:offboard', scope: 'all' },
    { code: 'user:assign_role', scope: 'all' },
    { code: 'user_session:read', scope: 'all' },
    { code: 'user_session:revoke', scope: 'all' },
    { code: 'role:read', scope: 'all' },
    { code: 'role:create', scope: 'all' },
    { code: 'role:update', scope: 'all' },
    { code: 'role:delete', scope: 'all' },
    { code: 'permission:read', scope: 'all' },
    { code: 'org_unit:read', scope: 'all' },
    { code: 'org_unit:create', scope: 'all' },
    { code: 'org_unit:update', scope: 'all' },
    { code: 'org_unit:delete', scope: 'all' },
    { code: 'setting:read', scope: 'all' },
    { code: 'setting:update', scope: 'all' },
    { code: 'audit:read', scope: 'all' },
    { code: 'file:upload', scope: 'all' },
    { code: 'tenant:read', scope: 'all' },
    { code: 'tenant:update', scope: 'all' },
    { code: 'order:read', scope: 'all' },
    { code: 'order:create', scope: 'all' },
    { code: 'order:update', scope: 'all' },
    { code: 'order:delete', scope: 'all' },
    { code: 'order:submit', scope: 'all' },
    { code: 'order:approve', scope: 'all' },
    { code: 'order:export', scope: 'all' },
    { code: 'order:import', scope: 'all' },
    { code: 'product:read', scope: 'all' },
    { code: 'product:create', scope: 'all' },
    { code: 'product:update', scope: 'all' },
    { code: 'product:delete', scope: 'all' },
    { code: 'customer:read', scope: 'all' },
    { code: 'customer:create', scope: 'all' },
    { code: 'customer:update', scope: 'all' },
    { code: 'customer:delete', scope: 'all' },
    { code: 'field:hr', scope: 'all' },
    { code: 'field:pii', scope: 'all' },
    { code: 'field:cost', scope: 'all' },
    { code: 'field:finance', scope: 'all' },
  ],
  [SEED_ROLES.MANAGER]: [
    { code: 'user:read', scope: 'descendants' },
    { code: 'user:invite', scope: 'descendants' },
    { code: 'user:update', scope: 'descendants' },
    { code: 'user_session:read', scope: 'descendants' },
    { code: 'role:read', scope: 'all' },
    { code: 'permission:read', scope: 'all' },
    { code: 'org_unit:read', scope: 'all' },
    { code: 'setting:read', scope: 'all' },
    { code: 'audit:read', scope: 'descendants' },
    { code: 'file:upload', scope: 'descendants' },
    { code: 'order:read', scope: 'descendants' },
    { code: 'order:create', scope: 'descendants' },
    { code: 'order:update', scope: 'descendants' },
    { code: 'order:delete', scope: 'descendants' },
    { code: 'order:submit', scope: 'descendants' },
    { code: 'order:approve', scope: 'descendants' },
    { code: 'order:export', scope: 'descendants' },
    { code: 'order:import', scope: 'descendants' },
    { code: 'product:read', scope: 'all' },
    { code: 'product:create', scope: 'all' },
    { code: 'product:update', scope: 'all' },
    { code: 'customer:read', scope: 'all' },
    { code: 'customer:create', scope: 'all' },
    { code: 'customer:update', scope: 'all' },
    { code: 'field:cost', scope: 'all' },
    { code: 'field:finance', scope: 'all' },
  ],
  [SEED_ROLES.STAFF]: [
    { code: 'user:read', scope: 'department' },
    { code: 'user_session:read', scope: 'own' },
    { code: 'user_session:revoke', scope: 'own' },
    { code: 'org_unit:read', scope: 'all' },
    { code: 'file:upload', scope: 'own' },
    { code: 'order:read', scope: 'own' },
    { code: 'order:create', scope: 'own' },
    { code: 'order:update', scope: 'own' },
    { code: 'order:submit', scope: 'own' },
    { code: 'order:export', scope: 'own' },
    { code: 'product:read', scope: 'all' },
    { code: 'customer:read', scope: 'all' },
  ],
  [SEED_ROLES.VIEWER]: [
    { code: 'user:read', scope: 'all' },
    { code: 'role:read', scope: 'all' },
    { code: 'permission:read', scope: 'all' },
    { code: 'org_unit:read', scope: 'all' },
    { code: 'setting:read', scope: 'all' },
    { code: 'audit:read', scope: 'all' },
    { code: 'order:read', scope: 'all' },
    { code: 'order:export', scope: 'all' },
    { code: 'product:read', scope: 'all' },
    { code: 'customer:read', scope: 'all' },
    { code: 'field:cost', scope: 'all' },
    { code: 'field:finance', scope: 'all' },
  ],
};
