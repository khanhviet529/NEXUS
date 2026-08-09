import { describe, it, expect } from 'vitest';
import { ERROR_CODES, NEXT_ACTION_CODES, nextActionOf, type NextActionCode } from '@nexus/shared';
import { resolveNextAction } from './next-action';

describe('nextAction — ranh giới BE nói MÃ, FE quyết NHÃN + ROUTE (§3.6)', () => {
  it('MỌI mã trong NEXT_ACTION_CODES đều có nhãn FE — không sót', () => {
    for (const code of NEXT_ACTION_CODES) {
      const ui = resolveNextAction(code);
      expect(ui, `thiếu map cho ${code}`).not.toBeNull();
      expect(ui!.label.length).toBeGreaterThan(0);
    }
  });

  it('nhãn là ĐỘNG TỪ chỉ việc, không phải mã kỹ thuật', () => {
    expect(resolveNextAction('CREATE_ADJUSTMENT')!.label).toBe('Lập phiếu điều chỉnh');
    expect(resolveNextAction('REQUEST_HIGHER_APPROVAL')!.label).toBe('Xem ai đủ thẩm quyền');
    // không rò mã sang giao diện
    for (const code of NEXT_ACTION_CODES) {
      expect(resolveNextAction(code)!.label).not.toContain('_');
    }
  });

  it('CÙNG mã, ngữ cảnh khác → đích khác (lý do tách BE/FE)', () => {
    const base = resolveNextAction('CREATE_ADJUSTMENT');
    const fromOrders = resolveNextAction('CREATE_ADJUSTMENT', { module: 'orders' });
    expect(base!.href).toBe('/inventory/adjustments/new');
    expect(fromOrders!.href).toBe('/inventory/stock');
  });

  it('không có nextAction → null, không dựng nút rỗng', () => {
    expect(resolveNextAction(undefined)).toBeNull();
  });

  it('kind quyết định hành vi: reload tại chỗ vs điều hướng', () => {
    expect(resolveNextAction('RELOAD_RECORD')!.kind).toBe('reload');
    expect(resolveNextAction('CREATE_ADJUSTMENT')!.kind).toBe('navigate');
    expect(resolveNextAction('RETRY_LATER')!.kind).toBe('dismiss');
    // navigate thì BẮT BUỘC có href, nếu không nút bấm không làm gì
    for (const code of NEXT_ACTION_CODES) {
      const ui = resolveNextAction(code)!;
      if (ui.kind === 'navigate') expect(ui.href, `${code} thiếu href`).toBeTruthy();
    }
  });

  it('BE: mã lỗi bế tắc nhất phải CÓ lối đi tiếp', () => {
    // Đây là những lỗi khiến người dùng đứng hình nếu chỉ báo "thất bại"
    expect(nextActionOf('STOCK.INSUFFICIENT')).toBe('CREATE_ADJUSTMENT');
    expect(nextActionOf('ORDER.EXCEEDS_LIMIT')).toBe('REQUEST_HIGHER_APPROVAL');
    expect(nextActionOf('ORDER.NO_APPROVAL_AUTHORITY')).toBe('CONTACT_ADMIN');
    expect(nextActionOf('COMMON.VERSION_CONFLICT')).toBe('RELOAD_RECORD');
  });

  it('mọi nextAction khai ở BE đều nằm trong registry (không chuỗi tự do)', () => {
    const allowed = new Set<string>(NEXT_ACTION_CODES);
    for (const [code, def] of Object.entries(ERROR_CODES)) {
      const na = (def as { nextAction?: string }).nextAction;
      if (na) expect(allowed.has(na), `${code} dùng nextAction lạ: ${na}`).toBe(true);
    }
  });

  it('mã không xác định → null thay vì nổ', () => {
    expect(resolveNextAction('KHONG_TON_TAI' as NextActionCode)).toBeNull();
  });
});
