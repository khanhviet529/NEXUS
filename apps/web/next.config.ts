import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // api-client và shared xuất TS source trực tiếp — Next tự transpile
  transpilePackages: ['@nexus/api-client', '@nexus/shared'],
};

export default nextConfig;
