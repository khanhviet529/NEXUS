module.exports = {
  root: true,
  extends: [require.resolve('@nexus/config-eslint')],
  overrides: [
    // Check #1 (working-agreement §4.1): không gọi Prisma client ngoài repository.
    // PrismaService chỉ được import trong infra/prisma và các file *.repository.ts.
    {
      files: ['src/**/*.ts'],
      excludedFiles: [
        'src/infra/prisma/**',
        'src/**/*.repository.ts',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@prisma/client',
                importNames: ['PrismaClient'],
                message:
                  'Không khởi tạo PrismaClient ngoài infra/prisma. Mọi write đi qua repository (spec §4.9).',
              },
            ],
            patterns: [
              {
                group: ['**/infra/prisma/prisma.service*'],
                message:
                  'PrismaService chỉ được dùng trong repository (*.repository.ts). Spec §4.9: mọi write đi qua repository.',
              },
            ],
          },
        ],
      },
    },
  ],
};
