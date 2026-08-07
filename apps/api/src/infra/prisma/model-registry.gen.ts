// ============================================================
// SINH TỰ ĐỘNG từ apps/api/prisma/schema.prisma — KHÔNG SỬA TAY.
// Chạy lại: node tools/checks/gen-model-list.mjs
// ============================================================

/** Toàn bộ model trong schema — nguồn cho assertExhaustiveTenancyPolicy (§4.4b) */
export const ALL_MODELS = [
  "Tenant",
  "TenantDomain",
  "User",
  "Permission",
  "PasswordResetToken",
  "SystemAnnouncement",
  "MaintenanceWindow",
  "Setting",
  "FeatureFlag",
  "TenantMembership",
  "TenantFeature",
  "OrgUnit",
  "Role",
  "RolePermission",
  "UserRole",
  "Session",
  "Invitation",
  "InvitationRole",
  "AuditLog",
  "IdempotencyRequest",
  "OutboxEvent",
  "UserPreference",
  "SavedView",
  "Customer",
  "Product",
  "DocumentSequence",
  "Order",
  "OrderItem",
  "Movement",
  "MovementDedupKey",
  "Warehouse",
  "Lot",
  "StockBalance",
  "InventorySerial",
  "ReconciliationLog",
  "Notification"
] as const;

/** Model có cột deletedAt — nguồn cho assertExhaustiveSoftDeletePolicy (§4.5) */
export const MODELS_WITH_DELETED_AT = [
  "Tenant",
  "User",
  "OrgUnit",
  "Role",
  "Customer",
  "Product",
  "Order",
  "Warehouse",
  "Lot",
  "InventorySerial"
] as const;
