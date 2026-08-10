#!/usr/bin/env node
/**
 * Check #12 — bảng cắt gọt §11 phải khớp module có thật.
 *
 * Vì sao tồn tại: C0.2 đo bảng §11 và thấy nó nói về một repo khác. Bảng có 8
 * dòng, repo có 24 module. Bảng gọi `approvals`, thư mục tên
 * `approval-authorities`. Bảng bảo `rm -rf packages/vn`, `packages/vn` không
 * tồn tại (F-05, F-07).
 *
 * Bảng đó là thứ ĐẦU TIÊN người khởi tạo dự án mới đọc và làm theo. Một dòng
 * `rm -rf` trỏ sai đường dẫn thì tốt nhất là không xoá gì; tệ nhất là xoá nhầm.
 *
 * HƯỚNG KIỂM: đi từ CODE về BẢNG, không phải ngược lại — giống check #10.
 * Nguồn sự thật là nhãn `[CORE] / [OPT] / [REF]` trong `<module>.module.ts`.
 * Bảng chỉ là bản in ra của nó. Thêm module mà quên nhãn → đỏ ở đây, không
 * phải sáu tháng sau lúc có người tin bảng.
 *
 * Ba điều kiểm:
 *   1. mọi module có nhãn                     (thiếu nhãn → không in bảng được)
 *   2. mọi module có dòng trong bảng          (module mới bị quên)
 *   3. mọi dòng của bảng trỏ tới module có thật (dòng ma, F-05/F-07)
 *   4. nhãn trong bảng khớp nhãn trong code   (bảng trôi)
 *
 * Sửa: `node tools/checks/check-cut-table.mjs --fix` in lại bảng.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MODULES_DIR = join(ROOT, 'apps/api/src/modules');
const SPEC = join(ROOT, 'docs/boilerplate-spec.md');
const FIX = process.argv.includes('--fix');

const BEGIN = '<!-- BẢNG-CẮT-GỌT:BẮT-ĐẦU — sinh bởi tools/checks/check-cut-table.mjs, đừng sửa tay -->';
const END = '<!-- BẢNG-CẮT-GỌT:KẾT-THÚC -->';

if (!existsSync(MODULES_DIR) || !existsSync(SPEC)) {
  console.error('⚠ check-cut-table: không thấy apps/api/src/modules hoặc docs/boilerplate-spec.md');
  process.exit(2); // hợp đồng mã thoát: 2 = KHÔNG CHẠY ĐƯỢC
}

// ── 1. Đọc nhãn từ code ──────────────────────────────────────────────────────
const modules = readdirSync(MODULES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

/**
 * Nhãn + phần bổ nghĩa trong ngoặc, rồi ghi chú tới HẾT DÒNG.
 *
 * Bản đầu của regex này đòi ghi chú chạy thẳng tới `*​/`, nên chỉ khớp docblock
 * MỘT DÒNG và bỏ sót `health` (docblock nhiều dòng). Một check bỏ sót thầm lặng
 * còn tệ hơn không có check — working-agreement §4.1b, thuộc tính "PHẢI ĐÚNG".
 */
const TAG = /\[(CORE|OPT|REF)([^\]]*)\]([^\n*]*)/;

const info = [];
const missingTag = [];

/**
 * Nhãn khai ở `<module>.module.ts`. `health` không có file đó — controller gắn
 * thẳng vào `app.module.ts` — nên chấp nhận `<module>.controller.ts` làm nơi
 * khai thứ hai.
 *
 * Chỉ đọc phần TRƯỚC decorator đầu tiên, tức docblock của chính module/
 * controller. Cắt theo cấu trúc, không theo số ký tự: bản đầu cắt 700 ký tự và
 * `auth` (nhiều import) rơi ra ngoài. Sâu hơn decorator là nhãn của từng class,
 * khác nghĩa với nhãn của cả module — `reports` là ví dụ sống, registry [CORE]
 * nằm cùng thư mục với các ReportDef mẫu [REF].
 */
