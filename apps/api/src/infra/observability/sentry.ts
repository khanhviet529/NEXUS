import * as Sentry from '@sentry/nestjs';

/**
 * [CORE] Sentry cho BE — spec §9 "Giám sát: Sentry… gắn traceId để đối chiếu".
 *
 * PHẢI gọi TRƯỚC khi import AppModule (Sentry vá thư viện lúc nạp module),
 * nên file này được import đầu tiên ở main.ts/worker.ts.
 *
 * Không có DSN → KHÔNG khởi tạo: dev và test chạy im lặng, không gửi đi đâu
 * và không cần mock.
 */
export function initSentry(role: 'api' | 'worker'): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.BUILD_VERSION,
    // Lấy mẫu: 100% ở staging để bắt lỗi sớm, thấp ở production cho đỡ tốn
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    initialScope: { tags: { role } },
    /**
     * §4.9 redact BẮT BUỘC. Sentry gửi ra ngoài hệ thống nên đây là chốt
     * chặn cuối: mọi khoá nhạy cảm bị thay bằng '[redacted]' trước khi rời
     * tiến trình — kể cả khi chỗ khác lỡ log nguyên văn.
     */
    beforeSend(event) {
      return redactDeep(event) as typeof event;
    },
    beforeBreadcrumb(crumb) {
      return redactDeep(crumb) as typeof crumb;
    },
  });
  return true;
}

/** Khoá bị che — trùng danh sách §4.9 (password, token, authorization, cccd, bankAccount) */
const SENSITIVE = [
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'secret',
  'cccd',
  'nationalid',
  'bankaccount',
  'salary',
];

function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE.includes(k.toLowerCase()) ? '[redacted]' : redactDeep(v, depth + 1);
  }
  return out;
}

export { redactDeep };
