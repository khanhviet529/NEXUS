#!/usr/bin/env node
/**
 * Chạy toàn bộ check kiến trúc — working-agreement §4.1.
 * (Check #1 no-Prisma-ngoài-repository và #7 no-any nằm ở ESLint;
 *  check #5 @RequirePermission nằm ở test require-permission.spec.ts;
 *  check #6 đếm query bắt đầu từ GĐ4.)
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const checks = [
  'gen-model-list.mjs', // sinh lại registry trước
  'check-tenancy-policy.mjs',
  'check-matrix.mjs',
  'check-no-role-branching.mjs',
  'check-audit-coverage.mjs', // ADR-0004: audit tường minh, CI gác chỗ quên
  'check-fe-test-coverage.mjs', // §7.2: chạm apps/web phải kèm test/story
];

let failed = false;
for (const check of checks) {
  const r = spawnSync(process.execPath, [resolve(dir, check)], { stdio: 'inherit' });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
