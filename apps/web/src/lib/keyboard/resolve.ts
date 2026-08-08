/**
 * [CORE] Hành vi bàn phím THEO PATTERN — không phải luật global.
 *
 * Lý do tách riêng file thuần (không chạm DOM): đây là phần DỄ SAI và
 * ĐÁNG TEST nhất. Bug kinh điển: trong bảng chi tiết chứng từ, người nhập
 * liệu gõ tới ô cuối rồi bấm Enter theo phản xạ Excel → form submit với MỘT
 * dòng. Người dùng không bao giờ báo bug này, họ chỉ kết luận phần mềm khó dùng.
 *
 * Hàm resolveKeyAction là thuần: (profile, mô tả phím) → hành động.
 * Hook use-form-keyboard chỉ làm phần nối DOM.
 */

export type KeyboardProfile =
  /** Bảng dòng chứng từ: Enter đi ô kế, Ctrl+Enter mới submit */
  | 'data-entry'
  /** Form ngắn ≤5 field, login: Enter submit như thói quen web */
  | 'standard'
  /** Ô tìm kiếm / select: Enter = chọn hoặc tìm */
  | 'search';

/** Loại phần tử đang focus — quyết định Enter có ý nghĩa gì */
export type KeyTargetKind = 'text-input' | 'textarea' | 'button' | 'select' | 'other';

export interface KeyEventDescriptor {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: KeyTargetKind;
  /** Đang ở trong bảng dòng (data-entry) không */
  inGrid?: boolean;
  /** Ô đang focus có phải ô CUỐI của dòng CUỐI không */
  isLastCell?: boolean;
  /** Ô đang có giá trị bị sửa dở (để Esc có gì mà huỷ) */
  isDirtyCell?: boolean;
}

export type KeyAction =
  /** Không can thiệp — để trình duyệt xử lý mặc định */
  | { type: 'none' }
  | { type: 'submit' }
  | { type: 'next-cell' }
  | { type: 'prev-cell' }
  /** Ở ô cuối dòng cuối: thêm dòng mới rồi nhảy vào ô đầu dòng đó */
  | { type: 'add-row-and-focus' }
  /** Esc trong ô đang sửa: trả giá trị cũ, KHÔNG đóng form */
  | { type: 'cancel-cell' }
  /** Esc ở ngữ cảnh thường: đóng dialog/overlay */
  | { type: 'close' };

const isMod = (e: KeyEventDescriptor): boolean => e.ctrlKey || e.metaKey;

/**
 * Quy tắc, theo đúng thứ tự ưu tiên (fe-preset-system §7):
 *  1. Ctrl/Cmd+S LUÔN là lưu, ở mọi profile
 *  2. textarea nuốt Enter (xuống dòng) ở MỌI profile
 *  3. Ctrl/Cmd+Enter LUÔN là submit — lối thoát nhất quán cho mọi form
 *  4. Esc LUÔN là "huỷ ô đang sửa" khi ô có thay đổi chưa lưu — kể cả profile
 *     standard. Chỉ khi KHÔNG có gì để huỷ thì Esc mới đóng overlay.
 *  5. Còn lại tuỳ profile
 */
export function resolveKeyAction(
  profile: KeyboardProfile,
  e: KeyEventDescriptor,
): KeyAction {
  // §7: "Ctrl+S luôn lưu" — không phụ thuộc profile
  if (e.key.toLowerCase() === 's' && isMod(e)) return { type: 'submit' };

  if (e.key === 'Enter') {
    if (e.target === 'textarea') return { type: 'none' };
    if (isMod(e)) return { type: 'submit' };
    // Nút/thẻ chọn tự xử lý Enter của chúng
    if (e.target === 'button') return { type: 'none' };

    switch (profile) {
      case 'data-entry':
        if (!e.inGrid) return { type: 'next-cell' };
        if (e.shiftKey) return { type: 'prev-cell' };
        return e.isLastCell ? { type: 'add-row-and-focus' } : { type: 'next-cell' };
      case 'standard':
        return { type: 'submit' };
      case 'search':
        // Caller quyết nghĩa: chạy tìm kiếm hoặc chọn mục đang highlight
        return { type: 'submit' };
    }
  }

  if (e.key === 'Escape') {
    // §7: Esc LUÔN là "huỷ ô đang sửa", không phải "đóng form đang nhập dở".
    // Áp cho mọi profile — người dùng gõ nhầm một ô rồi Esc mà mất cả form là
    // mất dữ liệu. Chỉ khi ô không có gì để huỷ thì mới đóng overlay.
    if (e.isDirtyCell) return { type: 'cancel-cell' };
    return { type: 'close' };
  }

  return { type: 'none' };
}

/** Hành động nào cần chặn hành vi mặc định của trình duyệt */
export function shouldPreventDefault(action: KeyAction): boolean {
  return action.type !== 'none' && action.type !== 'close';
}

/**
 * Esc trong ô đang sửa phải CHẶN nổi bọt, nếu không Radix Dialog nhận được
 * và đóng cả form — mất toàn bộ dữ liệu đang nhập.
 */
export function shouldStopPropagation(action: KeyAction): boolean {
  return action.type === 'cancel-cell';
}
