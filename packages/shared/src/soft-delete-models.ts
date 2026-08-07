/**
 * [CORE] SOFT_DELETE_MODELS — spec §4.5, §12 #46.
 *
 * Soft-delete extension CHỈ áp cho model trong danh sách này. Model không có
 * SoftDeleteFields thì extension không can thiệp — chèn `deletedAt: null` vào
 * "mọi query" sẽ vỡ trên model không có cột đó.
 *
 * Cũng qua kiểm tra vét cạn lúc khởi động (đối chiếu với model thực sự có
 * cột deleted_at trong schema) — giống TENANCY_POLICY.
 */
export const SOFT_DELETE_MODELS = [
  'User',
  'Tenant',
  'OrgUnit',
  'Role',
  'Customer',
  'Product',
  'Order',
] as const;

export type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];

export function isSoftDeleteModel(model: string): model is SoftDeleteModel {
  return (SOFT_DELETE_MODELS as readonly string[]).includes(model);
}

/**
 * Vét cạn: mọi model có cột deleted_at trong schema phải nằm trong danh sách,
 * và ngược lại. `modelsWithDeletedAt` sinh từ schema.prisma ở build-time.
 */
export function assertExhaustiveSoftDeletePolicy(
  modelsWithDeletedAt: readonly string[],
): void {
  const missing = modelsWithDeletedAt.filter((m) => !isSoftDeleteModel(m));
  const has = new Set(modelsWithDeletedAt);
  const stale = SOFT_DELETE_MODELS.filter((m) => !has.has(m));

  const problems: string[] = [];
  if (missing.length > 0) {
    problems.push(
      `Model có deleted_at nhưng chưa vào SOFT_DELETE_MODELS: ${missing.join(', ')}`,
    );
  }
  if (stale.length > 0) {
    problems.push(
      `SOFT_DELETE_MODELS chứa model không có deleted_at: ${stale.join(', ')}`,
    );
  }
  if (problems.length > 0) {
    throw new Error(`[SOFT_DELETE_MODELS] ${problems.join(' | ')}`);
  }
}
