import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * [CORE] Tầng 1+2+3 của hạ tầng test FE (§8.1):
 *  - Unit/hook thuần + component (RTL) chạy trên jsdom
 *  - MSW chặn ở tầng network (setup file), không mock module api-client
 *  - Story test qua `composeStories` — play function chạy trong cùng runner,
 *    không cần dựng server Storybook
 * Tầng 4 (Playwright/E2E) có config riêng: playwright.config.ts
 */
export default defineConfig({
  plugins: [react()],
  // tsconfig của Next đặt jsx: 'preserve' (Next tự transform) — vitest phải
  // tự khai runtime tự động, nếu không JSX trong test báo "React is not defined"
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{spec,test}.{ts,tsx}'],
    // e2e/ do Playwright chạy — đừng để vitest nuốt
    exclude: ['node_modules/**', 'e2e/**', '.next/**'],
    css: false,
    restoreMocks: true,
  },
});
