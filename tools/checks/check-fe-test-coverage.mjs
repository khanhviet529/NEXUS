#!/usr/bin/env node
/**
 * Check #6 — "chạm apps/web thì phải kèm test hoặc story".
 *
 * Lý do tồn tại: luật §7.2 ("build + tsc + lint KHÔNG phải test") vừa bị lách
 * đúng một lần — PR #4 merge 302 dòng order-form.tsx với 0 test. Agent quên
 * thì CI không quên.
 *
 * Cách chạy: so diff với nhánh gốc (mặc định origin/main, đổi bằng BASE_REF).
 * Chạy ở local không có origin/main thì check TỰ BỎ QUA — CI luôn có.
 *
 * Luật:
 *   Có file .tsx/.ts NGHIỆP VỤ bị thêm/sửa trong apps/web/src
 *   → phải có ÍT NHẤT một file .spec.ts(x) hoặc .stories.tsx được thêm/sửa.
 *
 * Miễn trừ (khai TƯỜNG MINH, kèm lý do — không phải nơi để giấu nợ):
 *   - chính file test/story/mock/helper test
 *   - file cấu hình, khai báo kiểu thuần, barrel export
 *   - trang page.tsx/layout.tsx: được E2E phủ, không ép story
 */
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_REF ?? 'origin/main';

function changedFiles() {
  try {
    execFileSync('git', ['rev-parse', '--verify', BASE], { stdio: 'ignore' });
  } catch {
    console.log(`⏭️  check-fe-test-coverage: không có ${BASE} — bỏ qua (CI luôn có)`);
    process.exit(0);
  }
  const merge = execFileSync('git', ['merge-base', 'HEAD', BASE], { encoding: 'utf8' }).trim();
  return execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', merge, 'HEAD'], {
    encoding: 'utf8',
  })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

const isWebSource = (f) => f.startsWith('apps/web/src/') && /\.(ts|tsx)$/.test(f);
const isTestOrStory = (f) => /\.(spec|test)\.(ts|tsx)$/.test(f) || /\.stories\.tsx$/.test(f);

/** File không mang hành vi → không ép test riêng */
const EXEMPT = [
  { re: /\/mocks\//, why: 'fixture MSW' },
  { re: /\/test\//, why: 'helper test' },
  { re: /\/messages\//, why: 'chuỗi i18n' },
  { re: /\/app\/.*\/(page|layout|loading|error|not-found)\.tsx$/, why: 'route — E2E phủ' },
  { re: /\/index\.ts$/, why: 'barrel export' },
  { re: /\.d\.ts$/, why: 'khai báo kiểu' },
];

const files = changedFiles();
const webSources = files.filter(isWebSource);
const behavioural = webSources.filter(
  (f) => !isTestOrStory(f) && !EXEMPT.some((e) => e.re.test(f)),
);
const proofs = files.filter((f) => f.startsWith('apps/web/') && isTestOrStory(f));

if (behavioural.length === 0) {
  console.log('✅ check-fe-test-coverage: không chạm code nghiệp vụ FE');
  process.exit(0);
}

if (proofs.length === 0) {
  console.error('❌ check-fe-test-coverage — chạm apps/web nhưng KHÔNG có test/story kèm:');
  for (const f of behavioural) console.error(`   - ${f}`);
  console.error('');
  console.error('   CLAUDE.md §7.2: build + tsc + lint KHÔNG phải test.');
  console.error('   Thêm <tên>.spec.tsx (hành vi) hoặc <tên>.stories.tsx (hình thức),');
  console.error('   hoặc khai miễn trừ kèm LÝ DO trong tools/checks/check-fe-test-coverage.mjs.');
  process.exit(1);
}

console.log(
  `✅ check-fe-test-coverage: ${behavioural.length} file nghiệp vụ, ${proofs.length} file test/story kèm`,
);
