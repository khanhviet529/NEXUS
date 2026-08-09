#!/usr/bin/env node
/**
 * Check #10 — module phải khai model của nó trong registry dùng chung.
 *
 * Vì sao tồn tại: `plopfile.mjs` viết trong docblock rằng generator cố ý KHÔNG
 * sửa registry, và "các check kiến trúc sẽ ĐỎ nếu quên". Test #37 đo lại lời
 * hứa đó và thấy nó KHÔNG ĐÚNG: ngay sau `gen:module`, `run-all.mjs` vẫn xanh.
 *
 * Lý do lỗ hổng: các check hiện có đều quét SCHEMA (model → policy → ma trận).
 * Một module mới CHƯA có model thì không vi phạm cái nào cả. Nhưng nó vẫn là
 * code chết: repository gọi `prisma.client.x` cho một model không tồn tại.
 *
 * Check này đi HƯỚNG NGƯỢC LẠI — từ code về registry:
 *   mọi `this.prisma.client.<model>` trong *.repository.ts
 *   → PascalCase(<model>) phải có trong TENANCY_POLICY
 *
 * Cơ chế phòng vệ hỏng nguy hiểm hơn generator hỏng: nó khiến người ta tin là
 * mình không quên gì.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const MODULES = join(ROOT, 'apps/api/src/modules');
const errors = [];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.repository.ts')) out.push(p);
  }
  return out;
}

const policySrc = readFileSync(join(ROOT, 'packages/shared/src/tenancy-policy.ts'), 'utf8');
const declared = new Set([...policySrc.matchAll(/'([A-Z]\w+)'/g)].map((m) => m[1]));
if (declared.size === 0) {
  console.error('❌ Không đọc được model nào từ TENANCY_POLICY');
  process.exit(1);
}

/** Không phải model Prisma — API của chính client */
const NOT_MODELS = new Set([
  '$transaction',
  '$queryRaw',
  '$executeRaw',
  '$queryRawTyped',
  '$connect',
  '$disconnect',
  '$extends',
  '$on',
]);

const pascal = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const files = walk(MODULES);
const seen = new Map();

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/prisma\.client\.([A-Za-z_$][\w$]*)/g)) {
    const raw = m[1];
    if (NOT_MODELS.has(raw) || raw.startsWith('$')) continue;
    const model = pascal(raw);
    if (!declared.has(model)) {
      const at = relative(ROOT, f).replace(/\\/g, '/');
      if (!seen.has(model)) seen.set(model, at);
    }
  }
}

for (const [model, at] of seen) {
  errors.push(
    `❌ ${at}: dùng model "${model}" mà TENANCY_POLICY chưa khai.\n` +
      `      Thêm model vào prisma/schema.prisma, khai TENANT/HYBRID/GLOBAL trong\n` +
      `      packages/shared/src/tenancy-policy.ts, và thêm dòng vào ma trận §6.5\n` +
      `      (docs/permission-matrix.md). Xem cookbook §2.`,
  );
}

if (errors.length) {
  console.error(`❌ check-module-registry: ${errors.length} model chưa khai\n`);
  for (const e of errors) console.error(`   ${e}`);
  process.exit(1);
}

console.log(
  `✅ check-module-registry: ${files.length} repository, mọi model đã khai trong TENANCY_POLICY`,
);
