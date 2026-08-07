#!/usr/bin/env node
/**
 * Check #3 (working-agreement §4.1): bảng mới trong schema.prisma phải có
 * dòng trong ma trận phạm vi dữ liệu spec §6.5 — docs/boilerplate-spec.md.
 *
 * Ma trận liệt kê tên bảng snake_case trong backtick ở cột đầu.
 * Schema dùng @@map("snake_case").
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const specPath = ['docs/boilerplate-spec.md', 'document/boilerplate-spec.md']
  .map((p) => resolve(root, p))
  .find((p) => existsSync(p));
if (!specPath) {
  console.error('❌ check-matrix: không tìm thấy boilerplate-spec.md');
  process.exit(1);
}

const schema = readFileSync(resolve(root, 'apps/api/prisma/schema.prisma'), 'utf8');
const spec = readFileSync(specPath, 'utf8');

// Tên bảng từ schema
const tables = [...schema.matchAll(/@@map\("(\w+)"\)/g)].map(([, t]) => t);

// Vùng §6.5 của spec: từ "## 6.5" đến heading tiếp theo
const sectionMatch = spec.match(/## 6\.5[\s\S]*?(?=\n# |\n## [^6])/);
const section = sectionMatch ? sectionMatch[0] : spec;
// Bảng trong backtick, chấp nhận dòng gộp kiểu `warehouses`, `lots`
const inMatrix = new Set(
  [...section.matchAll(/`(\w+)`/g)].map(([, t]) => t),
);

const missing = tables.filter((t) => !inMatrix.has(t));
if (missing.length) {
  console.error('❌ check-matrix: bảng chưa có dòng trong ma trận spec §6.5:');
  for (const t of missing) console.error('   - ' + t);
  console.error('   Thêm dòng phân loại tenancy/base/soft-delete/audit vào §6.5.');
  process.exit(1);
}
console.log(`✅ check-matrix: ${tables.length} bảng đều có mặt trong §6.5`);
