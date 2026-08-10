#!/usr/bin/env node
/**
 * Chạy một lệnh với biến môi trường lấy từ `.env` ở GỐC repo.
 *
 * Vì sao cần (F-15): repo có ĐÚNG MỘT file `.env`, đặt ở gốc. Nhưng các lệnh
 * `prisma generate|migrate|seed` chạy với cwd là `apps/api`, và cả Prisma CLI
 * lẫn `--env-file` của Node đều KHÔNG đi ngược lên thư mục cha. Kết quả trên
 * clone sạch:
 *
 *     error: Environment variable not found: DATABASE_URL.
 *
 * Lỗi này KHÔNG lộ ra trên máy đã làm việc lâu — ở đó `apps/api/.env` thường
 * đã tồn tại từ một lần thử trước. Nó chỉ lộ ra ở job CI `onboarding`, vốn
 * checkout vào thư mục riêng và không cache gì cả. Đó chính là lý do job đó
 * tồn tại.
 *
 * Cách khác đã cân nhắc và bỏ:
 *   - thêm `dotenv-cli`      → thêm dependency, CLAUDE.md §4 bắt phải hỏi
 *   - copy `.env` sang apps/ → hai bản `.env` lệch nhau là chuyện sớm muộn
 *   - chỉ inject trong bootstrap → `pnpm --filter @nexus/api prisma:migrate`
 *     gõ tay vẫn hỏng, tức vá nửa vời
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(ROOT, '.env');

if (existsSync(envFile)) {
  // Node 22 (README yêu cầu 22+). Không ghi đè biến đã có sẵn trong môi
  // trường — CI truyền secret qua env thật, và nó phải thắng file.
  const before = { ...process.env };
  process.loadEnvFile(envFile);
  for (const k of Object.keys(before)) process.env[k] = before[k];
} else {
  console.error(`⚠ Không thấy ${envFile} — dùng biến môi trường sẵn có.`);
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('Cách dùng: node tools/with-env.mjs <lệnh> [tham số...]');
  process.exit(2);
}

const r = spawnSync(cmd, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
