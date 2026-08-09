/**
 * Danh sách màn hình preview — KHÔNG import gì cả, và đó là chủ ý.
 *
 * `e2e/visual-presets.spec.ts` đọc danh sách này. Nếu nó đọc từ `screens.tsx`
 * thì tiến trình Playwright phải nạp cả cây component (Radix, lucide,
 * tanstack…) chỉ để biết sáu cái tên — và bộ sinh ảnh baseline Linux chạy
 * trong Docker sẽ chết vì node_modules của Windows không giải được ở Linux.
 *
 * ⚠ Lệch một chỗ so với §8.1, có chủ đích: §8.1 liệt kê `dashboard`, nhưng
 * page pattern đó mới chỉ khai ID và ném lỗi khi dùng (§6 — registry không
 * phải backlog). Chụp baseline cho dashboard giả sẽ làm nó trông như đã có.
 * Thay bằng `states` — bốn trạng thái DataTable, bề mặt CÓ THẬT và dễ vỡ khi
 * đổi token. Đổi lại khi `dashboard` được implement ở GĐ D.
 */
export const PREVIEW_SCREENS = [
  'list',
  'detail',
  'form',
  'grid-entry',
  'login',
  'states',
  // Màn DUY NHẤT render khung app (AppShell). Sáu màn trên cố ý render trần
  // để ảnh chỉ nói về nội dung; `shell` mới là ảnh nói về khung.
  'shell',
] as const;

export type PreviewScreen = (typeof PREVIEW_SCREENS)[number];

export function isPreviewScreen(v: string | null): v is PreviewScreen {
  return !!v && (PREVIEW_SCREENS as readonly string[]).includes(v);
}
