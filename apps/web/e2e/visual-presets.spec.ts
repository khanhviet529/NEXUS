import { test, expect } from '@playwright/test';
import { PRESET_IDS } from '../src/design-system/registry';
import { PREVIEW_SCREENS } from '../src/app/design-system/preview/screen-ids';
import { SHELL_IDS } from '../src/design-system/shell-ids';

/**
 * [CORE] Visual regression theo preset — fe-preset-system §8.2.
 *
 * "Đây là thứ duy nhất khiến bốn preset chịu được về lâu dài." Sửa một token
 * mà lệch preset khác thì CI hiện diff ảnh, chứ không phải ba tháng sau mới
 * phát hiện có một preset đúng và ba preset lệch.
 *
 * PHỦ CẢ HAI THEME. Bản đầu chỉ chụp `light`, và đó là một lỗ thật: bug
 * "dark mode không giảm chroma" (§14.3) là bug THUẦN HÌNH ẢNH mà bộ này không
 * thể bắt được, vì không có ảnh dark nào để so. Một bộ visual regression bỏ
 * trống nửa số theme thì nó canh được nửa số cách vỡ.
 *
 * GĐ A: 1 preset × 7 màn × 2 theme = 14 ảnh.
 *
 * Màn `shell` chụp thêm MỘT LẦN cho mỗi shell (§5.3). Đó là điều kiện để câu
 * "thêm shell mới không làm lệch shell cũ" có nghĩa — trước GĐ B, bộ visual
 * chưa từng chụp khung app lần nào, nên `SidebarShell` hoàn toàn không được
 * canh.
 *
 * Baseline sinh lần đầu bằng `pnpm e2e:update-snapshots`. Ảnh chụp trên
 * chromium của Playwright nên phụ thuộc phiên bản trình duyệt — nâng
 * Playwright thì phải chụp lại và XEM diff, không update mù.
 */
/** Màn `shell` có vòng riêng theo shell — xem khối dưới */
const CONTENT_SCREENS = PREVIEW_SCREENS.filter((s) => s !== 'shell');

for (const preset of PRESET_IDS) {
  for (const theme of ['light', 'dark'] as const) {
    for (const screen of CONTENT_SCREENS) {
      test(`${preset} · ${theme} · ${screen}`, async ({ page }) => {
        await page.goto(
          `/design-system/preview?preset=${preset}&screen=${screen}&theme=${theme}`,
        );
        // Chờ khung đã áp preset chứ không chỉ chờ network: token ghi ở SSR nên
        // phần tử này có mặt là đã đúng trạng thái cuối.
        await expect(
          page.locator(`[data-preset="${preset}"][data-screen="${screen}"]`),
        ).toBeVisible();
        // Theme đặt trên <html> bằng script inline; khẳng định nó đã áp TRƯỚC
        // khi chụp, nếu không ảnh có thể là khung hình giữa lúc lật theme.
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page).toHaveScreenshot(`${preset}-${theme}-${screen}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
          animations: 'disabled',
        });
      });
    }
  }
}

// Khung app: mỗi shell một ảnh, mỗi theme một ảnh.
for (const preset of PRESET_IDS) {
  for (const theme of ['light', 'dark'] as const) {
    for (const shell of SHELL_IDS) {
      test(`${preset} · ${theme} · shell:${shell}`, async ({ page }) => {
        await page.goto(
          `/design-system/preview?preset=${preset}&screen=shell&shell=${shell}&theme=${theme}`,
        );
        await expect(page.locator(`[data-shell="${shell}"]`)).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page).toHaveScreenshot(`${preset}-${theme}-shell-${shell}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
          animations: 'disabled',
        });
      });
    }
  }
}

test('đổi density đổi CẢ chiều cao dòng bảng, không chỉ input (§4.1b)', async ({ page }) => {
  // Kiểm ở tầng trình duyệt thật, bổ sung cho unit test của deriveTokens: ở đây
  // đo giá trị CSS đã phân giải, tức là cả chuỗi SSR → CSS var → layout.
  const rowHeight = async (density: string) => {
    await page.goto(`/design-system/preview?screen=list&density=${density}&theme=light`);
    await expect(page.locator('[data-screen="list"]')).toBeVisible();
    return page
      .locator('[data-screen="list"]')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--table-row-h').trim());
  };

  expect(await rowHeight('compact')).toBe('32px');
  expect(await rowHeight('comfortable')).toBe('40px');
});
