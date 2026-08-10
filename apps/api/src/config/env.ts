import { z } from 'zod';

/**
 * [CORE] Validate biến môi trường bằng zod lúc khởi động — spec §9.
 * Thiếu biến là crash ngay, không chạy với config mặc định âm thầm.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET phải ≥ 32 ký tự'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_FROM: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Giá trị dev trong `.env.example`. Phải hợp lệ để clone sạch chạy được ngay
 * (F-16: bản cũ dài 29 ký tự — không qua nổi chính validator ở trên, nên API
 * không khởi động nổi sau `pnpm bootstrap`), nhưng phải CHẶN ở production.
 *
 * Một placeholder không qua được validator thì chặn cả người mới; một
 * placeholder qua được mà không ai gác thì đi thẳng lên production. Cần cả hai.
 */
const DEV_PLACEHOLDERS: Record<string, string> = {
  JWT_SECRET: 'dev-only-KHONG-DUNG-O-PRODUCTION-0000',
  APP_ENCRYPTION_KEY: 'ZGV2LW9ubHkta2hvbmctZHVuZy1wcm9kLTAwMDA=',
};

export function validateEnv(config: Record<string, unknown>): Env {
  if (config.NODE_ENV === 'production') {
    const leaked = Object.entries(DEV_PLACEHOLDERS)
      .filter(([k, v]) => config[k] === v)
      .map(([k]) => k);
    if (leaked.length) {
      throw new Error(
        `Biến môi trường không hợp lệ:\n` +
          leaked.map((k) => `  ${k}: vẫn là giá trị mẫu của .env.example`).join('\n') +
          `\nSinh giá trị thật trước khi chạy production.`,
      );
    }
  }

  const result = envSchema.safeParse(config);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Biến môi trường không hợp lệ:\n${detail}`);
  }
  return result.data;
}
