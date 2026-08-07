import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { cookies } from 'next/headers';
import { Toaster } from 'sonner';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexus',
  description: 'Boilerplate quản trị nghiệp vụ — Next.js + NestJS',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale(); // từ cookie `locale` (src/i18n/request.ts)
  const theme = (await cookies()).get('theme')?.value === 'dark' ? 'dark' : 'light';
  return (
    <html lang={locale} data-theme={theme}>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
          {/* z-index qua token §5.7 — sonner nhận style trực tiếp */}
          <Toaster richColors position="top-right" style={{ zIndex: 'var(--z-toast)' as never }} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
