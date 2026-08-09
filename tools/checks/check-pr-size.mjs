#!/usr/bin/env node
/**
 * Check #9 — kích thước PR (working-agreement §6: PR < 400 dòng, nhánh ≤ 2 ngày).
 *
 * Vì sao tồn tại: PR #12 vượt ngưỡng ~19 lần (7.472 dòng cần review, 115 file,
 * 16 commit) và không có gì báo. Một luật chỉ nằm trong tài liệu thì nó là lời nhắc; đưa
 * vào CI thì nó là luật.
 *
 * ⚠ Check này CẢNH BÁO, không chặn — và đó là chủ ý:
 *
 *   Chặn cứng ở 400 dòng sẽ đẻ ra thói quen tệ hơn: người ta tách PR theo SỐ
 *   DÒNG chứ không theo Ý NGHĨA, ra một chuỗi PR không tự đứng được, review
 *   từng cái đều vô nghĩa. Cái ta muốn là người mở PR PHẢI GIẢI THÍCH khi vượt
 *   ngưỡng, không phải là con số luôn nằm dưới ngưỡng.
 *
 * Ngoại lệ tính: file sinh tự động, lockfile, ảnh baseline, snapshot — chúng
 * làm số dòng phình mà không tốn công review.
 */
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_REF ?? 'origin/main';
const SOFT = Number(process.env.PR_SIZE_SOFT ?? 400); // luật §6
const LOUD = Number(process.env.PR_SIZE_LOUD ?? 800); // ngưỡng cảnh báo to

/** Không tính vào công review — sinh tự động hoặc nhị phân */
const NOT_REVIEWED = [
  { re: /pnpm-lock\.yaml$/, why: 'lockfile' },
  { re: /\.gen\.ts$/, why: 'file sinh tự động' },
  { re: /packages\/api-client\//, why: 'sinh từ OpenAPI (pnpm gen:api)' },
  { re: /\.(png|jpe?g|gif|webp|ico|pdf)$/i, why: 'nhị phân / ảnh baseline' },
  { re: /__snapshots__\//, why: 'snapshot' },
  { re: /\.snap$/, why: 'snapshot' },
];

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

try {
  execFileSync('git', ['rev-parse', '--verify', BASE], { stdio: 'ignore' });
} catch {
  // Check này là TƯ VẤN nên không đỏ, nhưng vẫn phải kêu ở CI — im lặng bỏ qua
  // là cách check-fe-test-coverage đã chạy rỗng suốt nhiều PR.
  const where = process.env.GITHUB_ACTIONS ? 'CI (thiếu fetch-depth: 0?)' : 'local';
  console.log(`⏭️  check-pr-size: không có ${BASE} — bỏ qua ở ${where}`);
  process.exit(0);
}

const merge = git(['merge-base', 'HEAD', BASE]).trim();
const numstat = git(['diff', '--numstat', merge, 'HEAD'])
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    const [added, removed, ...rest] = l.split('\t');
    return { added: Number(added) || 0, removed: Number(removed) || 0, file: rest.join('\t') };
  });

let reviewed = 0;
let generated = 0;
const reviewedFiles = [];

for (const row of numstat) {
  const exempt = NOT_REVIEWED.find((e) => e.re.test(row.file));
  const churn = row.added + row.removed;
  if (exempt) {
    generated += churn;
  } else {
    reviewed += churn;
    reviewedFiles.push({ file: row.file, churn });
  }
}

const commits = git(['rev-list', '--count', `${merge}..HEAD`]).trim();
const summary =
  `${reviewed} dòng cần review · ${generated} dòng sinh tự động · ` +
  `${numstat.length} file · ${commits} commit`;

if (reviewed <= SOFT) {
  console.log(`✅ check-pr-size: ${summary} (ngưỡng §6 là ${SOFT})`);
  process.exit(0);
}

const top = reviewedFiles
  .sort((a, b) => b.churn - a.churn)
  .slice(0, 8)
  .map((f) => `      ${String(f.churn).padStart(6)}  ${f.file}`)
  .join('\n');

const level = reviewed > LOUD ? 'error' : 'warning';
const headline =
  reviewed > LOUD
    ? `PR VƯỢT XA ngưỡng §6: ${reviewed} dòng (gấp ${(reviewed / SOFT).toFixed(1)} lần ${SOFT})`
    : `PR vượt ngưỡng §6: ${reviewed} dòng (ngưỡng ${SOFT})`;

// Annotation của GitHub Actions — hiện thẳng trên PR, không phải chỉ trong log
if (process.env.GITHUB_ACTIONS) {
  console.log(`::${level} title=Kích thước PR::${headline}. ${summary}`);
}

console.warn(`⚠️  check-pr-size: ${headline}`);
console.warn(`   ${summary}`);
console.warn(`   Tám file nặng nhất:\n${top}`);
console.warn('');
console.warn('   working-agreement §6: PR < 400 dòng, nhánh sống ≤ 2 ngày.');
console.warn('   Nếu KHÔNG tách được thì viết vào mô tả PR lý do vì sao — check');
console.warn('   này cố ý không chặn, nhưng vượt ngưỡng mà im lặng thì lần sau');
console.warn('   nó thành bình thường.');

// Cố ý exit 0: xem chú thích đầu file
process.exit(0);
