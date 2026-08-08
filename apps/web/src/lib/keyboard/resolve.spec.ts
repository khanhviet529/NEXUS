import { describe, it, expect } from 'vitest';
import {
  resolveKeyAction,
  shouldPreventDefault,
  shouldStopPropagation,
  type KeyEventDescriptor,
  type KeyboardProfile,
} from './resolve';

/**
 * Bảng hành vi bàn phím — fe-preset-system §7.
 * Đây là ASSERTION HÀNH VI, không phải test trang trí: mỗi dòng dưới đây
 * tương ứng một thói quen người dùng nghiệp vụ VN (Misa/Fast/Excel).
 */
const key = (over: Partial<KeyEventDescriptor> = {}): KeyEventDescriptor => ({
  key: 'Enter',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  target: 'text-input',
  ...over,
});

describe('resolveKeyAction — §7 hành vi theo PATTERN, không phải luật global', () => {
  describe('data-entry: bảng dòng chứng từ', () => {
    it('Enter GIỮA bảng → sang ô kế, TUYỆT ĐỐI không submit', () => {
      const a = resolveKeyAction('data-entry', key({ inGrid: true, isLastCell: false }));
      expect(a).toEqual({ type: 'next-cell' });
    });

    it('Enter ở Ô CUỐI → THÊM DÒNG rồi nhảy vào — đây là bug người dùng không bao giờ báo', () => {
      const a = resolveKeyAction('data-entry', key({ inGrid: true, isLastCell: true }));
      expect(a).toEqual({ type: 'add-row-and-focus' });
      expect(a.type).not.toBe('submit'); // submit ở đây = gửi đơn thiếu dòng
    });

    it('Shift+Enter → lùi ô trước (sửa lại dòng vừa gõ)', () => {
      expect(
        resolveKeyAction('data-entry', key({ inGrid: true, shiftKey: true })),
      ).toEqual({ type: 'prev-cell' });
    });

    it('Ctrl+Enter → submit: lối thoát tường minh của người nhập liệu', () => {
      expect(resolveKeyAction('data-entry', key({ inGrid: true, ctrlKey: true }))).toEqual({
        type: 'submit',
      });
      expect(resolveKeyAction('data-entry', key({ inGrid: true, metaKey: true }))).toEqual({
        type: 'submit',
      });
    });

    it('Enter NGOÀI bảng (ô khách hàng) → xuống trường kế, không submit', () => {
      expect(resolveKeyAction('data-entry', key({ inGrid: false }))).toEqual({
        type: 'next-cell',
      });
    });
  });

  describe('standard: form ngắn / login', () => {
    it('Enter → submit như thói quen web', () => {
      expect(resolveKeyAction('standard', key())).toEqual({ type: 'submit' });
    });

    it('Enter trên nút → để nút tự xử lý (không submit hai lần)', () => {
      expect(resolveKeyAction('standard', key({ target: 'button' }))).toEqual({
        type: 'none',
      });
    });
  });

  describe('search: ô tìm kiếm / select', () => {
    it('Enter → chạy tìm/chọn mục đang highlight', () => {
      expect(resolveKeyAction('search', key())).toEqual({ type: 'submit' });
    });
  });

  describe('luật áp cho MỌI profile', () => {
    const profiles: KeyboardProfile[] = ['data-entry', 'standard', 'search'];

    it('textarea nuốt Enter — xuống dòng, không submit', () => {
      for (const p of profiles) {
        expect(resolveKeyAction(p, key({ target: 'textarea' }))).toEqual({ type: 'none' });
      }
    });

    it('Ctrl/Cmd+S LUÔN lưu (§7)', () => {
      for (const p of profiles) {
        expect(resolveKeyAction(p, key({ key: 's', ctrlKey: true }))).toEqual({
          type: 'submit',
        });
        expect(resolveKeyAction(p, key({ key: 'S', metaKey: true }))).toEqual({
          type: 'submit',
        });
      }
    });

    it('Esc khi ô ĐANG SỬA → huỷ ô, KHÔNG đóng form (§7 — mất dữ liệu là lỗi nặng)', () => {
      for (const p of profiles) {
        expect(resolveKeyAction(p, key({ key: 'Escape', isDirtyCell: true }))).toEqual({
          type: 'cancel-cell',
        });
      }
    });

    it('Esc khi KHÔNG có gì để huỷ → đóng overlay', () => {
      for (const p of profiles) {
        expect(resolveKeyAction(p, key({ key: 'Escape', isDirtyCell: false }))).toEqual({
          type: 'close',
        });
      }
    });

    it('phím thường (chữ, số) không bị can thiệp', () => {
      for (const p of profiles) {
        expect(resolveKeyAction(p, key({ key: 'a' }))).toEqual({ type: 'none' });
        expect(resolveKeyAction(p, key({ key: '5' }))).toEqual({ type: 'none' });
      }
    });
  });

  describe('cờ phụ trợ cho tầng DOM', () => {
    it('preventDefault cho hành động điều hướng/submit, KHÔNG cho none/close', () => {
      expect(shouldPreventDefault({ type: 'submit' })).toBe(true);
      expect(shouldPreventDefault({ type: 'next-cell' })).toBe(true);
      expect(shouldPreventDefault({ type: 'add-row-and-focus' })).toBe(true);
      expect(shouldPreventDefault({ type: 'none' })).toBe(false);
      expect(shouldPreventDefault({ type: 'close' })).toBe(false); // để Dialog tự đóng
    });

    it('CHỈ cancel-cell chặn nổi bọt — nếu không Radix Dialog nuốt Esc và đóng form', () => {
      expect(shouldStopPropagation({ type: 'cancel-cell' })).toBe(true);
      expect(shouldStopPropagation({ type: 'close' })).toBe(false);
      expect(shouldStopPropagation({ type: 'submit' })).toBe(false);
    });
  });
});
