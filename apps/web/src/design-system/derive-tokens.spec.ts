import { describe, it, expect } from 'vitest';
import { deriveTokens, appearanceToCssVars, uiToCssVars } from './derive-tokens';
import { resolveProjectUI } from './resolve-project-ui';
import { DERIVED_TOKENS, PRESETS, type PresetBehavior } from './registry';

const behavior = (over: Partial<PresetBehavior> = {}): PresetBehavior => ({
  ...PRESETS.enterprise.behavior,
  ...over,
});

describe('deriveTokens — một nguồn sự thật (§4.1)', () => {
  it('phát ra ĐÚNG tập DERIVED_TOKENS, không thừa không thiếu', () => {
    const keys = Object.keys(deriveTokens(behavior()))
      .map((k) => k.replace(/^--/, ''))
      .sort();
    expect(keys).toEqual([...DERIVED_TOKENS].sort());
  });

  it('không token derived nào trùng token tự do của preset', () => {
    // Preset đè token derived = hai nguồn cho một component. Union đóng đã
    // chặn ở mức type; test này chặn cả trường hợp có ai đó `as any`.
    for (const preset of Object.values(PRESETS)) {
      const free = Object.keys(preset.appearance.tokens);
      expect(free.filter((k) => (DERIVED_TOKENS as readonly string[]).includes(k))).toEqual([]);
    }
  });
});

describe('density là công tắc THẬT, không phải mỹ phẩm (§4.1b)', () => {
  // Đây là lỗi tinh vi mà đặc tả gọi tên: rowHeight là scalar thì user bật
  // comfortable sẽ thấy input giãn, sidebar giãn, mà DÒNG BẢNG đứng yên —
  // đúng thứ họ nhìn thấy rõ nhất.
  const DENSITY_SENSITIVE = [
    '--table-row-h',
    '--table-font-size',
    '--input-h',
    '--button-h',
    '--toolbar-h',
    '--header-h',
    '--sidebar-w',
    '--form-row-gap',
    '--card-padding',
  ];

  it('MỌI token phụ thuộc mật độ đổi khi density đổi — không sót cái nào', () => {
    const compact = deriveTokens(behavior({ density: 'compact' }));
    const comfortable = deriveTokens(behavior({ density: 'comfortable' }));
    const unchanged = DENSITY_SENSITIVE.filter((k) => compact[k] === comfortable[k]);
    expect(unchanged).toEqual([]);
  });

  it('--table-row-h lấy từ DensityScale chứ không phải hằng số', () => {
    expect(deriveTokens(behavior({ density: 'compact' }))['--table-row-h']).toBe('32px');
    expect(deriveTokens(behavior({ density: 'comfortable' }))['--table-row-h']).toBe('40px');
  });
});

describe('token không phụ thuộc mật độ', () => {
  it('zebra=false thành transparent, true thành surface-sunken', () => {
    expect(deriveTokens(behavior())['--table-zebra']).toBe('transparent');
    const zebra = behavior({ table: { ...PRESETS.enterprise.behavior.table, zebra: true } });
    expect(deriveTokens(zebra)['--table-zebra']).toBe('var(--surface-sunken)');
  });

  it('statusEmphasis quyết cỡ badge', () => {
    expect(deriveTokens(behavior({ statusEmphasis: 'subtle' }))['--badge-padding']).toBe('2px 6px');
    expect(deriveTokens(behavior({ statusEmphasis: 'strong' }))['--badge-padding']).toBe('4px 10px');
  });
});

describe('appearanceToCssVars + uiToCssVars', () => {
  it('token tự do thành --<tên>', () => {
    expect(appearanceToCssVars({ brandChroma: 0.1, tokens: { 'card-radius': '12px' } })).toEqual({
      '--card-radius': '12px',
    });
  });

  it('uiToCssVars KHÔNG quên appearance và hai tham số palette', () => {
    // Bug im lặng mà §4.2 cảnh báo: quên dòng appearanceToCssVars thì preset
    // khai token mà không có tác dụng, và không có gì đỏ.
    const ui = resolveProjectUI({ preset: 'enterprise', brandHue: 200 });
    ui.appearance.tokens = { 'card-radius': '99px' };
    const vars = uiToCssVars(ui);
    expect(vars['--card-radius']).toBe('99px');
    expect(vars['--brand-h']).toBe('200');
    expect(vars['--brand-c']).toBe(String(PRESETS.enterprise.appearance.brandChroma));
  });
});
