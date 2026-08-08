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
    };
    return viteConfig;
  },
};

export default config;
