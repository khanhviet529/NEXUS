import { describe, it, expect } from 'vitest';
import { PRESETS, PRESET_IDS, type PresetBehavior } from './registry';
import { deriveTokens, uiToCssVars } from './derive-tokens';
import { resolveProjectUI } from './resolve-project-ui';

/**
 * Phép thử §1.3 có hai nửa. Nửa CON NGƯỜI — "đưa 4 ảnh cho người không biết dự
 * án, họ phải phân biệt được" — máy không thay được, và nó là điều kiện đóng
 * GĐ B.
 *
 * File này là nửa MÁY KIỂM ĐƯỢC: hai preset phải khác nhau ở **trục hành vi**
 * (§1.1), không phải chỉ ở bo góc và màu.
 *
 * Vì sao cần: §1 nói thẳng rằng đây là chỗ hầu hết design system thất bại —
 * người ta coi preset là "màu + bo góc + đổ bóng", rồi ra bốn app không phân
 * biệt được và toàn bộ công sức thành vô nghĩa. Test này bắt đúng trạng thái
 * đó, ở thời điểm nó mới xảy ra chứ không phải sau ba tháng.
 */
describe('Phân biệt preset — nửa máy kiểm được của phép thử §1.3', () => {
  it('có đúng hai preset trước pilot — thêm preset thứ 3 là ĐOÁN (§11.2)', () => {
    // §12 cấm thêm preset thứ 3 trước GĐ C. Hai là số nhỏ nhất chứng minh cơ
    // chế chạy; ba trở lên trước pilot là đoán về dự án chưa tồn tại.
    expect(PRESET_IDS).toEqual(['enterprise', 'operations']);
  });

  /**
   * Trục HÀNH VI theo bảng §1.1. Đây là danh sách phải khác nhau; nếu hai
   * preset trùng nhau ở đa số trục này thì chúng là một preset đội hai tên.
   */
  const AXES: { name: string; of: (b: PresetBehavior) => unknown }[] = [
    { name: 'shell', of: (b) => b.shell },
    { name: 'density', of: (b) => b.density },
    { name: 'rowHeight', of: (b) => JSON.stringify(b.table.rowHeight) },
    { name: 'defaultPageSize', of: (b) => b.table.defaultPageSize },
    { name: 'zebra', of: (b) => b.table.zebra },
    { name: 'actionPlacement', of: (b) => b.table.actionPlacement },
    { name: 'defaultFormLayout', of: (b) => b.defaultFormLayout },
    { name: 'statusEmphasis', of: (b) => b.statusEmphasis },
  ];

  it('hai preset khác nhau ở ĐA SỐ trục hành vi, không chỉ ở hình thức', () => {
    const a = PRESETS.enterprise.behavior;
    const b = PRESETS.operations.behavior;
    const differing = AXES.filter((ax) => ax.of(a) !== ax.of(b)).map((ax) => ax.name);

    // Ngưỡng 5/8: dưới mức đó thì hai preset chỉ là biến thể mỹ phẩm của nhau.
    expect(
      differing.length,
      `Chỉ khác nhau ở ${differing.length}/${AXES.length} trục: ${differing.join(', ')}. ` +
        'Preset khác nhau ở MẬT ĐỘ THÔNG TIN, không phải ở radius (§1).',
    ).toBeGreaterThanOrEqual(5);
  });

  it('khác nhau ở SHELL — trục nặng nhất, và là lý do HybridShell vào GĐ B', () => {
    expect(PRESETS.enterprise.behavior.shell).toBe('sidebar');
    expect(PRESETS.operations.behavior.shell).toBe('hybrid');
  });

  it('khác biệt hành vi ĐI ĐẾN được CSS var — không mắc kẹt trong object', () => {
    // Một preset khai `rowHeight` khác mà token derived vẫn giống nhau nghĩa là
    // chuỗi behavior → deriveTokens đứt ở đâu đó, và người dùng không thấy gì.
    const ent = deriveTokens(PRESETS.enterprise.behavior);
    const ops = deriveTokens(PRESETS.operations.behavior);

    expect(ent['--table-row-h']).not.toBe(ops['--table-row-h']);
    expect(ent['--table-zebra']).not.toBe(ops['--table-zebra']);
    expect(ent['--badge-padding']).not.toBe(ops['--badge-padding']);
  });

  it('preset thứ hai CÓ đè token tự do — đó là lúc cơ chế được kiểm chứng (§4.4)', () => {
    // Enterprise cố ý không đè gì (nó LÀ mặc định). Nếu Operations cũng không
    // đè gì thì nhánh appearanceToCssVars chưa từng chạy thật lần nào.
    expect(Object.keys(PRESETS.enterprise.appearance.tokens)).toEqual([]);
    expect(Object.keys(PRESETS.operations.appearance.tokens).length).toBeGreaterThan(3);
  });

  it('token tự do của Operations thật sự tới được biến CSS', () => {
    const ui = resolveProjectUI({ preset: 'operations', brandHue: 258 });
    const vars = uiToCssVars(ui);
    expect(vars['--sidebar-bg']).toBe('var(--brand-700)');
    expect(vars['--brand-c-preset']).toBe('0.19');
  });

  it('mỗi preset vẫn tự nhất quán: mọi trục đều khai đủ', () => {
    for (const id of PRESET_IDS) {
      const b = PRESETS[id].behavior;
      for (const ax of AXES) {
        expect(ax.of(b), `${id} thiếu trục ${ax.name}`).toBeDefined();
      }
    }
  });
});
