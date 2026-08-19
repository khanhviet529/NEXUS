#!/usr/bin/env node
/**
 * Check "cấm hardcode cổng mặc định KHÔNG có đường env" — F02 + F16 (C1).
 *
 * Bối cảnh: bootstrap HỨA clone thứ hai chỉ cần đổi cổng trong .env (F-04).
 * Lời hứa đó vỡ ở mọi chỗ code ghim `localhost:3000/4000` mà không đọc env:
 * F02 (setup.mjs in cổng cứng) và F16 (auth-gd2.spec ghim Origin 3000 → clone
 * đổi cổng là logout test đỏ 403). Hai lỗi một gốc — check này chặn cả họ.
 *
 * Luật: dòng chứa localhost:3000|4000 (hoặc 127.0.0.1) PHẢI có đường env trên
 * CÙNG dòng (`process.env` / `config.get`) — tức chỉ là FALLBACK khi env
 * trống, không phải giá trị duy nhất.
 *
 * Miễn trừ khai TƯỜNG MINH kèm lý do — không phải nơi giấu nợ.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCAN_DIRS = ['apps/api/src', 'apps/api/test', 'apps/web/src', 'packages', 'tools'];
const PORT_RE = /(localhost|127\.0\.0\.1):(3000|4000)\b/;
const ENV_ESCAPE_RE = /process\.env|config\.get/;

/** Miễn trừ theo file — MỖI dòng một lý do */
const ALLOW = new Map([
  // Schema env: đây là NƠI KHAI mặc định chính thức — mọi chỗ khác đọc qua nó
  ['apps/api/src/config/env.ts', 'điểm khai default duy nhất, mọi code đọc qua config'],
]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      if (['node_modules', 'dist', '.next', '.turbo', 'coverage'].includes(entry)) continue;
      yield* walk(full);
    } else if (/\.(ts|tsx|mjs|cjs|js)$/.test(entry) && !entry.endsWith('.gen.ts')) {
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
    continue;
  }
  for (const file of files) {
    const rel = relative(root, file).split(sep).join('/');
    if (rel === 'tools/checks/check-hardcoded-ports.mjs') continue; // chính check này
    if (ALLOW.has(rel)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (PORT_RE.test(line) && !ENV_ESCAPE_RE.test(line)) {
        violations.push(`${rel}:${i + 1} — ${line.trim().slice(0, 100)}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error(`❌ check-hardcoded-ports: ${violations.length} chỗ ghim cổng mặc định KHÔNG có đường env:`);
  for (const v of violations) console.error(`   ${v}`);
  console.error('   Sửa thành `process.env.X ?? \'http://localhost:...\'` hoặc đọc qua config.get.');
  console.error('   Trường hợp chính đáng → thêm vào ALLOW trong check này KÈM lý do.');
  process.exit(1);
}
console.log('✅ check-hardcoded-ports: không chỗ nào ghim cổng mặc định mà thiếu đường env');
