/**
 * [CORE] TENANCY_POLICY — spec §4.4b, §6.4, §6.5.
 *
 * MỌI model trong schema.prisma phải được phân loại vào đúng MỘT nhóm:
 *   GLOBAL  → extension KHÔNG inject tenant
 *   HYBRID  → where: tenant_id = current OR tenant_id IS NULL (ưu tiên dòng có tenant)
 *             Chỉ đúng HAI bảng: Setting, FeatureFlag. KHÔNG mở rộng nhóm này.
 *   TENANT  → mặc định, BẮT BUỘC inject tenant_id
 *
 * `assertExhaustiveTenancyPolicy()` chạy lúc API khởi động + trong CI:
 * thêm model mới mà quên phân loại → app KHÔNG khởi động được (spec §4.4b:
 * "biến sai sót thành bất khả thi, không phải nhớ đừng quên").
 *
 * Nguồn sự thật về phân loại: ma trận spec §6.5. Check #3 của working-agreement
 * §4.1 đối chiếu file này ↔ schema.prisma ↔ ma trận.
 */
export const TENANCY_POLICY = {
  /** Không inject tenant */
  GLOBAL: [
    'User',
    'Permission',
    'Tenant',
    'TenantDomain',
    'PasswordResetToken',
    'SystemAnnouncement',
    'MaintenanceWindow',
  ],
  /** tenant_id NULL = mặc định toàn hệ thống. KHÔNG thêm bảng nào khác vào đây */
  HYBRID: ['Setting', 'FeatureFlag'],
  /** Mọi model còn lại phải nằm ở đây — liệt kê tường minh để vét cạn được */
  TENANT: [
    'TenantMembership',
    'TenantFeature',
    'OrgUnit',
    'Role',
    'RolePermission',
    'UserRole',
    'Session',
    'Invitation',
    'InvitationRole',
    'AuditLog',
    'IdempotencyRequest',
    'OutboxEvent',
    'DocumentSequence',
    'UserPreference',
    'SavedView',
    'Customer',
    'Product',
    'Order',
    'OrderItem',
    'Notification',
    'Movement',
    'MovementDedupKey',
    'Warehouse',
    'Lot',
    'StockBalance',
    'InventorySerial',
    'ReconciliationLog',
  ],
} as const;

export type TenancyClass = keyof typeof TENANCY_POLICY;

/** Model → nhóm tenancy; undefined = CHƯA PHÂN LOẠI (lỗi phải chặn) */
export function classifyTenancy(model: string): TenancyClass | undefined {
  if ((TENANCY_POLICY.GLOBAL as readonly string[]).includes(model)) return 'GLOBAL';
  if ((TENANCY_POLICY.HYBRID as readonly string[]).includes(model)) return 'HYBRID';
  if ((TENANCY_POLICY.TENANT as readonly string[]).includes(model)) return 'TENANT';
  return undefined;
}

/**
 * Kiểm tra vét cạn — crash nếu có model chưa phân loại HOẶC phân loại thừa.
 * `allModels` lấy từ build-time codegen (tools/checks/gen-model-list.mjs đọc
 * schema.prisma), KHÔNG phụ thuộc API nội bộ Prisma (spec §12 #57).
 */
export function assertExhaustiveTenancyPolicy(allModels: readonly string[]): void {
  const unclassified = allModels.filter((m) => classifyTenancy(m) === undefined);
  const known = new Set(allModels);
  const stale = [
    ...TENANCY_POLICY.GLOBAL,
    ...TENANCY_POLICY.HYBRID,
    ...TENANCY_POLICY.TENANT,
  ].filter((m) => !known.has(m));

  const problems: string[] = [];
  if (unclassified.length > 0) {
    problems.push(
      `Model CHƯA phân loại tenancy: ${unclassified.join(', ')} — thêm vào TENANCY_POLICY (packages/shared/src/tenancy-policy.ts) và ma trận spec §6.5`,
    );
  }
  if (stale.length > 0) {
    problems.push(
      `TENANCY_POLICY chứa model không tồn tại trong schema: ${stale.join(', ')} — xoá dòng thừa`,
    );
  }
  if (problems.length > 0) {
    throw new Error(`[TENANCY_POLICY] ${problems.join(' | ')}`);
  }
}
