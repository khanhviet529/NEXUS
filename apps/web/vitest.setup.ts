import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { setProjectAnnotations } from '@storybook/react';
import * as previewAnnotations from './.storybook/preview';
import { server } from './src/mocks/server';

/**
 * Nạp preview của dự án (i18n, token §5.7) cho `composeStories`.
 *
 * Dùng renderer @storybook/react thay vì framework @storybook/nextjs-vite ở
 * TẦNG TEST: import runtime của nextjs-vite vỡ trên Windows + pnpm
 * ("Invalid module next\dist\compiledeact"). Framework vẫn là nextjs-vite
 * cho `storybook build`/`storybook dev`. Story cần next/navigation thì khai
 * alias mock tường minh trong vitest.config (chưa story nào cần).
 */
setProjectAnnotations([previewAnnotations.default]);

/**
 * MSW bật cho MỌI test: request không khai handler sẽ NÉM LỖI
 * (onUnhandledRequest: 'error') — test gọi API ngoài dự kiến phải lộ ra
 * ngay, không im lặng trả undefined.
 */
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

// jsdom thiếu vài API mà component thật dùng
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
})) as typeof window.matchMedia;

window.requestAnimationFrame ??= ((cb: FrameRequestCallback) =>
  setTimeout(() => cb(0), 0) as unknown as number) as typeof window.requestAnimationFrame;

// jsdom chưa có ResizeObserver — Radix dùng để đo popover/tooltip
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
