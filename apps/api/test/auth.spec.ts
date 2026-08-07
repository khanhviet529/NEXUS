import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestHarness } from './setup/test-app';

/** Auth GĐ1: login, chọn tenant, transport (§4.3b — test #4 một phần, GĐ2 hoàn thiện) */
describe('Auth GĐ1', () => {
  let h: TestHarness;

  beforeAll(async () => {
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
  });

  it('login đúng → 201, có accessToken + cookie httpOnly', async () => {
    const res = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@tenant-a.local', password: h.seed.password });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    const cookies = res.headers['set-cookie'];
    expect(String(cookies)).toContain('access_token=');
    expect(String(cookies)).toContain('HttpOnly');
  });

  it('login sai mật khẩu → 401 AUTH.INVALID_CREDENTIALS (không phân biệt sai email)', async () => {
    const [wrongPass, wrongEmail] = await Promise.all([
      request(h.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@tenant-a.local', password: 'SaiRoi123!' }),
      request(h.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'khongton-tai@x.local', password: 'SaiRoi123!' }),
    ]);
    expect(wrongPass.status).toBe(401);
    expect(wrongEmail.status).toBe(401);
    expect(wrongPass.body.code).toBe('AUTH.INVALID_CREDENTIALS');
    expect(wrongEmail.body.code).toBe(wrongPass.body.code);
  });

  it('user nhiều membership, chưa chọn tenant → accessToken null + danh sách membership', async () => {
    const res = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'dual@nexus.local', password: h.seed.password });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeNull();
    expect(res.body.memberships).toHaveLength(2);
  });

  it('#4 (một phần) gửi CẢ cookie LẪN Bearer → 400 AUTH.DUAL_TRANSPORT', async () => {
    const token = await h.login('staff@tenant-a.local');
    const res = await request(h.app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', `access_token=${token}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('AUTH.DUAL_TRANSPORT');
  });

  it('cookie hoạt động cho web (không cần header Authorization)', async () => {
    const token = await h.login('staff@tenant-a.local');
    const res = await request(h.app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', `access_token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('staff@tenant-a.local');
  });

  it('không token → 401; token rác → 401; validation sai → 422 với details theo field', async () => {
    const noToken = await request(h.app.getHttpServer()).get('/api/v1/me');
    expect(noToken.status).toBe(401);

    const badToken = await request(h.app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', 'Bearer khong-phai-jwt');
    expect(badToken.status).toBe(401);

    const badBody = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'khong-phai-email', password: 'ngan' });
    expect(badBody.status).toBe(422);
    expect(badBody.body.code).toBe('COMMON.VALIDATION_FAILED');
    expect(badBody.body.details.email).toBeDefined();
    expect(badBody.body.details.password).toBeDefined();
  });

  it('response lỗi đúng hình dạng §3.6: code, message, details, traceId, timestamp', async () => {
    const res = await request(h.app.getHttpServer()).get('/api/v1/me');
    expect(res.body).toHaveProperty('code');
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('details');
    expect(res.body).toHaveProperty('traceId');
    expect(res.body).toHaveProperty('timestamp');
  });
});
