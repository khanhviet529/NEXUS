import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Hợp đồng Sentry FE (§9). Hai điều phải giữ:
 *
 * 1. Không có DSN → KHÔNG gọi Sentry. Dev/test im lặng, không cần mock ở mọi
 *    test khác; và quan trọng hơn: không rò dữ liệu khi ai đó chạy build local.
 * 2. Có DSN → sự kiện phải mang `traceId` của BE. Thiếu tag đó thì lỗi FE và
 *    lỗi BE nằm ở hai vũ trụ riêng, không đối chiếu được — đúng thứ §9 muốn
 *    tránh.
 */
const captureMessage = vi.fn();
const setTag = vi.fn();
const setLevel = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  captureMessage: (...a: unknown[]) => captureMessage(...a),
  withScope: (cb: (s: unknown) => void) => cb({ setTag, setLevel }),
}));

const DSN_KEY = 'NEXT_PUBLIC_SENTRY_DSN';

describe('reportApiError', () => {
  beforeEach(() => {
    captureMessage.mockClear();
    setTag.mockClear();
    setLevel.mockClear();
  });
  afterEach(() => {
    delete process.env[DSN_KEY];
  });

  it('không có DSN thì không gửi gì', async () => {
    delete process.env[DSN_KEY];
    const { reportApiError } = await import('./sentry');
    reportApiError({ code: 'INTERNAL_ERROR', traceId: 't-1', status: 500 });
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('có DSN thì gắn traceId và errorCode làm tag', async () => {
    process.env[DSN_KEY] = 'https://k@example.invalid/1';
    const { reportApiError } = await import('./sentry');
    reportApiError({ code: 'INTERNAL_ERROR', traceId: 'trace-abc', status: 500 });

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(setTag).toHaveBeenCalledWith('traceId', 'trace-abc');
    expect(setTag).toHaveBeenCalledWith('errorCode', 'INTERNAL_ERROR');
    expect(setLevel).toHaveBeenCalledWith('error');
  });

  it('lỗi 4xx là warning, không phải error', async () => {
    process.env[DSN_KEY] = 'https://k@example.invalid/1';
    const { reportApiError } = await import('./sentry');
    reportApiError({ code: 'VALIDATION_ERROR', traceId: 't-2', status: 422 });
    expect(setLevel).toHaveBeenCalledWith('warning');
  });
});

describe('initSentryWeb', () => {
  afterEach(() => {
    delete process.env[DSN_KEY];
  });

  it('trả false khi thiếu DSN — không khởi tạo mù', async () => {
    delete process.env[DSN_KEY];
    const { initSentryWeb } = await import('./sentry');
    expect(initSentryWeb()).toBe(false);
  });

  it('trả true khi có DSN', async () => {
    process.env[DSN_KEY] = 'https://k@example.invalid/1';
    const { initSentryWeb } = await import('./sentry');
    expect(initSentryWeb()).toBe(true);
  });
});
