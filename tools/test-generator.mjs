#!/usr/bin/env node
/**
 * TEST #37 — generator `pnpm gen:module` (điều kiện của GĐ C).
 *
 * Vì sao là script chứ không phải file vitest: test này SỬA repo (sinh file,
 * chèn model vào schema, chạy migration) rồi dọn lại. Chạy chung tiến trình
 * với vitest thì một lần đỏ giữa chừng sẽ để lại rác cho mọi test sau.
 *
 * BỐN KHẲNG ĐỊNH — khẳng định 2 là cái dễ bị bỏ nhất:
 *
 *   1. Sinh ĐỦ 7 file, đúng đường dẫn
 *   2. CHECK KIẾN TRÚC PHẢI ĐỎ NGAY SAU KHI SINH
 *      Generator CỐ Ý không sửa registry dùng chung. Nếu check vẫn xanh thì
 *      cơ chế phòng vệ đã hỏng — và đó NGUY HIỂM HƠN generator hỏng: người ta
 *      sẽ tin là mình không quên gì.
 *   3. Khai registry → check xanh, migrate được, typecheck xanh
 *   4. TEST SINH KÈM PHẢI CHẠY VÀ XANH
 *      Điều duy nhất chứng minh code HOẠT ĐỘNG, không chỉ BIÊN DỊCH.
 *
 * Dọn dẹp: khôi phục mọi file đã sửa. Bước cuối của job CI chạy
 * `git diff --exit-code` để kiểm CHÍNH hàm dọn dẹp này — dọn sót thì đỏ.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const NAME = 'sweepwidget'; // số ít, kebab-case; số nhiều = + 's'
const PLURAL = `${NAME}s`;
const MODEL = 'Sweepwidget';
const MIGRATION = '29990101000000_test37_tam';

const SCHEMA = join(ROOT, 'apps/api/prisma/schema.prisma');
const POLICY = join(ROOT, 'packages/shared/src/tenancy-policy.ts');
const PERMS = join(ROOT, 'packages/shared/src/permissions.ts');
// Ma trận §6.5 nằm ở BOILERPLATE-SPEC, không phải permission-matrix.md —
// check-matrix.mjs đọc đúng file này và chỉ nhận bảng trong mục `## 6.5`.
const SPEC = join(ROOT, 'docs/boilerplate-spec.md');
const SOFTDEL = join(ROOT, 'packages/shared/src/soft-delete-models.ts');
const APPMODULE = join(ROOT, 'apps/api/src/app.module.ts');
const SEEDROLES = join(ROOT, 'packages/shared/src/seed-roles.ts');
const ANCHOR = '// <<< GEN_TEST_ANCHOR';

/** 7 file generator phải sinh — danh sách này LÀ khẳng định 1 */
const EXPECTED_FILES = [
  `apps/api/src/modules/${PLURAL}/${PLURAL}.module.ts`,
  `apps/api/src/modules/${PLURAL}/${PLURAL}.controller.ts`,
  `apps/api/src/modules/${PLURAL}/${PLURAL}.repository.ts`,
  `apps/web/src/features/${PLURAL}/schema.ts`,
  `apps/web/src/features/${PLURAL}/actions.ts`,
  `apps/web/src/app/(dashboard)/${PLURAL}/page.tsx`,
  `apps/api/test/${PLURAL}.spec.ts`,
];

const originals = new Map();
const results = [];
let failed = false;

