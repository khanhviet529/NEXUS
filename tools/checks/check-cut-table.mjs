#!/usr/bin/env node
/**
 * Check #12 (V5 Phase 6): bảng cắt gọt spec §11 phải KHỚP thư mục thật.
 *
 * Bài học F-05/F-07: bảng viết tay trỏ 5/8 đường dẫn không tồn tại và sót
 * 9 module — tài liệu lệch code là tài liệu ĐÁNH LỪA người khởi tạo dự án.
 * Luật hai chiều:
 *   1. Mọi thư mục apps/api/src/modules/<x> phải có dòng `<x>` trong bảng
 *   2. Mọi dòng `<x>` trong bảng phải còn thư mục tương ứng (chống bảng ôi)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const specPath = resolve(root, 'docs/boilerplate-spec.md');
if (!existsSync(specPath)) {
  console.error('❌ check-cut-table: không tìm thấy boilerplate-spec.md');
  process.exit(1);
}
const spec = readFileSync(specPath, 'utf8');

// Vùng bảng cắt gọt: từ "**Bảng cắt gọt**" tới heading kế tiếp
const sectionMatch = spec.match(/\*\*Bảng cắt gọt\*\*[\s\S]*?(?=\n# )/);
if (!sectionMatch) {
  console.error('❌ check-cut-table: không tìm thấy "Bảng cắt gọt" trong spec §11');
  process.exit(1);
}
// Tên module = backtick ở CỘT ĐẦU của mỗi dòng bảng
const inTable = new Set(
  [...sectionMatch[0].matchAll(/^\| `([\w-]+)` \|/gm)].map(([, m]) => m),
);

const modulesDir = resolve(root, 'apps/api/src/modules');
const onDisk = readdirSync(modulesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const missingRows = onDisk.filter((m) => !inTable.has(m));
const staleRows = [...inTable].filter((m) => !onDisk.includes(m));

if (missingRows.length || staleRows.length) {
  console.error('❌ check-cut-table: bảng §11 lệch thư mục apps/api/src/modules');
  for (const m of missingRows) {
    console.error(`   - module "${m}" có trên đĩa nhưng KHÔNG có dòng trong bảng`);
  }
  for (const m of staleRows) {
    console.error(`   - dòng "${m}" trong bảng nhưng thư mục KHÔNG còn (bảng ôi)`);
  }
  console.error('   Sửa bảng cắt gọt ở docs/boilerplate-spec.md §11.');
  process.exit(1);
}

console.log(
  `✅ check-cut-table: ${onDisk.length} module đều có dòng trong bảng §11, không dòng ôi`,
);
