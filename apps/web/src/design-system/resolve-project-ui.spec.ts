import { describe, it, expect } from 'vitest';
import { resolveProjectUI } from './resolve-project-ui';
import { PRESETS, assertPagePattern, PAGE_PATTERNS } from './registry';

describe('chuỗi phân giải ba cấp (§2.3)', () => {
  it('không override thì lấy nguyên preset', () => {
    const ui = resolveProjectUI({ preset: 'enterprise', brandHue: 258 });
    expect(ui.behavior).toEqual(PRESETS.enterprise.behavior);
    expect(ui.brandHue).toBe(258);
  });

  it('override cấp dự án THẮNG preset — nếu không thì cấu hình đúng mà vô tác dụng', () => {
    const ui = resolveProjectUI({
      preset: 'enterprise',
      brandHue: 258,
      overrides: { density: 'comfortable', contentWidth: { max: 1280 } },
    });
    expect(ui.behavior.density).toBe('comfortable');
    expect(ui.behavior.contentWidth).toEqual({ max: 1280 });
  });

  it('preference người dùng THẮNG override dự án ở trục density', () => {
    const ui = resolveProjectUI(
      { preset: 'enterprise', brandHue: 258, overrides: { density: 'comfortable' } },
      { density: 'compact' },
    );
    expect(ui.behavior.density).toBe('compact');
  });

  it('phân giải không làm hỏng preset gốc — object phải được sao chép', () => {
    const ui = resolveProjectUI({ preset: 'enterprise', brandHue: 1 });
    ui.behavior.table.defaultPageSize = 999;
    ui.appearance.tokens['card-radius'] = 'hỏng';
    expect(PRESETS.enterprise.behavior.table.defaultPageSize).toBe(50);
    expect(PRESETS.enterprise.appearance.tokens).toEqual({});
  });

  it('user KHÔNG đổi được shell — đó là kiến trúc thông tin (§2.1)', () => {
    // Hợp đồng nằm ở TYPE: UserUIPrefs không có trường `shell`. Test này khoá
    // hình dạng dữ liệu để ai đó thêm trường vào là phải sửa test và đọc §2.1.
    const ui = resolveProjectUI({ preset: 'enterprise', brandHue: 1 }, { density: 'comfortable' });
    expect(ui.behavior.shell).toBe('sidebar');
  });
});

describe('registry không phải backlog (§6)', () => {
  it('pattern đã implement thì không ném', () => {
    expect(() => assertPagePattern('list-detail')).not.toThrow();
    expect(() => assertPagePattern('list-drawer')).not.toThrow();
  });

  it('pattern mới khai ID thì ném lỗi RÕ, không render sai im lặng', () => {
    expect(() => assertPagePattern('dashboard')).toThrow(/chưa implement/);
    expect(() => assertPagePattern('wizard')).toThrow(/chưa implement/);
  });

  it('mọi pattern cần trang chi tiết đều khai needsDetail', () => {
    expect(PAGE_PATTERNS['list-detail'].needsDetail).toBe(true);
    expect(PAGE_PATTERNS['list-drawer'].needsDetail).toBe(false);
  });
});
