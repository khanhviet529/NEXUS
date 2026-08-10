#!/usr/bin/env node
/**
 * Check #11 — component phải được NỐI vào màn hình nghiệp vụ thật.
 *
 * Vì sao tồn tại: đo lại repo sau GĐ A cho thấy `DetailLayout` và `FilterBar`
 * mỗi cái chỉ được dùng ở ĐÚNG MỘT file — `design-system/preview/screens.tsx`
 * — còn `ExportDialog` thì 0 file. Tức là dựng xong, chụp ảnh baseline, và
 * chưa màn hình nghiệp vụ nào dùng.
 *
 * Ảnh baseline của một component chưa màn hình nào dùng thì bảo vệ cái gì?
 *
 * Đây là lần thứ NĂM của cùng một khuôn mẫu trong dự án này:
 *   check #6 chạy rỗng · CD chưa từng build image · make setup chưa từng chạy
 *   trọn · lưới phòng vệ của generator không tồn tại · và bây giờ là đây.
 *   "Cơ chế tồn tại, được ghi trong tài liệu, chưa từng chạy lần nào."
 *
 * LUẬT: mỗi component export từ `design-system/` hoặc `components/common/`
 * phải có ≥1 import từ `app/(dashboard)/` HOẶC `features/`.
 * Chỉ được dùng ở `preview/` hoặc `*.stories.*` → ĐỎ.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const WEB = join(ROOT, 'apps/web/src');
const SOURCES = [join(WEB, 'design-system'), join(WEB, 'components/common')];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const rel = (f) => relative(ROOT, f).replace(/\\/g, '/');
const isTestOrStory = (f) => /\.(spec|test|stories)\.tsx?$/.test(f);

/**
 * Miễn trừ — khai TƯỜNG MINH kèm lý do. Không phải nơi giấu nợ.
 * Mỗi dòng phải trả lời được: vì sao component này KHÔNG cần màn hình thật?
 */
const EXEMPT = new Map([
  ['ProjectUIProvider', 'provider hạ tầng — gắn ở app/providers.tsx, không phải component màn hình'],
  ['AppShell', 'router shell — dùng ở app/(dashboard)/layout.tsx, không import theo tên component'],
  ['SidebarShell', 'shell cụ thể — AppShell chọn qua registry, không ai import trực tiếp'],
  ['HybridShell', 'như SidebarShell'],
  ['DetailField', 'phần tử con của DetailLayout, luôn đi kèm nó'],
]);

// ── Thu thập component export ────────────────────────────────────────────────
const components = new Map(); // tên → file khai báo
for (const dir of SOURCES) {
  for (const f of walk(dir)) {
    if (!f.endsWith('.tsx') || isTestOrStory(f)) continue;
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/^export\s+(?:function|const)\s+([A-Z][A-Za-z0-9]*)/gm)) {
      components.set(m[1], rel(f));
    }
  }
}

// ── Thu thập nơi dùng ────────────────────────────────────────────────────────
/**
 * "Dùng thật" = đi tới được màn hình nghiệp vụ.
 *
 * Yêu cầu ban đầu ghi `app/(dashboard)/` HOẶC `features/`. Chạy thử thì
 * `DisabledTooltip` bị báo sai: nó dùng ở `lib/actions/renderers.tsx` — Action
 * Registry (§5.9), là mã production render THẲNG vào màn hình thật, chỉ không
 * nằm trong hai thư mục kia.
 *
 * Nới thêm `lib/` là có chủ đích, KHÔNG phải nới luật: đích của check là
 * "component có tới tay người dùng không", và qua Action Registry thì có.
 * Check có dương tính giả sẽ bị vô hiệu hoá sau vài lần — đó mới là mất mát
 * thật.
 */
const REAL_SCREEN = /apps\/web\/src\/(app\/\(dashboard\)|features|lib)\//;
const PREVIEW_ONLY = /apps\/web\/src\/app\/design-system\/preview\//;

const usedInReal = new Map(); // tên → [file]
const usedInPreview = new Map();

for (const f of walk(WEB)) {
  if (!/\.tsx?$/.test(f)) continue;
  const r = rel(f);
  const isReal = REAL_SCREEN.test(r);
  const isPreview = PREVIEW_ONLY.test(r);
  if (!isReal && !isPreview) continue;
  if (isTestOrStory(f)) continue;

  const src = readFileSync(f, 'utf8');
  for (const name of components.keys()) {
    // Chỉ tính khi component được IMPORT — xuất hiện trong chuỗi/comment không tính
    const imported = new RegExp(`import[^;]*\\b${name}\\b[^;]*from`, 's').test(src);
    if (!imported) continue;
    const bucket = isReal ? usedInReal : usedInPreview;
    if (!bucket.has(name)) bucket.set(name, []);
    bucket.get(name).push(r);
  }
}

// ── Đối chiếu ────────────────────────────────────────────────────────────────
const onlyPreview = [];
const unused = [];

for (const [name, declaredAt] of components) {
  if (EXEMPT.has(name)) continue;
  if (usedInReal.has(name)) continue;
  if (usedInPreview.has(name)) onlyPreview.push({ name, declaredAt });
  else unused.push({ name, declaredAt });
}

const total = components.size - EXEMPT.size;
const connected = total - onlyPreview.length - unused.length;

if (onlyPreview.length === 0 && unused.length === 0) {
  console.log(`✅ check-component-usage: ${connected}/${total} component đã nối vào màn hình thật`);
  process.exit(0);
}

console.error(
  `❌ check-component-usage: ${onlyPreview.length + unused.length}/${total} component chưa nối vào màn hình nghiệp vụ\n`,
);
for (const { name, declaredAt } of onlyPreview) {
  console.error(
    `   ❌ ${name} chỉ được dùng ở preview — chưa nối vào màn hình nghiệp vụ nào`,
  );
  console.error(`      khai ở ${declaredAt}, dùng ở ${usedInPreview.get(name).join(', ')}`);
}
for (const { name, declaredAt } of unused) {
  console.error(`   ❌ ${name} KHÔNG được dùng ở đâu cả — kể cả preview`);
  console.error(`      khai ở ${declaredAt}`);
}
console.error('');
console.error('   Nối vào một màn hình trong app/(dashboard)/ hoặc features/,');
console.error('   hoặc khai miễn trừ KÈM LÝ DO trong EXEMPT của check này.');
console.error('   Ảnh baseline của component chưa màn hình nào dùng không bảo vệ được gì.');
process.exit(1);
