/**
 * [CORE] Mã lỗi DOMAIN.REASON + ánh xạ HTTP status — spec §3.6.
 * FE xử lý theo `code`, KHÔNG theo `message`. `message` đổi được bất cứ lúc nào.
 */
export interface ErrorDef {
  status: number;
  message: string;
}

export const ERROR_CODES = {
  // --- COMMON ---
  'COMMON.BAD_REQUEST': { status: 400, message: 'Yêu cầu không hợp lệ' },
  'COMMON.NOT_FOUND': { status: 404, message: 'Không tìm thấy dữ liệu' },
  'COMMON.VALIDATION_FAILED': { status: 422, message: 'Dữ liệu không hợp lệ' },
  'COMMON.VERSION_CONFLICT': {
    status: 409,
    message: 'Bản ghi đã được người khác sửa, vui lòng tải lại',
  },
  'COMMON.RATE_LIMITED': { status: 429, message: 'Thao tác quá nhanh, vui lòng thử lại sau' },
  'COMMON.INTERNAL_ERROR': { status: 500, message: 'Lỗi hệ thống' },
  'COMMON.HAS_REFERENCES': { status: 409, message: 'Không thể xoá vì đang được sử dụng' },
  'COMMON.IDEMPOTENCY_IN_PROGRESS': {
    status: 409,
    message: 'Yêu cầu trước đó đang được xử lý, vui lòng chờ',
  },
  'COMMON.IDEMPOTENCY_KEY_REUSED': {
    status: 409,
    message: 'Idempotency key đã được dùng cho nội dung khác',
  },

  // --- AUTH ---
  'AUTH.UNAUTHENTICATED': { status: 401, message: 'Chưa đăng nhập' },
  'AUTH.TOKEN_EXPIRED': { status: 401, message: 'Phiên đã hết hạn' },
  'AUTH.FORBIDDEN': { status: 403, message: 'Không có quyền thực hiện thao tác này' },
  'AUTH.INVALID_CREDENTIALS': { status: 401, message: 'Email hoặc mật khẩu không đúng' },
  'AUTH.ACCOUNT_LOCKED': { status: 401, message: 'Tài khoản tạm khoá do đăng nhập sai nhiều lần' },
  'AUTH.ACCOUNT_DISABLED': { status: 401, message: 'Tài khoản đã bị vô hiệu hoá' },
  'AUTH.CSRF_FAILED': { status: 403, message: 'Xác thực CSRF thất bại' },
  'AUTH.SELF_GRANT_FORBIDDEN': {
    status: 403,
    message: 'Không thể tự cấp quyền cho chính mình',
  },
  'AUTH.TENANT_MEMBERSHIP_REQUIRED': {
    status: 403,
    message: 'Bạn không phải thành viên của đơn vị này',
  },
  'AUTH.DUAL_TRANSPORT': {
    status: 400,
    message: 'Không được dùng đồng thời cookie và Bearer token',
  },

  // --- TENANT ---
  'TENANT.SUSPENDED': { status: 403, message: 'Đơn vị đang bị tạm khoá' },
  'TENANT.NOT_FOUND': { status: 404, message: 'Không tìm thấy đơn vị' },
} as const satisfies Record<string, ErrorDef>;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Hình dạng lỗi thống nhất trả về cho FE — spec §3.6 */
export interface ApiErrorBody {
  code: ErrorCode | string;
  message: string;
  details: Record<string, string[]> | Record<string, unknown> | null;
  traceId: string;
  timestamp: string;
}
