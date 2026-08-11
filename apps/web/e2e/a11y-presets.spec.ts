import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PRESET_IDS } from '../src/design-system/registry';

/**
 * [CORE] A11y regression theo preset — fe-preset-system §8.3.
 *
 * Mỗi preset mới là một cơ hội tự phá accessibility: đổi `brandChroma`, đổi
 * nền sidebar, tăng mật độ — cả ba đều động vào tỉ số tương phản.
 *
 * GĐ A: 1 preset × 2 theme = 2 tổ hợp. GĐ B: 4. GĐ D: 8.
 *
 * ⚠ Đây là PRESET regression, chạy với `brandHue` mặc định của boilerplate.
 * Nó KHÔNG thay cho BRAND regression: OKLCH dự đoán được hơn HSL nhưng không
 * bảo đảm giữ tỉ số tương phản WCAG khi đổi hue — WCAG tính từ relative
 * luminance, không phải từ L của OKLCH. Dự án đặt `brandHue` riêng (nhất là
 * vùng vàng-lục ~70) BẮT BUỘC chạy lại bộ này với hue của mình (§3.2).
 */
const SCREENS = ['list', 'detail', 'form', 'grid-entry', 'login', 'states'] as const;

for (const preset of PRESET_IDS) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${preset}/${theme} đạt WCAG 2 AA trên mọi màn`, async ({ page }) => {
      // 6 màn × (goto + quét axe) trong MỘT test — 30s mặc định đủ trên CI
      // Linux nhưng thiếu trên máy Windows chạy kèm việc khác. Timeout ở đây
      // là ngân sách CẢ VÒNG, không phải mỗi màn.
      test.setTimeout(120_000);
      for (const screen of SCREENS) {
        await page.goto(
          `/design-system/preview?preset=${preset}&screen=${screen}&theme=${theme}`,
        );
        await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible();
        // Chờ theme ĐÃ áp trước khi quét. Phần tử hiện ra KHÔNG có nghĩa là
        // theme đã đúng: nếu quét lúc đang lật, axe đọc màu chữ của theme này
        // với màu nền của theme kia và báo vi phạm không có thật.
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

        // Báo lỗi kèm TÊN MÀN và selector: "có 3 vi phạm" không giúp ai sửa.
        expect(
          // Kèm mô tả đầy đủ của axe (màu chữ, màu nền, tỉ số đo được) — thiếu
          // nó thì người đọc CI chỉ biết "có vi phạm" mà không biết sửa gì.
          result.violations.map(
            (v) =>
              `${screen}: ${v.id} @ ${v.nodes[0]?.target.join(' ')} — ` +
              `${v.nodes[0]?.failureSummary?.replace(/\s+/g, ' ')}`,
          ),
          `Vi phạm a11y ở ${preset}/${theme}/${screen}`,
        ).toEqual([]);
      }
    });
  }
}