function remember(file) {
  if (!originals.has(file)) originals.set(file, readFileSync(file, 'utf8'));
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, ...opts.env },
    timeout: opts.timeout ?? 600_000,
  });
  return { status: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function assert(label, ok, detail = '') {
  results.push({ label, ok, detail });
  if (!ok) failed = true;
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// ── Dọn dẹp: gọi ở MỌI đường ra, kể cả khi ném lỗi ─────────────────────────
function cleanup() {
  for (const [file, content] of originals) writeFileSync(file, content, 'utf8');
  for (const f of EXPECTED_FILES) rmSync(join(ROOT, f), { force: true });
  rmSync(join(ROOT, `apps/api/src/modules/${PLURAL}`), { recursive: true, force: true });
  rmSync(join(ROOT, `apps/web/src/features/${PLURAL}`), { recursive: true, force: true });
  rmSync(join(ROOT, `apps/web/src/app/(dashboard)/${PLURAL}`), { recursive: true, force: true });
  rmSync(join(ROOT, `apps/api/prisma/migrations/${MIGRATION}`), { recursive: true, force: true });
  // Registry sinh tự động — dựng lại theo schema đã khôi phục
  run(process.execPath, [join(ROOT, 'tools/checks/gen-model-list.mjs')]);
  run('npx', ['prisma', 'generate'], { cwd: join(ROOT, 'apps/api') });
}

process.on('exit', () => {
  if (originals.size > 0) cleanup();
});

try {
  // ══ KHẲNG ĐỊNH 1 — sinh đủ 7 file ════════════════════════════════════════
  for (const f of EXPECTED_FILES) rmSync(join(ROOT, f), { force: true });

  const gen = run('npx', [
    'plop',
    '--plopfile',
    'tools/generator/plopfile.mjs',
    'module',
    NAME,
  ]);
  const missing = EXPECTED_FILES.filter((f) => !existsSync(join(ROOT, f)));
  assert(
    '#1 sinh đủ 7 file đúng đường dẫn',
    gen.status === 0 && missing.length === 0,
    missing.length ? `thiếu: ${missing.join(', ')}` : `${EXPECTED_FILES.length} file`,
  );
  if (missing.length) throw new Error('không sinh được file — dừng, các bước sau vô nghĩa');

  // ══ KHẲNG ĐỊNH 2 — check PHẢI ĐỎ ═════════════════════════════════════════
  // Generator cố ý không sửa registry. Check xanh ở đây nghĩa là lưới phòng vệ
  // đã hỏng, và đó nguy hiểm hơn generator hỏng.
  const before = run(process.execPath, ['tools/checks/run-all.mjs']);
  assert(
    '#2 check kiến trúc ĐỎ ngay sau khi sinh (chưa khai registry)',
    before.status !== 0,
    before.status === 0
      ? 'CHECK VẪN XANH — lưới phòng vệ hỏng, xem tools/checks/check-tenancy-policy + check-matrix'
      : `mã thoát ${before.status}`,
  );

  // ══ KHẲNG ĐỊNH 3 — khai registry → xanh, migrate được, typecheck xanh ════
  remember(SCHEMA);
  const schema = readFileSync(SCHEMA, 'utf8');
  if (!schema.includes(ANCHOR)) throw new Error(`schema.prisma thiếu mốc ${ANCHOR}`);
  writeFileSync(
    SCHEMA,
    `${schema}

/// Tenancy: TENANT · Base: TenantAudited — model TẠM của test #37
model ${MODEL} {
  id          String   @id @default(uuid(7)) @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz
  createdById String?  @map("created_by_id") @db.Uuid
  updatedById String?  @map("updated_by_id") @db.Uuid
  deletedAt   DateTime? @map("deleted_at") @db.Timestamptz
  version     Int      @default(0)

  tenantId String @map("tenant_id") @db.Uuid
  code     String
  name     Json
  // Cột tìm-không-dấu (§3.10). Repository do generator sinh GHI hai cột này;
  // thiếu chúng thì typecheck VẪN XANH (buildSearchColumns trả kiểu lỏng) mà
  // runtime 500. Đó là phát hiện, ghi ở SWEEP-REPORT.
  nameViSearch String? @map("name_vi_search")
  nameEnSearch String? @map("name_en_search")

  @@unique([tenantId, code])
  @@map("${PLURAL}")
}
`,
    'utf8',
  );

  remember(POLICY);
  const policy = readFileSync(POLICY, 'utf8');
  writeFileSync(POLICY, policy.replace("  TENANT: [\n", `  TENANT: [\n    '${MODEL}',\n`), 'utf8');

  // Ma trận §6.5 — chèn dòng NGAY SAU header bảng, phải nằm TRONG mục 6.5
  remember(SPEC);
  const spec = readFileSync(SPEC, 'utf8');
  const header = '| Bảng | Tenancy | Base | Soft delete | Audit | Partition |';
  const at = spec.indexOf(header);
  if (at < 0) throw new Error('không thấy header bảng §6.5 trong boilerplate-spec.md');
  // Chèn NGAY SAU dòng ngăn cách của bảng (|---|---|…) để dòng mới nằm trong bảng
  const NL = '\n';
  const afterHeader = spec.indexOf(NL, at) + 1;
  const lineEnd = spec.indexOf(NL, afterHeader); // hết dòng `|---|---|`
  writeFileSync(
    SPEC,
    spec.slice(0, lineEnd + 1) +
      `| \`${PLURAL}\` | TENANT | TenantAudited | ✅ | ✅ | — |${NL}` +
      spec.slice(lineEnd + 1),
    'utf8',
  );

  // Model có deletedAt → phải khai soft-delete, nếu không check vét cạn đỏ
  remember(SOFTDEL);
  const sd = readFileSync(SOFTDEL, 'utf8');
  const sdAnchor = /(SOFT_DELETE_MODELS[^=]*=\s*\[)/;
  if (!sdAnchor.test(sd)) throw new Error('không thấy mảng SOFT_DELETE_MODELS');
  writeFileSync(SOFTDEL, sd.replace(sdAnchor, `$1${NL}  '${MODEL}',`), 'utf8');

  // Bước 2 + 5 của CHECKLIST generator: quyền và đăng ký module
  remember(PERMS);
  const perms = readFileSync(PERMS, 'utf8');
  const permBlock = ['read', 'create', 'update', 'delete']
    .map((a) => `  p('${NAME}', '${a}'),`)
    .join(NL);
  // Neo vào MẢNG THẬT `= [`, không phải `PermissionDef[]` ở phần khai kiểu —
  // regex lỏng khớp vào chỗ sau và đẻ ra file TS hỏng cú pháp.
  const permAnchor = 'export const PERMISSIONS: readonly PermissionDef[] = [';
  if (!perms.includes(permAnchor)) throw new Error('không thấy mảng PERMISSIONS');
  writeFileSync(PERMS, perms.replace(permAnchor, `${permAnchor}${NL}${permBlock}`), 'utf8');

  // Quyền có trong registry nhưng KHÔNG gán cho vai trò nào thì mọi request
  // đều 403 — test sinh kèm không bao giờ xanh được. CHECKLIST của generator
  // KHÔNG nhắc bước này: phát hiện thứ hai, ghi ở SWEEP-REPORT.
  remember(SEEDROLES);
  const roles = readFileSync(SEEDROLES, 'utf8');
  const roleAnchor = '  [SEED_ROLES.TENANT_ADMIN]: [';
  if (!roles.includes(roleAnchor)) throw new Error('không thấy khối TENANT_ADMIN trong seed-roles');
  const grants = ['read', 'create', 'update', 'delete']
    .map((a) => `    { code: '${NAME}:${a}', scope: 'all' },`)
    .join(NL);
  writeFileSync(SEEDROLES, roles.replace(roleAnchor, `${roleAnchor}${NL}${grants}`), 'utf8');

  remember(APPMODULE);
  const am = readFileSync(APPMODULE, 'utf8');
  writeFileSync(
    APPMODULE,
    am
      .replace(
        "import { CustomersModule } from './modules/customers/customers.module';",
        `import { CustomersModule } from './modules/customers/customers.module';
import { ${MODEL}sModule } from './modules/${PLURAL}/${PLURAL}.module';`,
      )
      .replace('    CustomersModule,', `    CustomersModule,
    ${MODEL}sModule,`),
    'utf8',
  );

  // `@nexus/shared` được API tiêu thụ ở dạng ĐÃ BUILD (main → dist). Sửa
  // tenancy-policy.ts mà không build lại thì app vẫn chết lúc khởi động với
  // "Model CHƯA phân loại tenancy" — trong khi check kiến trúc (đọc SOURCE)
  // vẫn xanh. CHECKLIST của generator KHÔNG nhắc bước này: đó là một phát hiện,
  // ghi ở SWEEP-REPORT.
  // Gọi thẳng tsc thay vì qua pnpm: spawnSync trên Windows không tìm thấy
  // shim của pnpm một cách ổn định, và lỗi trả về RỖNG nên không chẩn đoán được.
  const sb = run('npx', ['tsc', '-p', 'tsconfig.json'], {
    cwd: join(ROOT, 'packages/shared'),
  });
  assert(
    '#3a0 build lại @nexus/shared sau khi sửa registry',
    sb.status === 0,
    sb.status === 0 ? '' : sb.out.slice(-400),
  );

  run(process.execPath, ['tools/checks/gen-model-list.mjs']);
  const gp = run('npx', ['prisma', 'generate'], { cwd: join(ROOT, 'apps/api') });
  assert('#3a prisma generate chạy được với model mới', gp.status === 0);

  // Checklist bước 8 (V5): in lại bảng cắt gọt §11 cho module vừa sinh.
  // Test này kiểm CHÍNH cái checklist mà generator in ra, nên nó phải làm theo
  // đúng checklist đó — bỏ bước 8 thì #3b đỏ vì check #12, và cái đỏ ấy tố cáo
  // test chứ không tố cáo generator.
  remember(join(ROOT, 'docs/boilerplate-spec.md'));
  run(process.execPath, ['tools/checks/check-cut-table.mjs', '--fix']);

  const after = run(process.execPath, ['tools/checks/run-all.mjs']);
  assert(
    '#3b check kiến trúc XANH sau khi khai registry',
    after.status === 0,
    after.status === 0 ? '' : after.out.split('\n').filter((l) => l.includes('❌')).slice(0, 3).join(' | '),
  );

  // `prisma migrate dev` cần DB sống + shadow DB, mà DB của test do
  // Testcontainers dựng BÊN TRONG vitest. Nên ở đây: kiểm schema hợp lệ, rồi
  // viết thẳng file migration — chính là thứ `migrate dev --create-only` sinh
  // ra. `global-setup` sẽ áp nó bằng `migrate deploy` ở khẳng định #4, nên
  // migration SAI vẫn bị bắt, chỉ là bắt ở bước sau.
  const val = run('npx', ['prisma', 'validate'], {
    cwd: join(ROOT, 'apps/api'),
    // `validate` chỉ phân tích schema nhưng vẫn đòi biến tồn tại
    env: { DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://x:x@127.0.0.1:5432/x' },
  });
  assert('#3c schema hợp lệ với model mới', val.status === 0, val.status === 0 ? '' : val.out.slice(-300));

  const migDir = join(ROOT, `apps/api/prisma/migrations/${MIGRATION}`);
  mkdirSync(migDir, { recursive: true });
  writeFileSync(
    join(migDir, 'migration.sql'),
    `-- Model tạm của test #37; bước dọn dẹp xoá cả thư mục này
CREATE TABLE "${PLURAL}" (
  "id" UUID PRIMARY KEY,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  "created_by_id" UUID,
  "updated_by_id" UUID,
  "deleted_at" TIMESTAMPTZ,
  "version" INTEGER NOT NULL DEFAULT 0,
  "tenant_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" JSONB NOT NULL,
  "name_vi_search" TEXT,
  "name_en_search" TEXT
);
CREATE UNIQUE INDEX "${PLURAL}_tenant_id_code_key" ON "${PLURAL}" ("tenant_id", "code");
`,
    'utf8',
  );

  const tc = run('npx', ['tsc', '-p', 'tsconfig.json', '--noEmit'], {
    cwd: join(ROOT, 'apps/api'),
  });
  assert('#3d typecheck BE xanh', tc.status === 0, tc.status === 0 ? '' : tc.out.slice(0, 400));

  // ══ KHẲNG ĐỊNH 4 — test sinh kèm PHẢI CHẠY VÀ XANH ═══════════════════════
  // Đây là điều DUY NHẤT chứng minh code hoạt động chứ không chỉ biên dịch.
  const genSpec = run('npx', ['vitest', 'run', PLURAL], { cwd: join(ROOT, 'apps/api') });
  // Ghi trọn output ra file: lỗi ở beforeAll nằm ĐẦU log, mà thông báo assert
  // chỉ giữ phần đuôi — không có file này thì chẩn đoán bằng phỏng đoán.
  writeFileSync(join(ROOT, 'test37-generated-spec.log'), genSpec.out, 'utf8');
  const ran = /Tests\s+\d+\s+passed/.test(genSpec.out) || /\d+ passed/.test(genSpec.out);
  assert(
    '#4 test sinh kèm CHẠY và XANH',
    genSpec.status === 0 && ran,
    genSpec.status === 0 && ran ? '' : genSpec.out.slice(-500),
  );
} catch (e) {
  assert('chạy trọn kịch bản', false, e instanceof Error ? e.message : String(e));
} finally {
  cleanup();
  originals.clear();
}

console.log('');
console.log(`— Test #37: ${results.filter((r) => r.ok).length}/${results.length} khẳng định đạt —`);
if (failed) {
  console.error('');
  console.error('❌ Test #37 ĐỎ. Đọc docs/cookbook.md §2 (khuôn thêm module).');
  process.exit(1);
}
// `git diff --exit-code` ở bước sau của job CI kiểm chính hàm cleanup ở trên
console.log('   Dọn dẹp xong — bước `git diff --exit-code` của CI sẽ kiểm lại.');
