/**
 * Danh sách shell — KHÔNG import gì cả, và đó là chủ ý.
 *
 * `e2e/visual-presets.spec.ts` đọc danh sách này. Nếu nó đọc từ `registry.ts`
 * thì tiến trình Playwright phải nạp cả preset (và qua đó là cây component)
 * chỉ để biết hai cái tên — bộ sinh ảnh baseline Linux chạy trong Docker sẽ
 * chết vì node_modules của Windows không giải được ở Linux. Cùng lý do với
 * `screen-ids.ts`.
 *
 * `registry.ts` khoá danh sách này khớp với `ShellId` bằng type, nên lệch nhau
 * là lỗi biên dịch.
 */
export const SHELL_IDS = ['sidebar', 'hybrid'] as const;
