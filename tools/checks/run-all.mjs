#!/usr/bin/env node
/**
 * Chạy toàn bộ check kiến trúc — working-agreement §4.1.
 * (Check no-Prisma-ngoài-repository và no-any nằm ở ESLint;
 *  check @RequirePermission nằm ở test require-permission.spec.ts.)
 *
 * ═══ HỢP ĐỒNG MÃ THOÁT ═══
 *   0 → ĐÃ CHẠY, đạt
 *   2 → KHÔNG CHẠY ĐƯỢC (thiếu tiền đề, ví dụ không có nhánh gốc để so diff)
 *   khác → ĐỎ
 *
 * Vì sao tách mã 2 ra: `check-fe-test-coverage` từng thoát 0 kèm dòng "bỏ qua"
 * và đã chạy RỖNG ở mọi PR kể từ khi ra đời — không ai biết, vì bảng kết quả
 * toàn dấu ✅. Một check tự tắt ở đúng nơi nó cần chạy còn tệ hơn không có
 * check: nó tạo cảm giác đã được canh.
 *
 * Chính sách "bỏ qua có được phép không" nằm ở ĐÂY, một chỗ duy nhất, chứ
 * không rải vào từng check. Ở local được bỏ qua; ở CI thì ĐỎ.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const IN_CI = !!process.env.GITHUB_ACTIONS;

/** Thứ tự có ý nghĩa: gen-model-list sinh lại registry trước khi ai đọc nó */
const checks = [
  'gen-model-list.mjs', // sinh lại registry trước
  'check-tenancy-policy.mjs',
  'check-matrix.mjs',
  'check-no-role-branching.mjs',
  'check-audit-coverage.mjs', // ADR-0004: audit tường minh, CI gác chỗ quên
  'check-fe-test-coverage.mjs', // §7.2: chạm apps/web phải kèm test/story
  'check-token-layers.mjs', // fe-preset-system §3.4: kỷ luật ba tầng token
  'check-raw-sql.mjs', // test-catalog §3B: AR3/AR4/AR14 — AR14 gác bảng HYBRID
  'check-module-registry.mjs', // test #37: module mới phải khai model, đi ngược từ code về registry
  'check-cut-table.mjs', // V5: bảng cắt gọt §11 phải khớp 24 module có thật (F-05, F-07)
];

/**
 * Check tồn tại trên đĩa mà quên đăng ký ở đây là dạng "không chạy" triệt để
 * nhất: file có, luật có, mà không ai gọi. Đây là cách nó bị phát hiện.
 * `check-pr-size.mjs` cố ý không nằm trong danh sách — nó là TƯ VẤN, chạy ở
 * bước riêng của workflow và chỉ có nghĩa với pull_request.
 */
const ADVISORY = new Set([
  'check-pr-size.mjs',
  // check #11 CỐ Ý chưa vào danh sách chạy bắt buộc: hiện nó ĐỎ với 3 component
  // (DetailLayout · FilterBar · StatusBadge) và sẽ còn đỏ cho tới khi V9–V13 nối
  // chúng vào màn hình thật. Đưa vào `checks` ngay bây giờ là chặn mọi PR khác
  // vì một khoản nợ đã biết.
  //
  // Nó KHÔNG phải check tư vấn: chuyển sang `checks` ở CHÍNH PR làm nó xanh.
  // Đó là điều kiện nghiệm thu của GĐ A2, ghi ở progress.md.
  'check-component-usage.mjs',
]);
const onDisk = readdirSync(dir).filter((f) => f.startsWith('check-') && f.endsWith('.mjs'));
const unregistered = onDisk.filter((f) => !checks.includes(f) && !ADVISORY.has(f));

if (unregistered.length) {
  console.error('❌ Có file check KHÔNG được đăng ký trong run-all.mjs:');
  for (const f of unregistered) console.error(`   - ${f}`);
  console.error('   Thêm vào mảng `checks`, hoặc vào ADVISORY kèm lý do.');
  process.exit(1);
}

const ran = [];
const skipped = [];
const failed = [];

for (const check of checks) {
  const r = spawnSync(process.execPath, [resolve(dir, check)], { stdio: 'inherit' });
  if (r.status === 0) ran.push(check);
  else if (r.status === 2) skipped.push(check);
  else failed.push(`${check} (mã thoát ${String(r.status)})`);
}

console.log('');
console.log(`— ${ran.length}/${checks.length} check ĐÃ CHẠY —`);

if (skipped.length) {
  console.log(`   ${skipped.length} check KHÔNG chạy được: ${skipped.join(', ')}`);
}
if (failed.length) {
  console.error(`   ${failed.length} check ĐỎ: ${failed.join(', ')}`);
}

// Ở CI, "không chạy được" là lỗi CẤU HÌNH và phải đỏ — thường là
// actions/checkout thiếu `fetch-depth: 0` nên không có nhánh gốc để so diff.
if (IN_CI && skipped.length) {
  console.error('');
  console.error('❌ Ở CI, check bỏ qua = lỗi cấu hình, không phải chuyện bình thường.');
  console.error('   Kiểm `fetch-depth: 0` và bước fetch nhánh gốc trong workflow.');
  process.exit(1);
}

process.exit(failed.length ? 1 : 0);
