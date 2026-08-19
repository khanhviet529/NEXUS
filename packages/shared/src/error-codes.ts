/**
 * [CORE] Mã lỗi DOMAIN.REASON + ánh xạ HTTP status — spec §3.6.
 * FE xử lý theo `code`, KHÔNG theo `message`. `message` đổi được bất cứ lúc nào.
 */
export interface ErrorDef {
  status: number;
  message: string;
  /**
   * Việc NGƯỜI DÙNG nên làm tiếp — dạng MÃ NGỮ NGHĨA, không phải chuỗi hiển
   * thị. BE nói "còn cách nào đi tiếp", FE quyết định gọi nó là gì và dẫn đi
   * đâu (nhãn + route nằm ở apps/web/src/lib/api/next-action.ts).
   *
   * Vì sao không nhét chuỗi hiển thị vào BE: chuỗi là trình bày — đổi từ ngữ
   * hay dịch sang tiếng Anh sẽ phải deploy lại backend, và cùng một mã có thể
   * dẫn tới màn hình khác nhau tuỳ ngữ cảnh FE.
   */
  nextAction?: NextActionCode;
}

/**
 * Hành động tiếp theo — ĐÓNG, khai ở đây trước khi dùng.
 * Đặt tên theo VIỆC NGHIỆP VỤ, không theo thao tác giao diện:
 * 'CREATE_ADJUSTMENT' (lập phiếu điều chỉnh) chứ không phải 'OPEN_DIALOG'.
 */
export const NEXT_ACTION_CODES = [
  'RELOAD_RECORD', // bản ghi đã đổi — tải lại rồi thao tác lại
  'RETRY_LATER', // tạm thời — thử lại sau
  'CREATE_ADJUSTMENT', // số dư/tồn kho lệch — lập bút toán/phiếu điều chỉnh
  'REQUEST_HIGHER_APPROVAL', // vượt hạn mức — chuyển người có thẩm quyền cao hơn
  'CONTACT_ADMIN', // cần quản trị tenant can thiệp (quyền, cấu hình)
  'REVIEW_INPUT', // dữ liệu nhập sai — sửa rồi gửi lại
  'WAIT_IN_PROGRESS', // việc trước đang chạy — chờ xong
] as const;

export type NextActionCode = (typeof NEXT_ACTION_CODES)[number];

export const ERROR_CODES = {
  // --- COMMON ---
  'COMMON.BAD_REQUEST': { status: 400, message: 'Yêu cầu không hợp lệ' },
  'COMMON.NOT_FOUND': { status: 404, message: 'Không tìm thấy dữ liệu' },
  'COMMON.VALIDATION_FAILED': {
    status: 422,
    message: 'Dữ liệu không hợp lệ',
    nextAction: 'REVIEW_INPUT',
  },
  'COMMON.VERSION_CONFLICT': {
    status: 409,
    message: 'Bản ghi đã được người khác sửa, vui lòng tải lại',
    nextAction: 'RELOAD_RECORD',
  },
  'COMMON.RATE_LIMITED': {
    status: 429,
    message: 'Thao tác quá nhanh, vui lòng thử lại sau',
    nextAction: 'RETRY_LATER',
  },
  'COMMON.INTERNAL_ERROR': { status: 500, message: 'Lỗi hệ thống' },
  'COMMON.HAS_REFERENCES': { status: 409, message: 'Không thể xoá vì đang được sử dụng' },
  'COMMON.IDEMPOTENCY_IN_PROGRESS': {
    status: 409,
    message: 'Yêu cầu trước đó đang được xử lý, vui lòng chờ',
    nextAction: 'WAIT_IN_PROGRESS',
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

  // --- ORDER ([REF] — khuôn cho mọi chứng từ, permission-matrix §3.1) ---
  'ORDER.NOT_EDITABLE': { status: 409, message: 'Chỉ sửa được đơn ở trạng thái nháp hoặc bị từ chối' },
  'ORDER.NOT_DELETABLE': { status: 409, message: 'Chỉ xoá được đơn ở trạng thái nháp' },
  'ORDER.INVALID_TRANSITION': { status: 409, message: 'Chuyển trạng thái không hợp lệ' },
  'ORDER.ALREADY_APPROVED': { status: 409, message: 'Đơn hàng đã được duyệt, không thể sửa' },
  'ORDER.SELF_APPROVAL': { status: 409, message: 'Không thể tự duyệt đơn mình tạo' },
  'ORDER.EMPTY_ITEMS': { status: 422, message: 'Đơn hàng phải có ít nhất một dòng' },
  // GĐ10 — hạn mức duyệt §5C.12 (matrix §3.1). Fail-closed: không khớp dòng nào = KHÔNG duyệt
  'ORDER.EXCEEDS_LIMIT': {
    status: 409,
    message: 'Giá trị đơn vượt hạn mức duyệt của bạn',
    nextAction: 'REQUEST_HIGHER_APPROVAL',
  },
  'ORDER.NO_APPROVAL_AUTHORITY': {
    status: 409,
    message: 'Bạn chưa được cấp hạn mức duyệt cho loại chứng từ này',
    nextAction: 'CONTACT_ADMIN',
  },

  // --- STOCK (GĐ5b) ---
  'STOCK.INSUFFICIENT': {
    status: 409,
    message: 'Không đủ tồn kho khả dụng',
    nextAction: 'CREATE_ADJUSTMENT',
  },

  // --- TENANT ---
  'TENANT.SUSPENDED': { status: 403, message: 'Đơn vị đang bị tạm khoá' },
  'TENANT.NOT_FOUND': { status: 404, message: 'Không tìm thấy đơn vị' },

  // --- ROLE (F10 của C1) ---
  'ROLE.CODE_EXISTS': {
    status: 409,
    message: 'Mã vai trò đã tồn tại trong đơn vị',
    nextAction: 'REVIEW_INPUT',
  },
} as const satisfies Record<string, ErrorDef>;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Hình dạng lỗi thống nhất trả về cho FE — spec §3.6 */
export interface ApiErrorBody {
  code: ErrorCode | string;
  message: string;
  details: Record<string, string[]> | Record<string, unknown> | null;
  /** Mã ngữ nghĩa việc nên làm tiếp — FE map sang nhãn + route (§3.6) */
  nextAction?: NextActionCode;
  traceId: string;
  timestamp: string;
}

/** Tra nextAction của một mã lỗi — dùng ở cả BE (filter) lẫn FE (fallback) */
export function nextActionOf(code: string): NextActionCode | undefined {
  return (ERROR_CODES as Record<string, ErrorDef | undefined>)[code]?.nextAction;
}
