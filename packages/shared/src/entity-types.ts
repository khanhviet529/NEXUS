/**
 * [CORE] Enum EntityType cho MỌI quan hệ đa hình — erd.md §3, việc cần làm #5.
 *
 * audit_logs, attachments, comments, entity_subscriptions, saved_views,
 * recent_items, favorite_items dùng cặp (entity, entity_id) không có FK,
 * nên tên entity phải là hằng khai báo ở đây — không bao giờ là chuỗi tự do.
 */
export const ENTITY_TYPES = {
  TENANT: 'Tenant',
  USER: 'User',
  TENANT_MEMBERSHIP: 'TenantMembership',
  ORG_UNIT: 'OrgUnit',
  ROLE: 'Role',
  FILE: 'File',
  // [REF] module mẫu
  ORDER: 'Order',
  CUSTOMER: 'Customer',
  PRODUCT: 'Product',
} as const;

export type EntityType = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];

export const ALL_ENTITY_TYPES: readonly EntityType[] = Object.values(ENTITY_TYPES);

export function isEntityType(v: string): v is EntityType {
  return (ALL_ENTITY_TYPES as readonly string[]).includes(v);
}
