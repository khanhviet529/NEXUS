'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PROJECT_UI } from '@/config/project-ui';
import { resolveProjectUI } from '@/design-system/resolve-project-ui';
import { uiToCssVars } from '@/design-system/derive-tokens';
import { ProjectUIProvider } from '@/design-system/use-project-ui';
import { PRESETS, type Density, type PresetId, type ShellId } from '@/design-system/registry';
import { PreviewScreenView, isPreviewScreen } from './screens';

/**
 * Trang preview — hạ tầng cho CẢ visual regression LẪN a11y regression (§8.1).
 *
 * Điểm quyết định: nó gọi ĐÚNG hai hàm mà app thật gọi (`resolveProjectUI` +
 * `uiToCssVars`). Nếu trang này tự dựng CSS var theo cách riêng thì ảnh baseline
 * xanh trong khi production lệch — tức là kiểm chứng vô nghĩa.
 *
 * `?preset=` `?screen=` `?density=` `?theme=` đọc từ URL để Playwright quét
 * mọi tổ hợp mà không cần build riêng.
 */
export function PreviewClient() {
  const params = useSearchParams();

  const presetParam = params.get('preset');
  const preset: PresetId =
    presetParam && presetParam in PRESETS ? (presetParam as PresetId) : PROJECT_UI.preset;
  /**
   * KHÔNG mặc định 'compact'. Mật độ là trục phân biệt NẶNG NHẤT giữa các
   * preset (§1.1: "số dòng bảng thấy được/màn"); ép compact cho mọi preset là
   * tự bịt mắt mình ở đúng chỗ phép thử §1.3 nhìn vào.
   * Thiếu `?density=` → dùng mật độ RIÊNG của preset.
   */
  const densityParam = params.get('density');
  const density: Density | undefined =
    densityParam === 'comfortable' || densityParam === 'compact' ? densityParam : undefined;
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
  const screenParam = params.get('screen');
  const screen = isPreviewScreen(screenParam) ? screenParam : 'list';

  // `?shell=` đi qua ĐÚNG đường overrides của cấp dự án (§2.3), không phải một
  // lối tắt riêng của trang preview — nếu không thì ảnh baseline chứng minh
  // cho một chuỗi phân giải mà production không dùng.
  const shellParam = params.get('shell');
  const shell: ShellId | undefined =
    shellParam === 'sidebar' || shellParam === 'hybrid' ? shellParam : undefined;

  const ui = resolveProjectUI(
    { ...PROJECT_UI, preset, ...(shell ? { overrides: { shell } } : {}) },
    density ? { density } : undefined,
  );

  /**
   * `data-theme` PHẢI nằm trên <html>, không phải trên div bọc.
   *
   * Lý do là cách CSS custom property phân giải: `--table-header-bg:
   * var(--surface-sunken)` khai ở `:root` được tính NGAY tại :root rồi con
   * cháu kế thừa GIÁ TRỊ ĐÃ THAY. Đặt `[data-theme=dark]` trên div con chỉ
   * đổi `--surface-sunken` cho nhánh đó, còn `--table-header-bg` vẫn giữ giá
   * trị sáng đã tính ở :root → chữ sáng trên nền sáng, 1,07:1.
   *
   * Đây chính là lý do trang preview phải đi CÙNG đường với app thật: nếu nó
   * tự dựng theme kiểu khác thì ảnh baseline và a11y đều đo nhầm thứ.
   *
   * useLayoutEffect (không phải useEffect) để thuộc tính có mặt TRƯỚC khi vẽ —
   * nếu không, Playwright chụp được một khung hình sai theme.
   */
  React.useLayoutEffect(() => {
    const html = document.documentElement;
    const previous = html.getAttribute('data-theme');
    html.setAttribute('data-theme', theme);
    return () => {
      if (previous) html.setAttribute('data-theme', previous);
      else html.removeAttribute('data-theme');
    };
  }, [theme]);

  return (
    <ProjectUIProvider value={ui}>
      <div
        data-preset={ui.preset}
        data-density={ui.behavior.density}
        data-screen={screen}
        data-shell={ui.behavior.shell}
        style={{
          // Lưu ý: trong tập này, `--brand-h`/`--brand-c-preset` KHÔNG có tác
          // dụng vì `--brand-400` được tính ở `:root`. Script inline ở page.tsx
          // mới là nơi đặt chúng lên <html>. Giữ ở đây cho khớp production
          // (app thật đặt qua root layout, cũng trên <html>).
          ...(uiToCssVars(ui) as React.CSSProperties),
          background: 'var(--surface-page)',
          color: 'var(--text-body)',
          minHeight: '100vh',
        }}
      >
        <PreviewScreenView screen={screen} />
      </div>
    </ProjectUIProvider>
  );
}
