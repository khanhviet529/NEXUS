import * as React from 'react';
import type { Preview } from '@storybook/nextjs-vite';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../src/messages/vi.json';
import { PROJECT_UI } from '../src/config/project-ui';
import { resolveProjectUI } from '../src/design-system/resolve-project-ui';
import { uiToCssVars } from '../src/design-system/derive-tokens';
import { ProjectUIProvider } from '../src/design-system/use-project-ui';
import { PRESET_IDS, type Density, type PresetId } from '../src/design-system/registry';
import '../src/app/globals.css';

/**
 * Story chạy trong CÙNG bối cảnh app thật: ba tầng token (globals.css),
 * i18n, và ResolvedUI đã phân giải. Thiếu cái nào thì story đẹp mà app vỡ.
 *
 * Preset/density là globals của Storybook — đổi trên thanh công cụ để so
 * hai preset cạnh nhau mà không phải sửa code. Đây cũng là lý do component
 * KHÔNG được import PROJECT_UI trực tiếp (§12).
 */
const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'error' }, // vi phạm a11y là ĐỎ, không phải cảnh báo (§5.10)
  },
  globalTypes: {
    preset: {
      description: 'Preset hình ảnh',
      defaultValue: PROJECT_UI.preset,
      toolbar: { icon: 'paintbrush', items: PRESET_IDS },
    },
    density: {
      description: 'Mật độ (cấp 3 — user đổi được)',
      defaultValue: 'compact',
      toolbar: { icon: 'component', items: ['compact', 'comfortable'] },
    },
    theme: {
      description: 'Sáng / tối',
      defaultValue: 'light',
      toolbar: { icon: 'circlehollow', items: ['light', 'dark'] },
    },
  },
  decorators: [
    (Story, ctx) => {
      const ui = resolveProjectUI(
        { ...PROJECT_UI, preset: ctx.globals.preset as PresetId },
        { density: ctx.globals.density as Density },
      );
      return (
        <NextIntlClientProvider locale="vi" messages={messages}>
          <ProjectUIProvider value={ui}>
            <div
              data-theme={ctx.globals.theme}
              data-preset={ui.preset}
              data-density={ui.behavior.density}
              style={{
                ...(uiToCssVars(ui) as React.CSSProperties),
                background: 'var(--surface-page)',
                color: 'var(--text-body)',
                padding: 'var(--space-4)',
              }}
            >
              <Story />
            </div>
          </ProjectUIProvider>
        </NextIntlClientProvider>
      );
    },
  ],
};

export default preview;
