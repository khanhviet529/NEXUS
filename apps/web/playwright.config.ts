import { defineConfig, devices } from '@playwright/test';

/**
 * [CORE] TẦNG 5 — E2E (§8.1). Chạy trên BUILD THẬT của Next
 * (`next build && next start`), không phải dev server: dev server che nhiều
 * lỗi chỉ xuất hiện khi build production (RSC boundary, env, tree-shaking).
 *
 * API được chặn bằng Playwright route mock (xem e2e/fixtures.ts) — E2E ở đây
 * kiểm LUỒNG GIAO DIỆN, không kiểm backend; backend đã có 192 test riêng.
 * Muốn E2E xuyên tầng thật thì dựng docker-compose, để ở B8 (CD).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    // PW_BASE_URL cho phép chạy trình duyệt ở nơi khác server — dùng để sinh
    // ảnh baseline Linux bằng Docker trong khi Next chạy trên máy Windows.
    baseURL: process.env.PW_BASE_URL ?? 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
    locale: 'vi-VN',
  },
  // Viewport CỐ ĐỊNH cho ảnh baseline: kích thước cửa sổ đổi là mọi ảnh đỏ.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  // PW_EXTERNAL_SERVER=1: server đã chạy sẵn, đừng tự dựng.
  webServer: process.env.PW_EXTERNAL_SERVER ? undefined : {
    command: 'pnpm build && pnpm start --port 3100',
    url: 'http://127.0.0.1:3100/login',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4100',
      // Trang /design-system/preview là DEV-ONLY, nhưng E2E chạy trên build
      // production — không bật cờ này thì chính bộ kiểm chứng bị 404.
      ENABLE_DESIGN_PREVIEW: '1',
    },
  },
});
