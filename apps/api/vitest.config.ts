import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import swc from 'unplugin-swc';

export default defineConfig({
  // esbuild không emit decorator metadata → DI của Nest hỏng. Dùng SWC.
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
      // KHÔNG ép commonjs — vitest 3 là ESM-only, require(vitest) sẽ vỡ
      module: { type: 'es6' },
    }),
  ],
  test: {
    include: ['test/**/*.spec.ts'],
    globalSetup: ['test/setup/global-setup.ts'],
    // Integration test dùng chung 1 container DB → chạy tuần tự theo file
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
