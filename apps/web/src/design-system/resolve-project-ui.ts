import { PRESETS, type ProjectUIConfig, type ResolvedUI, type UserUIPrefs } from './registry';

/**
 * [CORE] Chuỗi phân giải ba cấp (fe-preset-system §2.3):
 *
 *   VisualPreset → PROJECT_UI.overrides → user_preferences → ResolvedUI
 *
 * Có ĐÚNG MỘT hàm làm việc này, và `useProjectUI()` chỉ trả `ResolvedUI`.
 * Component không có cách nào đọc được nguồn chưa phân giải, nên không thể
 * có bug "ai thắng".
 *
 * User CHỈ đổi được trục an toàn (density, theme, sidebarMode). Shell,
 * pagePattern, formLayout là kiến trúc thông tin — để user đổi thì màn A
 * dùng tab còn màn B dùng section cho cùng loại nội dung, người dùng mất
 * phương hướng (§2.1).
 */
export function resolveProjectUI(cfg: ProjectUIConfig, userPrefs?: UserUIPrefs): ResolvedUI {
  const preset = PRESETS[cfg.preset];
  const o = cfg.overrides;

  // Thứ tự: preset → override dự án → preference người dùng.
  const density = userPrefs?.density ?? o?.density ?? preset.behavior.density;

  return {
    preset: cfg.preset,
    brandHue: cfg.brandHue,
    behavior: {
      ...preset.behavior,
      shell: o?.shell ?? preset.behavior.shell,
      contentWidth: o?.contentWidth ?? preset.behavior.contentWidth,
      density,
      table: { ...preset.behavior.table },
    },
    appearance: {
      brandChroma: preset.appearance.brandChroma,
      tokens: { ...preset.appearance.tokens },
    },
    sidebarMode: userPrefs?.sidebarMode ?? 'expanded',
  };
}
