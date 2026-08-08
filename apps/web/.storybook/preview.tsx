import * as React from 'react';
import type { Preview } from '@storybook/nextjs-vite';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../src/messages/vi.json';
import '../src/app/globals.css';

/**
 * Story chạy trong CÙNG bối cảnh app thật: token §5.7 (globals.css) +
 * i18n. Thiếu cái nào thì story đẹp mà app vỡ.
 */
const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'error' }, // vi phạm a11y là ĐỎ, không phải cảnh báo (§5.10)
  },
  decorators: [
    (Story) => (
      <NextIntlClientProvider locale="vi" messages={messages}>
        <Story />
      </NextIntlClientProvider>
    ),
  ],
};

export default preview;
