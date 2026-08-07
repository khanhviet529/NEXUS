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
