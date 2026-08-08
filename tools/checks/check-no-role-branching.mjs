#!/usr/bin/env node
/**
 * Check "cấm rẽ nhánh theo mã vai trò" — spec §4.4, permission-matrix §1.1.
 * Quét apps/api/src và apps/web/src tìm chuỗi literal mã vai trò seed.
 * Cho phép DUY NHẤT: prisma/seed.ts và packages/shared/src/seed-roles.ts.
 *
 * FIXTURE TEST cũng được phép — cùng lý do file seed: đó là DỮ LIỆU mô tả bộ
 * vai trò, không phải rẽ nhánh nghiệp vụ. BE để test ở apps/api/test (ngoài
 * vùng quét), FE để cạnh code trong src/ nên phải loại theo TÊN FILE.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROLES = ['SYSADMIN', 'TENANT_ADMIN', 'MANAGER', 'STAFF', 'VIEWER'];
const SCAN_DIRS = ['apps/api/src', 'apps/web/src'];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.next') continue;
      yield* walk(full);
    } else if (
      /\.(ts|tsx)$/.test(entry) &&
      !entry.endsWith('.gen.ts') &&
      // fixture test/story/mock: dữ liệu, không phải rẽ nhánh nghiệp vụ
      !/\.(spec|test|stories)\.tsx?$/.test(entry) &&
      !full.split(sep).includes('mocks') &&
      !full.split(sep).includes('test')
    ) {
      yield full;
    }
  }
}

const violations = [];
for (const dirRel of SCAN_DIRS) {
  const dir = resolve(root, dirRel);
  let files;
  try {
    files = [...walk(dir)];
  } catch {
    continue; // thư mục chưa tồn tại
  }
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const role of ROLES) {
      const re = new RegExp(`['"\`]${role}['"\`]`, 'g');
      let m;
      while ((m = re.exec(src)) !== null) {
        const line = src.slice(0, m.index).split('\n').length;
        violations.push(`${relative(root, file).split(sep).join('/')}:${line} — '${role}'`);
      }
    }
  }
}

if (violations.length) {
  console.error('❌ check-no-role-branching — vai trò là DỮ LIỆU, không phải mã (spec §4.4):');
  for (const v of violations) console.error('   - ' + v);
  console.error("   Thay bằng can('resource:action').");
  process.exit(1);
}
console.log('✅ check-no-role-branching');
