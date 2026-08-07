import type { Metadata } from 'next';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Nexus',
  description: 'Boilerplate quản trị nghiệp vụ — Next.js + NestJS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 24 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
