import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // api-client và shared xuất TS source trực tiếp — Next tự transpile
  transpilePackages: ['@nexus/api-client', '@nexus/shared'],
};

export default withNextIntl(nextConfig);
