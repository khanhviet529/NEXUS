import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { PRESETS } from '@/design-system/registry';
import { PROJECT_UI } from '@/config/project-ui';
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

/**
 * Tham số palette PHẢI đặt trên `<html>`, không phải trên div bọc — cùng lý do
 * với `data-theme` (§14.4): `--brand-400` khai ở `:root` được tính NGAY tại
 * `:root`, nên `--brand-c-preset` đặt ở div con KHÔNG ảnh hưởng tới nó.
 *
 * Hệ quả nếu quên: trang preview đổi được `rowHeight` của preset nhưng KHÔNG
 * đổi được màu thương hiệu — ảnh baseline của hai preset trông giống nhau ở
 * đúng chỗ đáng khác nhau nhất, mà không có gì báo.
 *
 * Bản đồ preset → chroma sinh ở SERVER rồi nhúng vào script chạy trước khi vẽ,
 * nên không phụ thuộc hydrate và không có cửa sổ nháy.
 */
const chromaByPreset: Record<string, number> = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [id, p.appearance.brandChroma]),
);
const PROJECT_UI_CHROMA = PRESETS[PROJECT_UI.preset].appearance.brandChroma;

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
          __html: `(function(){try{
var u=new URL(location.href).searchParams;
var d=document.documentElement;
d.dataset.theme=u.get('theme')==='dark'?'dark':'light';
var C=${JSON.stringify(chromaByPreset)};
var p=u.get('preset');
d.style.setProperty('--brand-c-preset', String(C[p]!=null?C[p]:${PROJECT_UI_CHROMA}));
d.style.setProperty('--brand-h', '${String(PROJECT_UI.brandHue)}');
}catch(e){}})();`,
        }}
      />
      <Suspense fallback={null}>
        <PreviewClient />
      </Suspense>
    </>
  );
}
