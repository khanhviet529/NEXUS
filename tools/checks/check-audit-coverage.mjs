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
const AUDIT_RE = /AuditRepository|audit\.write\(/;

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const violations = [];
for (const mod of readdirSync(MODULES_DIR)) {
  const dir = join(MODULES_DIR, mod);
  if (!statSync(dir).isDirectory()) continue;
  const contents = filesUnder(dir).map((f) => readFileSync(f, 'utf8'));
  const hasMutation = contents.some((c) => MUTATION_RE.test(c));
  const hasAudit = contents.some((c) => AUDIT_RE.test(c));
  if (hasMutation && !hasAudit && !ALLOWLIST.has(mod)) violations.push(mod);
}

if (violations.length > 0) {
  console.error('❌ check-audit-coverage — module có endpoint GHI nhưng KHÔNG audit (ADR-0004):');
  for (const v of violations) {
    console.error(`   - apps/api/src/modules/${v} — thêm AuditRepository.write() hoặc allowlist kèm lý do §6.5`);
  }
  process.exit(1);
}
console.log(`✅ check-audit-coverage: ${ALLOWLIST.size} allowlist, 0 vi phạm`);
