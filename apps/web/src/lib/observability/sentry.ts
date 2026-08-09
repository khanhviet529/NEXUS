'use client';

import * as Sentry from '@sentry/nextjs';

/**
 * [CORE] Sentry FE — §9. Gắn traceId từ response lỗi để đối chiếu FE ↔ BE:
 * cùng một sự cố phải tra được ở cả hai phía bằng MỘT mã.
 *
 * Không có DSN → không khởi tạo (dev/test im lặng, không cần mock).
 */
export function initSentryWeb(): boolean {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_ENV ?? 'development',
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    // KHÔNG gửi thân request/response: form nghiệp vụ chứa lương, CCCD, giá
    // vốn — §4.4c đã ẩn ở API thì đừng để rò qua đường giám sát
    sendDefaultPii: false,
  });
  return true;
}

/** Báo lỗi API kèm traceId của BE — chốt nối hai phía (§9) */
export function reportApiError(err: {
  code: string;
  traceId: string;
  status: number;
}): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    scope.setTag('traceId', err.traceId);
    scope.setTag('errorCode', err.code);
    scope.setLevel(err.status >= 500 ? 'error' : 'warning');
    Sentry.captureMessage(`API ${err.status} ${err.code}`);
  });
}
