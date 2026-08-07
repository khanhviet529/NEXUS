/**
 * [CORE] Registry cột nhạy cảm — spec §4.4c, permission-matrix §4.
 *
 * MỘT nguồn cho CẢ BỐN nơi phải che:
 *   1. API response      → SerializeInterceptor đọc group từ @Expose
 *   2. Export Excel/CSV  → cột bị loại nếu thiếu field:<group> (GĐ6)
 *   3. Report framework  → như trên (GĐ6b)
 *   4. Audit diff        → AuditRepository che GIÁ TRỊ trước khi ghi
 *
 * Kèm luật §4.4c: whitelist filter/sort phải LOẠI các field này nếu user
 * không được xem (cho sort=salary là để suy ra thứ tự lương).
 */
import type { FieldGroup } from './field-groups';

export const SENSITIVE_FIELDS: Record<string, Record<string, FieldGroup>> = {
  User: {
    salary: 'hr',
    nationalId: 'pii',
  },
  // [REF] GĐ5: Product.costPrice/OrderItem.costPrice/Order.margin → cost,
  // Customer.creditLimit → finance (permission-matrix §4)
};

const MASK = '«đã che»';

/**
 * Che giá trị nhạy cảm trong diff audit — GIỮ KEY để biết field có đổi,
 * che VALUE để không lộ (§4.4c nơi thứ 4).
 */
export function maskSensitive(
  entity: string,
  data: Record<string, unknown> | undefined | null,
): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const fields = SENSITIVE_FIELDS[entity];
  if (!fields) return data;
  const out: Record<string, unknown> = { ...data };
  for (const key of Object.keys(fields)) {
    if (key in out && out[key] !== undefined && out[key] !== null) out[key] = MASK;
  }
  return out;
}

/** Field bị cấm sort/filter khi user thiếu quyền tương ứng (§4.4c) */
export function forbiddenQueryFields(
  entity: string,
  grantedGroups: ReadonlySet<string>,
): string[] {
  const fields = SENSITIVE_FIELDS[entity];
  if (!fields) return [];
  return Object.entries(fields)
    .filter(([, group]) => !grantedGroups.has(group))
    .map(([field]) => field);
}
