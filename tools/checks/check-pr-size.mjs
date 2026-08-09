#!/usr/bin/env node
/**
 * Check #9 — kích thước PR (working-agreement §6: PR < 400 dòng, nhánh ≤ 2 ngày).
 *
 * Vì sao tồn tại: PR #12 vượt ngưỡng ~19 lần (7.472 dòng cần review, 115 file,
 * 16 commit) và không có gì báo. Một luật chỉ nằm trong tài liệu thì nó là lời nhắc; đưa
 * vào CI thì nó là luật.
 *
 * ⚠ Vượt ngưỡng thì ĐỎ, TRỪ KHI mô tả PR có dòng giải trình. Không chặn cứng
 * theo con số, nhưng cũng không chỉ cảnh báo:
 *
 *   Chặn cứng ở 400 dòng đẻ ra thói quen tệ hơn — người ta tách PR theo SỐ
 *   DÒNG chứ không theo Ý NGHĨA, ra một chuỗi PR không tự đứng được.
 *
 *   Còn cảnh báo suông thì không ai phải trả lời, và sau ba lần nó bị lờ.
 *
 * Nên cửa thoát là một dòng TƯỜNG MINH trong mô tả PR:
 *
 *     PR-SIZE-OK: <lý do vì sao không tách nhỏ hơn được>
 *
 * Nó buộc người mở PR viết ra lý do, và để lại dấu vết cho người review.
 *
 * Ngoại lệ tính: file sinh tự động, lockfile, ảnh baseline, snapshot — chúng
 * làm số dòng phình mà không tốn công review.
 */
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_REF ?? 'origin/main';
const SOFT = Number(process.env.PR_SIZE_SOFT ?? 400); // luật §6
/** Mô tả PR — workflow truyền qua env; rỗng nghĩa là không chạy trong ngữ cảnh PR */
const PR_BODY = process.env.PR_BODY ?? '';
/** Lý do phải là câu thật, không phải "PR-SIZE-OK: ok" */
const WAIVER = /^[ 	>*]*PR-SIZE-OK\s*:\s*(.{30,})$/im;

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
  // Mã 2 = không chạy được (hợp đồng ở run-all.mjs). Check này là TƯ VẤN và
  // chạy ở bước riêng, nhưng vẫn khai đúng mã để không ai đọc nhầm là "đạt".
  console.log(`⏭️  check-pr-size: không có ${BASE} — không so diff được`);
  process.exit(2);
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

const headline = `PR vượt ngưỡng §6: ${reviewed} dòng cần review (ngưỡng ${SOFT}, gấp ${(
  reviewed / SOFT
).toFixed(1)} lần)`;

const waiver = WAIVER.exec(PR_BODY);

if (waiver) {
  console.log(`✅ check-pr-size: ${headline}`);
  console.log(`   ${summary}`);
  console.log(`   Đã có giải trình trong mô tả PR: "${waiver[1].trim().slice(0, 120)}"`);
  process.exit(0);
}

// Không có mô tả PR → không phải ngữ cảnh pull_request, chỉ báo cho biết
if (!PR_BODY) {
  console.warn(`⚠️  check-pr-size: ${headline}`);
  console.warn(`   ${summary}`);
  console.warn('   (không có PR_BODY nên chưa đòi giải trình — chỉ báo)');
  process.exit(0);
}

if (process.env.GITHUB_ACTIONS) {
  console.log(`::error title=Kích thước PR::${headline}. ${summary}`);
}
console.error(`❌ check-pr-size: ${headline}`);
console.error(`   ${summary}`);
console.error(`   Tám file nặng nhất:\n${top}`);
console.error('');
console.error('   working-agreement §6: PR < 400 dòng, nhánh sống ≤ 2 ngày.');
console.error('   Tách theo Ý NGHĨA (mỗi PR tự đứng và review độc lập được),');
console.error('   hoặc dán MỘT dòng sau vào mô tả PR kèm lý do thật:');
console.error('');
console.error('       PR-SIZE-OK: <vì sao không tách nhỏ hơn được, ≥30 ký tự>');
process.exit(1);
