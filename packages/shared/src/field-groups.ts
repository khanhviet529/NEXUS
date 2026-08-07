/**
 * [CORE] Ánh xạ serializer group → permission — spec §4.4c, permission-matrix §4.
 *
 * DTO gắn @Expose({ groups: ['cost'] }); SerializeInterceptor mở group khi
 * user có permission tương ứng. Áp ở CẢ BỐN nơi: API response, export,
 * report, audit diff.
 */
export const FIELD_GROUPS = {
  hr: 'field:hr',
  pii: 'field:pii',
  cost: 'field:cost',
  finance: 'field:finance',
} as const;

export type FieldGroup = keyof typeof FIELD_GROUPS;

/** Từ tập permission của user → danh sách group được mở */
export function resolveFieldGroups(permissionCodes: ReadonlySet<string>): FieldGroup[] {
  return (Object.keys(FIELD_GROUPS) as FieldGroup[]).filter((g) =>
    permissionCodes.has(FIELD_GROUPS[g]),
  );
}
