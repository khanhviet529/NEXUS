/**
 * [CORE] Permission registry — spec §4.4.
 * Khai báo trong code, tự sync xuống bảng `permissions` lúc API khởi động.
 * Không seed tay, không sửa trực tiếp DB.
 *
 * GĐ1 chỉ cần nhóm auth/tenant tối thiểu; các nhóm sau bổ sung theo giai đoạn
 * (nguồn: docs/permission-matrix.md).
 */
export interface PermissionDef {
  code: string; // resource:action
  resource: string;
  action: string;
  description?: string;
}

function p(resource: string, action: string, description?: string): PermissionDef {
  return { code: `${resource}:${action}`, resource, action, description };
}

export const PERMISSIONS: readonly PermissionDef[] = [
  // --- users (GĐ3 dùng, khai sớm để ma trận quyền có chỗ trỏ) ---
  p('user', 'read'),
  p('user', 'invite'),
  p('user', 'update'),
  p('user', 'disable'),
  p('user', 'unlock'),
  p('user', 'transfer'),
  p('user', 'offboard'),
  p('user', 'assign_role'),
  p('user_session', 'read'),
  p('user_session', 'revoke'),

  // --- roles ---
  p('role', 'read'),
  p('role', 'create'),
  p('role', 'update'),
  p('role', 'delete'),
  p('permission', 'read'),

  // --- org units ---
  p('org_unit', 'read'),
  p('org_unit', 'create'),
  p('org_unit', 'update'),
  p('org_unit', 'delete'),

  // --- settings / audit / files ---
  p('setting', 'read'),
  p('setting', 'update'),
  p('audit', 'read'),
  p('file', 'upload'),

  // --- tenant (trong tenant hiện hành) ---
  p('tenant', 'read'),
  p('tenant', 'update'),

  // --- field-level serializer groups (spec §4.4c, permission-matrix §4) ---
  // Cột nhạy cảm gắn @Expose({ groups: ['hr'|'pii'|'cost'|'finance'] });
  // SerializeInterceptor mở group khi user có permission tương ứng.
  p('field', 'hr', 'Xem cột nhân sự nhạy cảm (lương…)'),
  p('field', 'pii', 'Xem định danh cá nhân (CCCD…)'),
  p('field', 'cost', 'Xem giá vốn / margin'),
  p('field', 'finance', 'Xem hạn mức tín dụng, tài chính'),

  // --- sysadmin, xuyên tenant (spec §3.1b, §4.4b) ---
  p('system', 'cross_tenant', 'Bắt buộc cho mọi endpoint /admin/*'),
  p('system_tenant', 'read'),
  p('system_tenant', 'create'),
  p('system_tenant', 'suspend'),
  p('system_tenant', 'features'),
  p('system', 'impersonate'),
  p('system_queue', 'read'),
  p('system', 'maintenance'),
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];

export const PERMISSION_SCOPES = ['own', 'department', 'descendants', 'all'] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];
