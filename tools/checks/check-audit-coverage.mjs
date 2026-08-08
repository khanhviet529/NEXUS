import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Check #8 (ADR-0004): module có endpoint GHI phải tham chiếu AuditRepository.
 * Audit là TƯỜNG MINH (không extension tự động) → CI bịt lỗ "quên audit".
 * Allowlist = bảng mà ma trận §6.5 KHÔNG yêu cầu audit (dữ liệu cá nhân hoá,
 * hạ tầng thuần) hoặc module không ghi DB nghiệp vụ trực tiếp.
 */
const MODULES_DIR = join(process.cwd(), 'apps/api/src/modules');

const ALLOWLIST = new Map([
  ['personalization', 'recent/favorite_items — §6.5 không audit, xoá cứng'],
  ['notifications', 'mark-read own + preferences — §6.5 không audit'],
  ['saved-views', 'saved_views/user_preferences — §6.5 không audit, xoá cứng'],
  ['reports', 'chỉ ĐỌC (Kysely) — POST run/export không ghi DB'],
  ['search', 'chỉ đọc'],
  ['health', 'không ghi'],
  ['exports', 'POST chỉ enqueue job — file/notification đã audit ở FilesRepository'],
  ['idempotency', 'hạ tầng §3.9 — idempotency_requests không audit theo §6.5'],
  ['outbox', 'hạ tầng §4.8 — outbox_events không audit theo §6.5'],
]);

const MUTATION_RE = /@(Post|Patch|Put|Delete)\(/;
const AUDIT_RE = /AuditRepository|audit\.write(InTx)?\(/;
/**
 * ADR-0004 đk3: action phải LẤY TỪ REGISTRY, không chuỗi tự do.
 * Chỉ soi literal nằm TRONG object truyền vào audit.write/writeInTx —
 * `action: 'submit' | 'approve'` của khai báo kiểu tham số không phải vi phạm.
 */
const AUDIT_CALL_RE = /audit\.write(?:InTx)?\(([\s\S]{0,600}?)\)\s*;/g;
const ACTION_LITERAL_RE = /action:\s*'([^']+)'/g;
const ACTIONS_FILE = join(process.cwd(), 'packages/shared/src/audit-actions.ts');

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

// Registry action — nguồn sự thật duy nhất (ADR-0004)
const registrySrc = readFileSync(ACTIONS_FILE, 'utf8');
const KNOWN_ACTIONS = new Set(
  [...registrySrc.matchAll(/^\s{2}([A-Z_]+):\s*'([^']+)',/gm)].map((m) => m[2]),
);

const missingAudit = [];
const freeStringActions = [];
for (const mod of readdirSync(MODULES_DIR)) {
  const dir = join(MODULES_DIR, mod);
  if (!statSync(dir).isDirectory()) continue;
  const files = filesUnder(dir);
  const contents = files.map((f) => readFileSync(f, 'utf8'));
  const hasMutation = contents.some((c) => MUTATION_RE.test(c));
  const hasAudit = contents.some((c) => AUDIT_RE.test(c));
  if (hasMutation && !hasAudit && !ALLOWLIST.has(mod)) missingAudit.push(mod);

  // ADR-0004 đk3: chuỗi action tự do làm timeline §4.9 mất ngữ nghĩa —
  // lợi ích CHÍNH của việc giữ audit tường minh sẽ mai một
  files.forEach((file, i) => {
    for (const call of contents[i].matchAll(AUDIT_CALL_RE)) {
      for (const m of call[1].matchAll(ACTION_LITERAL_RE)) {
        if (!KNOWN_ACTIONS.has(m[1])) {
          freeStringActions.push(`${file.replace(process.cwd(), '.')} — action: '${m[1]}'`);
        }
      }
    }
  });
}

let failed = false;
if (missingAudit.length > 0) {
  failed = true;
  console.error('❌ check-audit-coverage — module có endpoint GHI nhưng KHÔNG audit (ADR-0004):');
  for (const v of missingAudit) {
    console.error(`   - apps/api/src/modules/${v} — thêm AuditRepository.write() hoặc allowlist kèm lý do §6.5`);
  }
}
if (freeStringActions.length > 0) {
  failed = true;
  console.error('❌ check-audit-coverage — action KHÔNG có trong AUDIT_ACTIONS (ADR-0004 đk3):');
  for (const v of freeStringActions) console.error(`   - ${v}`);
  console.error('   Timeline §4.9 phải đọc được → khai action ở packages/shared/src/audit-actions.ts trước.');
}
if (failed) process.exit(1);

console.log(
  `✅ check-audit-coverage: ${ALLOWLIST.size} allowlist, ${KNOWN_ACTIONS.size} action hợp lệ, 0 vi phạm`,
);
