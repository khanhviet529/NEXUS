import type { PresetBehavior, ResolvedUI, VisualPreset } from './registry';

/**
 * [CORE] behavior → CSS var (fe-preset-system §4.2).
 *
 * Hàm THUẦN, dùng cho cả SSR lẫn trang preview lẫn Storybook. Derive lúc SSR
 * chứ không phải bằng JS sau hydrate: ghi CSS var sau hydrate làm màn hình
 * NHÁY một lần ở lần tải đầu, và Playwright sẽ chụp trạng thái chưa áp preset
 * — ảnh baseline thành vô nghĩa.
 *
 * Mọi key trả về phải nằm trong DERIVED_TOKENS; test giữ luật đó.
 */
export function deriveTokens(b: PresetBehavior): Record<string, string> {
  const d = b.density; // ĐÃ áp userPrefs — xem resolveProjectUI
  const dense = d === 'compact';
  return {
    '--table-row-h': `${b.table.rowHeight[d]}px`,
    '--table-font-size': dense ? 'var(--text-sm)' : 'var(--text-base)',
    '--table-zebra': b.table.zebra ? 'var(--surface-sunken)' : 'transparent',
    '--sidebar-w': dense ? '240px' : '264px',
    '--header-h': dense ? '52px' : '60px',
    '--toolbar-h': dense ? '40px' : '48px',
    '--input-h': dense ? '32px' : '38px',
    '--button-h': dense ? '32px' : '38px',
    '--form-row-gap': dense ? 'var(--space-2)' : 'var(--space-3)',
    '--card-padding': dense ? 'var(--space-3)' : 'var(--space-4)',
    // Không phụ thuộc mật độ:
    '--badge-font-size': b.statusEmphasis === 'strong' ? 'var(--text-sm)' : 'var(--text-xs)',
    '--badge-padding': b.statusEmphasis === 'strong' ? '4px 10px' : '2px 6px',
  };
}

/** FreeToken → CSS var. Hàm thuần, dùng cho cả SSR lẫn trang preview (§4.2). */
export function appearanceToCssVars(
  a: VisualPreset['appearance'],
): Record<string, string> {
  return Object.fromEntries(Object.entries(a.tokens).map(([k, v]) => [`--${k}`, v]));
}

/**
 * Toàn bộ CSS var mà <html> phải mang. Gom vào MỘT hàm để không nơi nào quên
 * dòng `appearanceToCssVars` — lỗi im lặng kiểu "preset đè token mà không có
 * tác dụng" rất khó thấy.
 */
export function uiToCssVars(ui: ResolvedUI): Record<string, string> {
  return {
    ...deriveTokens(ui.behavior),
    ...appearanceToCssVars(ui.appearance),
    '--brand-h': String(ui.brandHue),
    '--brand-c': String(ui.appearance.brandChroma),
  };
}
