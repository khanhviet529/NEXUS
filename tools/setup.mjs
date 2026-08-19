#!/usr/bin/env node
/**
 * Đường onboarding CHÍNH — `pnpm bootstrap`.
 *
 * Vì sao là script Node chứ không phải Makefile (V3 / F-03): repo này được
 * phát triển trên Windows (mọi commit đều có cảnh báo CRLF), mà `make` KHÔNG
 * có sẵn trên Windows. Đường onboarding chính không được đòi một công cụ mà
 * README còn không liệt kê trong phần "Yêu cầu".
 *
 * `make setup` giữ lại và chỉ gọi lại script này, cho người quen dùng make.
 *
 * BẢY BƯỚC, THỨ TỰ KHÔNG ĐỔI ĐƯỢC:
 *   1. env       cp .env.example .env nếu chưa có          ← F-06
 *   2. up        docker compose --wait
 *   3. install   pnpm install
 *   4. shared    build @nexus/shared                        ← F-01
 *   5. generate  prisma generate                            ← F-02
 *   6. migrate
 *   7. seed
 *
 * Ba bước 1/4/5 trước đây nằm trong đầu người biết việc, không nằm trong lệnh.
 * Hậu quả: `make setup` KHÔNG THỂ thành công trên clone sạch — seed chết ở
 * `Cannot find module '@nexus/shared/dist'` rồi `@prisma/client did not
 * initialize`. Tài liệu nói "chạy một lệnh" thì lệnh đó phải làm hết.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const t0 = Date.now();
const win = process.platform === 'win32';

function run(label, cmd, args, opts = {}) {
  const started = Date.now();
  process.stdout.write(`\n▸ ${label}\n`);
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    stdio: 'inherit',
    shell: win,
    env: { ...process.env, ...opts.env },
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status !== 0) {
    console.error(`\n❌ Hỏng ở bước "${label}" sau ${secs}s (mã thoát ${String(r.status)}).`);
    console.error('   Các bước trước đó đã chạy xong, chạy lại `pnpm bootstrap` là an toàn.');
    process.exit(r.status ?? 1);
  }
  console.log(`  ✓ ${label} — ${secs}s`);
  return Number(secs);
}

// ── 1. env (F-06) ────────────────────────────────────────────────────────────
const env = join(ROOT, '.env');
if (existsSync(env)) {
  console.log('▸ .env đã có — giữ nguyên');
} else {
  copyFileSync(join(ROOT, '.env.example'), env);
  console.log('▸ .env chưa có — đã tạo từ .env.example');
  console.log('  ⚠ Clone THỨ HAI trên cùng máy: đổi COMPOSE_PROJECT_NAME trong .env,');
  console.log('    nếu không hai clone dùng chung database (F-04).');
}

// ── 2..7 ─────────────────────────────────────────────────────────────────────
run('Dựng hạ tầng (postgres · redis · minio · mailpit)', 'docker', [
  'compose', '-f', 'docker-compose.dev.yml', 'up', '-d', '--wait',
]);
run('Cài dependency', 'pnpm', ['install']);
// F-01: @nexus/shared được API tiêu thụ ở dạng ĐÃ BUILD (main → dist)
run('Build @nexus/shared', 'pnpm', ['--filter', '@nexus/shared', 'build']);
// F-02: seed import PrismaClient, cần client đã sinh
run('Sinh Prisma client', 'pnpm', ['--filter', '@nexus/api', 'prisma:generate']);
run('Chạy migration', 'pnpm', ['--filter', '@nexus/api', 'prisma:migrate']);
run('Seed dữ liệu mẫu', 'pnpm', ['--filter', '@nexus/api', 'prisma:seed']);

const total = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\n✅ Setup xong trong ${total}s (${(total / 60).toFixed(1)} phút).`);
console.log('   Tiếp theo: pnpm dev   → web :3000 · api :4000 · swagger :4000/docs');
console.log('   Tài khoản seed: xem apps/api/prisma/seed.ts');
