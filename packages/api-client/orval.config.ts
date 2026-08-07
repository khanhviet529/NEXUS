import { defineConfig } from 'orval';

/**
 * [CORE] OpenAPI → type + hook TanStack Query — spec §2.4.
 * Nguồn: apps/api/openapi.json (sinh bởi pnpm --filter @nexus/api gen:api).
 * KHÔNG sửa tay src/gen/** — BE đổi contract thì sinh lại, FE đỏ compile ngay.
 */
export default defineConfig({
  nexus: {
    input: '../../apps/api/openapi.json',
    output: {
      mode: 'tags-split',
      target: 'src/gen/endpoints',
      schemas: 'src/gen/models',
      client: 'react-query',
      httpClient: 'axios',
      clean: true,
      override: {
        mutator: {
          path: 'src/mutator.ts',
          name: 'apiMutator',
        },
      },
    },
  },
});
