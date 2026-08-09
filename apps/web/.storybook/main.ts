import type { StorybookConfig } from '@storybook/nextjs-vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: { name: '@storybook/nextjs-vite', options: {} },
  staticDirs: [],
  typescript: { reactDocgen: 'react-docgen' },
  // Storybook có Vite config RIÊNG — alias '@' của tsconfig/next không tự áp.
  // Thiếu dòng này `storybook build` đỏ ở CI dù vitest local xanh.
  viteFinal: (viteConfig) => {
    viteConfig.resolve = viteConfig.resolve ?? {};
    viteConfig.resolve.alias = {
      ...viteConfig.resolve.alias,
      '@': resolve(dir, '../src'),
      // Gói workspace build ra CommonJS (__exportStar) — Rollup không phân
      // giải được named export qua đó. Next né bằng transpilePackages; ở đây
      // trỏ thẳng vào SOURCE để Storybook cũng biên dịch từ TS như Next.
      '@nexus/shared': resolve(dir, '../../../packages/shared/src'),
      '@nexus/api-client': resolve(dir, '../../../packages/api-client/src'),
    };
    return viteConfig;
  },
};

export default config;
