import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestHarness } from './setup/test-app';

/**
 * B8 — /health là CĂN CỨ ROLLBACK của CD (§9). Nếu nó trả 200 trong khi mất
 * DB thì rollback không bao giờ kích hoạt; vì vậy hợp đồng của nó phải có test.
 */
describe('GET /health — căn cứ rollback của CD (§9)', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
  });

  it('công khai (không cần token) và báo TỪNG thành phần, không chỉ "ok"', async () => {
    const res = await request(h.app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    // deploy/health-check.sh grep đúng hai khoá này — đổi tên là hỏng CD
    expect(res.body.db).toBe(true);
    expect(res.body.redis).toBe(true);
    expect(res.body).toHaveProperty('version');
  });

  it('hình dạng khớp với thứ deploy/health-check.sh kiểm', async () => {
    const res = await request(h.app.getHttpServer()).get('/api/v1/health');
    const body = JSON.stringify(res.body);
    expect(body).toMatch(/"db":\s*true/);
    expect(body).toMatch(/"redis":\s*true/);
  });
});
