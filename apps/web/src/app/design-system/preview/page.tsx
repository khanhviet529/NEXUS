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
    <>
      {/*
        Đặt data-theme NGAY khi trình duyệt phân tích HTML, trước khi vẽ và
        trước khi hydrate.

        Vì sao không để useLayoutEffect làm: nó chỉ chạy SAU hydrate, nên có
        một cửa sổ mà phần tử đã hiện còn <html> vẫn mang theme của SSR. axe
        quét đúng cửa sổ đó sẽ đọc màu CHỮ của theme này với màu NỀN của theme
        kia — ra 2,54:1 và báo vi phạm không có thật. Lỗi này đã làm CI đỏ ngẫu
        nhiên ở một màn khác nhau mỗi lần, khoảng 1/4 số lượt.

        Script đọc thẳng URL nên không phụ thuộc React. Đây cũng là khuôn mẫu
        chống "nháy theme" tiêu chuẩn.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=new URL(location.href).searchParams.get('theme');document.documentElement.dataset.theme=t==='dark'?'dark':'light';}catch(e){}})();`,
        }}
      />
      <Suspense fallback={null}>
        <PreviewClient />
      </Suspense>
    </>
  );
}
