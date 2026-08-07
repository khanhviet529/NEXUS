/**
 * ESLint config gốc — thực thi check #1 và #7 của working-agreement §4.1:
 *   #1  Không gọi Prisma client ngoài repository (no-restricted-imports theo thư mục,
 *       cấu hình override ở apps/api)
 *   #7  Không `any`
 */
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    // Check #7 — cấm any (spec §7)
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  ignorePatterns: ['dist/', '.next/', 'node_modules/', '*.gen.ts'],
};
