import { test, expect } from './fixtures';

/**
 * TẦNG 5 (mẫu) — E2E trên build production thật.
 * Giữ ÍT và ĐẮT GIÁ: E2E chậm nhất, chỉ dùng cho luồng mà 4 tầng dưới
 * không chứng minh nổi (routing thật, RSC boundary, phím tắt toàn cục).
 */
test('trang orders: render danh sách từ API và mở được Cmd+K', async ({ page }) => {
  await page.goto('/orders');

  await expect(page.getByRole('heading', { name: 'Đơn hàng' })).toBeVisible();
  await expect(page.getByText('ORD-2026-00001')).toBeVisible();

  // Cmd/Ctrl+K là hợp đồng phím tắt toàn cục — chỉ E2E chứng minh được
  await page.keyboard.press('Control+k');
  await expect(page.getByPlaceholder('Gõ lệnh hoặc tìm kiếm…')).toBeVisible();
});

test('chuông thông báo hiện số chưa đọc (GĐ7)', async ({ page }) => {
  await page.goto('/orders');
  await expect(page.getByLabel('Thông báo')).toContainText('2');
});
