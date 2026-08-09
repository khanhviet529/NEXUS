#!/usr/bin/env node
/**
 * Check #8 — kỷ luật SQL thô (test-catalog §3B: AR3, AR4, AR14).
 *
 * AR14 là luật quan trọng nhất ở đây, và lý do đáng đọc kỹ:
 *
 *   UPDATE settings SET value = 'x' WHERE id = '<id của tenant B>';
 *
 * KHÔNG ràng buộc DB nào chặn được câu này. Composite FK, partial unique,
 * NOT NULL — không cái nào biết *caller hiện tại thuộc tenant nào*. Không bật
 * PostgreSQL RLS thì DB không có khái niệm tenant của request.
 *
 * Hệ quả: với `settings` và `feature_flags` (hai bảng HYBRID), extension là
 * lớp bảo vệ DUY NHẤT. Một câu SQL thô đi vòng qua nó là đi vòng qua TẤT CẢ.
 * Đây là lý do luật này phải là check tĩnh, không phải test DB — test DB không
 * chứng minh được "không tồn tại đường vòng nào".
 *
 * Ba luật:
 *   AR3  không $queryRawUnsafe / $executeRawUnsafe ở bất kỳ đâu (SQL injection)
 *   AR4  Kysely không có lời gọi ghi (§4.9 — ghi qua Kysely không đi qua audit)
 *   AR14 không SQL ghi vào bảng HYBRID ngoài allowlist migration
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'apps/api/src');
const errors = [];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const rel = (f) => relative(ROOT, f).replace(/\\/g, '/');
const files = walk(SRC).filter((f) => !f.endsWith('.spec.ts'));

/** Bảng HYBRID — lấy từ TENANCY_POLICY, không chép tay */
const policySrc = readFileSync(join(ROOT, 'packages/shared/src/tenancy-policy.ts'), 'utf8');
const hybridBlock = /HYBRID:\s*\[([^\]]*)\]/.exec(policySrc);
const hybridModels = hybridBlock
  ? [...hybridBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  : [];
if (hybridModels.length === 0) {
  errors.push('❌ Không đọc được model HYBRID nào từ packages/shared/src/tenancy-policy.ts');
}
/** Model Prisma → tên bảng: Setting → settings. Giữ cả hai dạng cho chắc. */
const hybridTables = hybridModels.flatMap((m) => {
  const snake = m.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  return [snake, `${snake}s`, `${snake}es`];
});

const UNSAFE = /\$(?:query|execute)RawUnsafe\b/;
const KYSELY_WRITE = /\.\s*(insertInto|updateTable|deleteFrom|replaceInto)\s*\(/;
const RAW_CALL = /\$(?:query|execute)Raw(?:Typed)?\b/;
const SQL_WRITE = /\b(insert\s+into|update|delete\s+from)\b/i;

/**
 * Miễn trừ — khai TƯỜNG MINH kèm lý do.
 * Đường dẫn migration/seed nằm ngoài apps/api/src nên không cần khai ở đây.
 */
const EXEMPT = [
  {
    re: /infra\/prisma\/prisma\.service\.ts$/,
    rule: 'AR4',
    why: 'nơi duy nhất dựng client; không có lời gọi ghi Kysely thật',
  },
];

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');

  lines.forEach((line, i) => {
    const at = `${rel(f)}:${i + 1}`;
    // Bỏ comment để chú thích nhắc tên luật không tự làm đỏ chính nó
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');

    if (UNSAFE.test(code)) {
      errors.push(`❌ AR3 — ${at}: dùng $queryRawUnsafe/$executeRawUnsafe. Dùng bản có tag template.`);
    }

    if (KYSELY_WRITE.test(code) && !EXEMPT.some((e) => e.rule === 'AR4' && e.re.test(rel(f)))) {
      errors.push(
        `❌ AR4 — ${at}: ghi qua Kysely. Write phải đi qua Prisma repository để audit thấy (§4.9).`,
      );
    }
  });

  // AR14 xét theo KHỐI, không theo dòng: câu SQL nhiều dòng là chuyện thường
  if (RAW_CALL.test(src)) {
    for (const block of src.split(RAW_CALL).slice(1)) {
      const head = block.slice(0, 400);
      if (!SQL_WRITE.test(head)) continue;
      const table = hybridTables.find((t) => new RegExp(`\\b${t}\\b`, 'i').test(head));
      if (table) {
        errors.push(
          `❌ AR14 — ${rel(f)}: SQL thô GHI vào bảng HYBRID "${table}". ` +
            `Extension là lớp chặn DUY NHẤT cho bảng này (không ràng buộc DB nào biết tenant của request); ` +
            `đi vòng qua nó là mở đường ghi chéo tenant.`,
        );
      }
    }
  }
}

if (errors.length) {
  console.error(`❌ check-raw-sql: ${errors.length} vi phạm\n`);
  for (const e of errors) console.error(`   ${e}`);
  console.error('\n   Đọc docs/test-catalog.md §3B (AR3/AR4/AR14) và §3C/H12.');
  process.exit(1);
}

console.log(
  `✅ check-raw-sql: ${files.length} file, ${hybridModels.length} model HYBRID (${hybridModels.join(', ')}) không có đường ghi vòng`,
);
