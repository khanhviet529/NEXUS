import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { cookies } from 'next/headers';
import { Toaster } from 'sonner';
import { PROJECT_UI } from '@/config/project-ui';
import { resolveProjectUI } from '@/design-system/resolve-project-ui';
import { uiToCssVars } from '@/design-system/derive-tokens';
import type { Density } from '@/design-system/registry';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexus',
  description: 'Boilerplate quản trị nghiệp vụ — Next.js + NestJS',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale(); // từ cookie `locale` (src/i18n/request.ts)
  const jar = await cookies();
  const theme = jar.get('theme')?.value === 'dark' ? 'dark' : 'light';
  const density = jar.get('density')?.value === 'comfortable' ? 'comfortable' : undefined;

  // Phân giải + derive token ở SSR, KHÔNG phải runtime JS (§4.2). Ghi bằng JS
  // sau hydrate thì màn hình nháy một lần ở lần tải đầu và ảnh Playwright chụp
  // trạng thái chưa áp preset — baseline thành vô nghĩa.
  const ui = resolveProjectUI(PROJECT_UI, { density: density as Density | undefined });
  const style = uiToCssVars(ui) as CSSProperties;

  return (
    <html
      lang={locale}
      data-theme={theme}
      data-preset={ui.preset}
      data-density={ui.behavior.density}
      style={style}
    >
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider>
          <Providers ui={ui}>{children}</Providers>
          {/* z-index qua token §5.7 — sonner nhận style trực tiếp */}
          <Toaster richColors position="top-right" style={{ zIndex: 'var(--z-toast)' as never }} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
