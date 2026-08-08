/**
 * [CORE] Tên hành động audit cho timeline — spec §4.9, ADR-0004.
 *
 * REGISTRY ĐÓNG: `AuditEntry.action` có kiểu `AuditAction` nên chuỗi tự do
 * KHÔNG biên dịch được. Lý do (ADR-0004): timeline trên trang chi tiết phải
 * đọc được — chuỗi `UPDATE, UPDATE, UPDATE` là vô dụng với người dùng nghiệp
 * vụ, họ cần thấy `Gửi duyệt`, `Duyệt`. Extension chỉ thấy OPERATION của
 * Prisma, không thấy Ý ĐỊNH nghiệp vụ; đó là lý do chính giữ audit tường minh.
 *
 * Thêm action mới: khai ở đây TRƯỚC, không truyền chuỗi thẳng vào write().
 */
export const AUDIT_ACTIONS = {
  // --- CRUD chung ---
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  RESTORE: 'RESTORE',
  // --- Bảo mật / phiên (GĐ2) ---
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  SESSION_REVOKED: 'SESSION_REVOKED',
  TOKEN_REUSE_DETECTED: 'TOKEN_REUSE_DETECTED',
  /** Sysadmin truy cập chéo tenant — BẮT BUỘC mỗi lần, spec §3.1b */
  CROSS_TENANT_ACCESS: 'CROSS_TENANT_ACCESS',
  IMPERSONATION_START: 'IMPERSONATION_START',
  IMPERSONATION_END: 'IMPERSONATION_END',
  // --- Vòng đời chứng từ (§4.7 state machine) — TIMELINE ĐỌC ĐƯỢC ---
  SUBMIT: 'SUBMIT',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  CANCEL: 'CANCEL',
  // --- Quản trị tenant (§5C.1) ---
  CREATE_TENANT: 'CREATE_TENANT',
  SUSPEND_TENANT: 'SUSPEND_TENANT',
  ACTIVATE_TENANT: 'ACTIVATE_TENANT',
  SET_FEATURES: 'SET_FEATURES',
  // --- Vận hành (§5C.8) + import/webhook ---
  CACHE_CLEARED: 'CACHE_CLEARED',
  QUEUE_RETRY_FAILED: 'QUEUE_RETRY_FAILED',
  IMPORT_COMPLETED: 'IMPORT_COMPLETED',
  SECRET_ROTATED: 'SECRET_ROTATED',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** Map action → nhãn tiếng Việt cho timeline FE (§4.9) */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: 'Tạo mới',
  UPDATE: 'Cập nhật',
  DELETE: 'Xoá',
  RESTORE: 'Khôi phục',
  LOGIN: 'Đăng nhập',
  LOGOUT: 'Đăng xuất',
  LOGIN_FAILED: 'Đăng nhập thất bại',
  PASSWORD_RESET: 'Đặt lại mật khẩu',
  SESSION_REVOKED: 'Thu hồi phiên',
  TOKEN_REUSE_DETECTED: 'Phát hiện tái sử dụng token',
  CROSS_TENANT_ACCESS: 'Truy cập chéo tenant',
  IMPERSONATION_START: 'Bắt đầu đóng vai',
  IMPERSONATION_END: 'Kết thúc đóng vai',
  SUBMIT: 'Gửi duyệt',
  APPROVE: 'Duyệt',
  REJECT: 'Từ chối',
  CANCEL: 'Huỷ',
  CREATE_TENANT: 'Tạo tenant',
  SUSPEND_TENANT: 'Đình chỉ tenant',
  ACTIVATE_TENANT: 'Kích hoạt tenant',
  SET_FEATURES: 'Đổi tính năng tenant',
  CACHE_CLEARED: 'Xoá cache',
  QUEUE_RETRY_FAILED: 'Retry job lỗi',
  IMPORT_COMPLETED: 'Nhập dữ liệu xong',
  SECRET_ROTATED: 'Xoay secret',
};
