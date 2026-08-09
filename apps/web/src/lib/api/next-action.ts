import type { NextActionCode } from '@nexus/shared';

/**
 * [CORE] Map MÃ ngữ nghĩa từ BE → NHÃN + ROUTE của FE (§3.6).
 *
 * Ranh giới: BE chỉ nói "còn cách nào đi tiếp" (`nextAction`), FE quyết định
 * gọi nó là gì và dẫn đi đâu. Nhờ vậy đổi từ ngữ hay thêm tiếng Anh KHÔNG
 * phải deploy lại backend, và cùng một mã dẫn tới màn hình khác nhau tuỳ
 * ngữ cảnh (ví dụ CREATE_ADJUSTMENT: từ trang kho đi tới phiếu điều chỉnh
 * kho, từ trang công nợ đi tới bút toán điều chỉnh).
 */
export interface NextActionUi {
  /** Chữ trên nút — ĐỘNG TỪ, nói rõ việc sẽ xảy ra */
  label: string;
  /** Đường dẫn; undefined = hành động tại chỗ (vd tải lại) */
  href?: string;
  /** Hành động tại chỗ thay vì điều hướng */
  kind: 'navigate' | 'reload' | 'dismiss';
}

/** Ngữ cảnh để cùng một mã dẫn tới màn hình phù hợp */
export interface NextActionContext {
  /** Module đang đứng, vd 'inventory' | 'orders' | 'customers' */
  module?: string;
  entityId?: string;
}

const BASE: Record<NextActionCode, NextActionUi> = {
  RELOAD_RECORD: { label: 'Tải lại bản ghi', kind: 'reload' },
  RETRY_LATER: { label: 'Đã hiểu', kind: 'dismiss' },
  CREATE_ADJUSTMENT: { label: 'Lập phiếu điều chỉnh', kind: 'navigate', href: '/inventory/adjustments/new' },
  REQUEST_HIGHER_APPROVAL: { label: 'Xem ai đủ thẩm quyền', kind: 'navigate', href: '/approval-authorities' },
  CONTACT_ADMIN: { label: 'Liên hệ quản trị', kind: 'navigate', href: '/users?role=TENANT_ADMIN' },
  REVIEW_INPUT: { label: 'Kiểm tra lại dữ liệu', kind: 'dismiss' },
  WAIT_IN_PROGRESS: { label: 'Đã hiểu', kind: 'dismiss' },
};

/** Ghi đè theo module — cùng mã, đích khác nhau */
const BY_MODULE: Partial<Record<string, Partial<Record<NextActionCode, NextActionUi>>>> = {
  orders: {
    CREATE_ADJUSTMENT: {
      label: 'Kiểm tra tồn kho',
      kind: 'navigate',
      href: '/inventory/stock',
    },
  },
};

export function resolveNextAction(
  code: NextActionCode | undefined,
  ctx: NextActionContext = {},
): NextActionUi | null {
  if (!code) return null;
  const override = ctx.module ? BY_MODULE[ctx.module]?.[code] : undefined;
  return override ?? BASE[code] ?? null;
}
