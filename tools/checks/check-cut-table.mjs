#!/usr/bin/env node
/**
 * Check #12 (V5 Phase 6 + R2): bảng cắt gọt spec §11 phải KHỚP thư mục thật.
 *
 * Bài học F-05/F-07: bảng viết tay trỏ 5/8 đường dẫn không tồn tại và sót
 * 9 module — tài liệu lệch code là tài liệu ĐÁNH LỪA người khởi tạo dự án.
 * Ba luật:
 *   1. Mọi thư mục apps/api/src/modules/<x> phải có dòng `<x>` trong bảng
 *   2. Mọi dòng `<x>` trong bảng phải còn thư mục tương ứng (chống bảng ôi)
 *   3. (R2) Cột "Màn hình" phải khai `API-only` HOẶC đường dẫn UI CÓ THẬT —
 *      module lặng lẽ không màn hình thì không ai biết là cố ý hay bỏ sót
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
// Tên module = backtick ở CỘT ĐẦU; cả dòng giữ lại để đọc cột "Màn hình"
const rows = new Map(
  [...sectionMatch[0].matchAll(/^\| `([\w-]+)` \|.*\|$/gm)].map((m) => [m[1], m[0]]),
);
const inTable = new Set(rows.keys());

const modulesDir = resolve(root, 'apps/api/src/modules');
const onDisk = readdirSync(modulesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const missingRows = onDisk.filter((m) => !inTable.has(m));
const staleRows = [...inTable].filter((m) => !onDisk.includes(m));

// Luật 3 (R2): cột cuối "Màn hình" — `API-only` hoặc đường dẫn UI có thật.
// Đường dẫn nhận diện bằng backtick chứa `apps/web/` (bỏ phần chú thích sau).
const uiProblems = [];
for (const [name, row] of rows) {
  const cells = row.split('|').map((c) => c.trim());
  const screen = cells[cells.length - 2] ?? ''; // cell cuối trước dấu | đóng
  if (screen.includes('API-only')) continue;
  const pathMatch = screen.match(/`(apps\/web\/[^`]+)`/);
  if (!pathMatch) {
    uiProblems.push(
      `module "${name}": cột Màn hình phải là \`API-only ...\` hoặc đường dẫn \`apps/web/...\` (đang: "${screen.slice(0, 60)}")`,
    );
    continue;
  }
  if (!existsSync(resolve(root, pathMatch[1]))) {
    uiProblems.push(`module "${name}": đường dẫn màn hình KHÔNG tồn tại — ${pathMatch[1]}`);
  }
}

if (missingRows.length || staleRows.length || uiProblems.length) {
  console.error('❌ check-cut-table: bảng §11 lệch thư mục apps/api/src/modules');
  for (const m of missingRows) {
    console.error(`   - module "${m}" có trên đĩa nhưng KHÔNG có dòng trong bảng`);
  }
  for (const m of staleRows) {
    console.error(`   - dòng "${m}" trong bảng nhưng thư mục KHÔNG còn (bảng ôi)`);
  }
  for (const m of uiProblems) console.error(`   - ${m}`);
  console.error('   Sửa bảng cắt gọt ở docs/boilerplate-spec.md §11.');
  process.exit(1);
}

console.log(
  `✅ check-cut-table: ${onDisk.length} module có dòng §11 + cột Màn hình hợp lệ (API-only hoặc đường dẫn thật)`,
);
