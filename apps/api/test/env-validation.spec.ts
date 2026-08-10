import { describe, it, expect } from 'vitest';
import { validateEnv } from '../src/config/env';

/**
 * F-16 — `.env.example` chở sẵn `JWT_SECRET=CHANGE_ME_min_32_bytes_random`,
 * dài 29 ký tự, KHÔNG qua nổi chính validator ngay bên cạnh nó
 * (`z.string().min(32)`). Hậu quả trên clone sạch: `pnpm bootstrap` xanh, rồi
 * `pnpm dev` chết ngay ở dòng đầu với "Biến môi trường không hợp lệ".
 *
 * Ba khẳng định dưới đây khoá cả hai đầu của cái bẫy đó:
 *   1. giá trị mẫu PHẢI chạy được ở dev — nếu không, người mới bị chặn
 *   2. giá trị mẫu PHẢI bị chặn ở production — nếu không, nó đi thẳng lên prod
 *   3. giá trị thật vẫn qua ở production — chốt chặn không được chặn nhầm
 *
 * Test #2 là thứ không tồn tại trước đây: placeholder trước kia "an toàn" chỉ
 * nhờ tình cờ ngắn hơn 32 ký tự, chứ không nhờ ai gác.
 */
const BASE = {
  DATABASE_URL: 'postgresql://nexus:nexus@localhost:5432/nexus?schema=public',
  REDIS_URL: 'redis://localhost:6379',
};

/** Đọc thẳng từ .env.example để test không trôi khỏi file thật */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function fromEnvExample(key: string): string {
  const text = readFileSync(join(__dirname, '../../../.env.example'), 'utf8');
  const line = text.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`.env.example thiếu ${key}`);
  return line.slice(key.length + 1).trim();
}

describe('validateEnv — giá trị mẫu của .env.example', () => {
  const sampleJwt = fromEnvExample('JWT_SECRET');

  it('giá trị mẫu chạy được ở dev — clone sạch không bị chặn (F-16)', () => {
    expect(sampleJwt.length).toBeGreaterThanOrEqual(32);
    const env = validateEnv({ ...BASE, JWT_SECRET: sampleJwt, NODE_ENV: 'development' });
    expect(env.JWT_SECRET).toBe(sampleJwt);
  });

  it('giá trị mẫu BỊ CHẶN ở production', () => {
    expect(() =>
      validateEnv({ ...BASE, JWT_SECRET: sampleJwt, NODE_ENV: 'production' }),
    ).toThrow(/vẫn là giá trị mẫu/);
  });

  it('giá trị thật vẫn qua ở production — không chặn nhầm', () => {
    const real = 'k7Qx2vLm9pRt4wYs6zAe1nBc3dFg5hJk8';
    expect(real.length).toBeGreaterThanOrEqual(32);
    const env = validateEnv({ ...BASE, JWT_SECRET: real, NODE_ENV: 'production' });
    expect(env.NODE_ENV).toBe('production');
  });

  it('JWT_SECRET ngắn vẫn đỏ như cũ — chốt chặn mới không nuốt luật cũ', () => {
    expect(() => validateEnv({ ...BASE, JWT_SECRET: 'qua-ngan' })).toThrow(/≥ 32 ký tự/);
  });
});