function labelSource(m) {
  for (const name of [`${m}.module.ts`, `${m}.controller.ts`]) {
    const file = join(MODULES_DIR, m, name);
    if (!existsSync(file)) continue;
    const src = readFileSync(file, 'utf8');
    const at = src.search(/@(Module|Controller)\s*\(/);
    return at > 0 ? src.slice(0, at) : src;
  }
  return '';
}

for (const m of modules) {
  const hit = TAG.exec(labelSource(m));
  if (!hit) {
    missingTag.push(m);
    continue;
  }
  info.push({
    name: m,
    label: hit[1],
    qualifier: hit[2].trim(), // "nhẹ", "ưu tiên cao", "nếu có kho"…
    note: hit[3].replace(/\s+/g, ' ').trim(),
    hasWeb: existsSync(join(ROOT, 'apps/web/src/features', m)),
  });
}

// ── 2. Sinh bảng ─────────────────────────────────────────────────────────────
const ORDER = { CORE: 0, REF: 1, OPT: 2 };
const sorted = [...info].sort(
  (a, b) => ORDER[a.label] - ORDER[b.label] || a.name.localeCompare(b.name),
);

function renderRow(m) {
  const label = m.qualifier ? `**${m.label}** ${m.qualifier}` : `**${m.label}**`;
  let cmd;
  if (m.label === 'CORE') {
    cmd = '**Không xoá**';
  } else {
    const paths = [`apps/api/src/modules/${m.name}`];
    if (m.hasWeb) paths.push(`apps/web/src/features/${m.name}`);
    cmd = `\`rm -rf ${paths.join(' ')}\``;
  }
  const kem =
    m.label === 'CORE' ? '—' : `\`app.module.ts\`${m.hasWeb ? ', sidebar config' : ''}`;
  return `| \`${m.name}\` | ${label} | ${cmd} | ${kem} | ${m.note} |`;
}

const counts = { CORE: 0, OPT: 0, REF: 0 };
for (const m of info) counts[m.label]++;

const table = [
  BEGIN,
  '',
  `**${info.length} module backend** — ${counts.CORE} CORE · ${counts.REF} REF · ${counts.OPT} OPT.`,
  'Nhãn lấy TỪ `<module>.module.ts`, không gõ tay ở đây. Đổi nhãn thì sửa code',
  'rồi chạy `node tools/checks/check-cut-table.mjs --fix`.',
  '',
  '| Module | Nhãn | Lệnh xoá | File cần sửa kèm | Ghi chú |',
  '|---|---|---|---|---|',
  ...sorted.map(renderRow),
  '',
  END,
].join('\n');

// ── 3. Đối chiếu / ghi ───────────────────────────────────────────────────────
const spec = readFileSync(SPEC, 'utf8');
const i = spec.indexOf(BEGIN);
const j = spec.indexOf(END);
const current = i >= 0 && j > i ? spec.slice(i, j + END.length) : null;

/**
 * So sánh BỎ QUA ký tự xuống dòng. Repo này phát triển trên Windows (mọi commit
 * đều kèm cảnh báo CRLF); chỉ cần mở file bằng một editor khác là cả file đổi
 * sang CRLF và check đỏ dù nội dung y hệt. Dương tính giả kiểu đó sẽ bị vô hiệu
 * hoá sau vài lần — working-agreement §4.1b, thuộc tính "PHẢI ĐÚNG".
 */
const norm = (s) => s.replace(/\r/g, '');

const problems = [];
if (missingTag.length) {
  problems.push(
    `${missingTag.length} module KHÔNG có nhãn [CORE]/[OPT]/[REF] trong <module>.module.ts:\n` +
      missingTag.map((m) => `      - ${m}`).join('\n'),
  );
}

if (current === null) {
  problems.push('bảng §11 chưa có mốc sinh tự động (BẮT-ĐẦU/KẾT-THÚC)');
} else if (norm(current) !== norm(table)) {
  // Nói RÕ lệch ở đâu, không chỉ "khác nhau"
  const inTable = new Set([...current.matchAll(/^\| `([a-z-]+)` \|/gm)].map((x) => x[1]));
  const inCode = new Set(info.map((m) => m.name));
  const thieu = [...inCode].filter((m) => !inTable.has(m));
  const thua = [...inTable].filter((m) => !inCode.has(m));
  if (thieu.length) problems.push(`module có trong code mà THIẾU ở bảng: ${thieu.join(', ')}`);
  if (thua.length) problems.push(`bảng có dòng trỏ tới module KHÔNG TỒN TẠI: ${thua.join(', ')}`);
  if (!thieu.length && !thua.length) problems.push('nhãn hoặc ghi chú trong bảng lệch với code');
}

if (FIX) {
  if (missingTag.length) {
    console.error('❌ Không in lại bảng được khi còn module thiếu nhãn:');
    for (const m of missingTag) console.error(`   - apps/api/src/modules/${m}/${m}.module.ts`);
    process.exit(1);
  }
  const next =
    current === null
      ? spec.replace(/\*\*Bảng cắt gọt:\*\*/, `**Bảng cắt gọt:**\n\n${table}`)
      : spec.slice(0, i) + table + spec.slice(j + END.length);
  writeFileSync(SPEC, next, 'utf8');
  console.log(`✅ check-cut-table --fix: đã in lại bảng §11 cho ${info.length} module`);
  process.exit(0);
}

if (problems.length === 0) {
  console.log(
    `✅ check-cut-table: bảng §11 khớp ${info.length} module ` +
      `(${counts.CORE} CORE · ${counts.REF} REF · ${counts.OPT} OPT)`,
  );
  process.exit(0);
}

console.error('❌ check-cut-table: bảng cắt gọt §11 KHÔNG khớp code\n');
for (const p of problems) console.error(`   ❌ ${p}`);
console.error('');
console.error('   Bảng §11 là thứ ĐẦU TIÊN người khởi tạo dự án mới làm theo, và nó chứa');
console.error('   lệnh `rm -rf`. Một dòng trỏ sai đường dẫn thì nhẹ là không xoá được gì.');
console.error('');
console.error('   Sửa: gắn nhãn thiếu ở <module>.module.ts, rồi chạy');
console.error('        node tools/checks/check-cut-table.mjs --fix');
process.exit(1);
