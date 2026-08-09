import { describe, it, expect } from 'vitest';
import { redactDeep } from '../src/infra/observability/sentry';

/**
 * §9 + §4.9: Sentry gửi dữ liệu RA NGOÀI hệ thống, nên đây là chốt chặn cuối
 * cùng. Test này là hàng rào: thêm khoá nhạy cảm mới mà quên khai → đỏ.
 */
describe('Sentry redact (§4.9)', () => {
  it('che mọi khoá nhạy cảm bắt buộc, không phân biệt hoa thường', () => {
    const payload = {
      password: 'secret123',
      passwordHash: '$argon2id$...',
      Authorization: 'Bearer abc',
      accessToken: 'tok',
      refreshToken: 'tok2',
      cookie: 'sid=1',
      nationalId: '079123456789',
      bankAccount: '0123456789',
      salary: '99000000',
    };
    const out = redactDeep(payload) as Record<string, string>;
    for (const [k, v] of Object.entries(out)) {
      expect(v, `${k} chưa bị che`).toBe('[redacted]');
    }
  });

  it('che ở MỌI độ sâu, kể cả trong mảng', () => {
    const out = redactDeep({
      user: { profile: { salary: '1', nationalId: '2' } },
      list: [{ token: 'x' }, { safe: 'giữ nguyên' }],
    }) as Record<string, unknown>;
    const user = (out.user as { profile: Record<string, string> }).profile;
    expect(user.salary).toBe('[redacted]');
    expect(user.nationalId).toBe('[redacted]');
    const list = out.list as Array<Record<string, string>>;
    expect(list[0]!.token).toBe('[redacted]');
    expect(list[1]!.safe).toBe('giữ nguyên');
  });

  it('giữ nguyên dữ liệu không nhạy cảm — không che nhầm cả payload', () => {
    const out = redactDeep({ orderCode: 'ORD-1', total: '220000' }) as Record<string, string>;
    expect(out).toEqual({ orderCode: 'ORD-1', total: '220000' });
  });

  it('không nổ với vòng lặp sâu / giá trị lạ', () => {
    expect(redactDeep(null)).toBeNull();
    expect(redactDeep('chuỗi')).toBe('chuỗi');
    expect(redactDeep(42)).toBe(42);
    const deep: Record<string, unknown> = {};
    let cur = deep;
    for (let i = 0; i < 20; i++) {
      cur.next = { password: 'x' };
      cur = cur.next as Record<string, unknown>;
    }
    expect(() => redactDeep(deep)).not.toThrow();
  });
});
