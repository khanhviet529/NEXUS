import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { PreviewClient } from './preview-client';

/**
 * `/design-system/preview?preset=…&screen=…&density=…&theme=…` — §8.1.
 *
 * DEV-ONLY. Ở production, route trả 404 trừ khi `ENABLE_DESIGN_PREVIEW=1`.
 * Cờ đó bật trong webServer của Playwright vì E2E chạy trên BUILD THẬT chứ
 * không phải dev server (playwright.config.ts) — nếu chặn cứng theo NODE_ENV
 * thì chính bộ kiểm chứng không vào được trang cần kiểm.
 *
 * Không đưa cờ này vào môi trường khách hàng: trang render dữ liệu mẫu và mở
 * cho mọi người, không qua guard đăng nhập.
 */
export const dynamic = 'force-dynamic';

export default function DesignSystemPreviewPage() {
  const enabled =
    process.env.NODE_ENV !== 'production' || process.env.ENABLE_DESIGN_PREVIEW === '1';
  if (!enabled) notFound();

  return (
    <Suspense fallback={null}>
      <PreviewClient />
    </Suspense>
  );
}
