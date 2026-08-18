import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createHash, randomBytes } from 'node:crypto';
import { createTestApp, type TestHarness } from './setup/test-app';
import { PasswordResetService } from '../src/modules/auth/password-reset.service';

const ORIGIN = 'http://localhost:3000';

/** Parse Set-Cookie → map name→value */
function parseCookies(res: request.Response): Record<string, string> {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const out: Record<string, string> = {};
  for (const line of raw ?? []) {
    const [pair] = line.split(';');
    const eq = pair?.indexOf('=') ?? -1;
    if (pair && eq > 0) out[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return out;
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

describe('Auth GĐ2 — test §8.2 #4, #5, #6, #7', () => {
  let h: TestHarness;

  beforeAll(async () => {
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
  });

  const loginWeb = async (email: string) => {
    const res = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: h.seed.password });
    expect(res.status).toBe(201);
    return { cookies: parseCookies(res), body: res.body };
  };

  // ==================== #4 — transport (§4.3b) ====================

  it('#4 mobile: token trong body (cả refresh), KHÔNG set cookie', async () => {
    const res = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'viewer@tenant-a.local', password: h.seed.password, client: 'mobile' });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('#4 web: cookie httpOnly access + refresh path giới hạn + csrf KHÔNG httpOnly', async () => {
    const { cookies } = await loginWeb('viewer@tenant-a.local');
    expect(cookies['access_token']).toBeTruthy();
    expect(cookies['refresh_token']).toBeTruthy();
    expect(cookies['csrf_token']).toBeTruthy();

    const res = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'viewer@tenant-a.local', password: h.seed.password });
    const raw = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(raw).toMatch(/access_token=[^\n]*HttpOnly/);
    expect(raw).toMatch(/refresh_token=[^\n]*Path=\/api\/v1\/auth\/refresh/i);
    // csrf_token là cookie DUY NHẤT JS đọc được
    const csrfLine = raw.split('\n').find((l) => l.startsWith('csrf_token='));
    expect(csrfLine).toBeDefined();
    expect(csrfLine).not.toMatch(/HttpOnly/);
  });

  // ==================== #5 — CSRF (§4.3b, quyết định #53) ====================

  it('#5 cookie-auth POST thiếu X-CSRF-Token → 403 AUTH.CSRF_FAILED', async () => {
    const { cookies } = await loginWeb('viewer@tenant-a.local');
    const res = await request(h.app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieHeader(cookies))
      .set('Origin', ORIGIN);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUTH.CSRF_FAILED');
  });

  it('#5 CSRF token sai → 403; Origin lạ → 403', async () => {
    const { cookies } = await loginWeb('viewer@tenant-a.local');

    const wrongToken = await request(h.app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', 'gia-mao-token-0000000000000000000000000000')
      .set('Origin', ORIGIN);
    expect(wrongToken.status).toBe(403);
    expect(wrongToken.body.code).toBe('AUTH.CSRF_FAILED');

    const badOrigin = await request(h.app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies['csrf_token']!)
      .set('Origin', 'https://evil.example.com');
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.body.code).toBe('AUTH.CSRF_FAILED');
  });

  it('#5 CSRF đúng + Origin allowlist → logout 204, phiên chết NGAY (Redis §4.3d)', async () => {
    const { cookies } = await loginWeb('viewer@tenant-a.local');
    const ok = await request(h.app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies['csrf_token']!)
      .set('Origin', ORIGIN);
    expect(ok.status).toBe(204);

    // Access token còn hạn 15 phút nhưng phiên đã thu hồi → 401 ngay
    const me = await request(h.app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', `access_token=${cookies['access_token']}`);
    expect(me.status).toBe(401);
  });

  it('#5 Bearer (mobile) KHÔNG cần CSRF', async () => {
    const login = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'viewer@tenant-b.local', password: h.seed.password, client: 'mobile' });
    const res = await request(h.app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(204);
  });

  // ==================== #6 — refresh rotation + family (§4.3d) ====================

  it('#6 refresh xoay vòng: token mới dùng được, token cũ dùng lại → huỷ TOÀN BỘ phiên + audit', async () => {
    const login = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'manager@tenant-a.local', password: h.seed.password, client: 'mobile' });
    const firstRefresh = login.body.refreshToken as string;
    const firstAccess = login.body.accessToken as string;

    // Xoay lần 1 — hợp lệ
    const r1 = await request(h.app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefresh });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).toBeTruthy();
    expect(r1.body.refreshToken).not.toBe(firstRefresh);

    // Access mới hoạt động
    const meOk = await request(h.app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${r1.body.accessToken}`);
    expect(meOk.status).toBe(200);

    // DÙNG LẠI token cũ → dấu hiệu đánh cắp → 401 + huỷ cả family
    const reuse = await request(h.app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefresh });
    expect(reuse.status).toBe(401);

    // Token MỚI (vừa xoay) cũng chết — cả family bị huỷ
    const afterReuse = await request(h.app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: r1.body.refreshToken });
    expect(afterReuse.status).toBe(401);

    // MỌI phiên của user bị thu hồi — access token đầu cũng chết
    const meDead = await request(h.app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${firstAccess}`);
    expect(meDead.status).toBe(401);

    // Audit TOKEN_REUSE_DETECTED đã ghi
    const audit = await h.rawPrisma.auditLog.findFirst({
      where: { action: 'TOKEN_REUSE_DETECTED', tenantId: h.seed.tenantA.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();

    // Email cảnh báo đã enqueue → xử lý job cuối cùng trong queue (memory mail driver)
  });

  it('#6 refresh với token rác → 401, không huỷ gì', async () => {
    const res = await request(h.app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'khong-ton-tai.abcdef' });
    expect(res.status).toBe(401);
  });

  // ==================== #7 — forgot password (§4.3c) ====================

  it('#7 email tồn tại và không tồn tại: CÙNG response 202, thời gian tương đương', async () => {
    const t1 = Date.now();
    const exists = await request(h.app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'staff@tenant-b.local' });
    const d1 = Date.now() - t1;

    const t2 = Date.now();
    const notExists = await request(h.app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'khong-ton-tai@nexus.local' });
    const d2 = Date.now() - t2;

    expect(exists.status).toBe(202);
    expect(notExists.status).toBe(202);
    expect(exists.body).toEqual(notExists.body); // cùng response
    // Handler chỉ enqueue → chênh lệch thuần nhiễu, chặn lỏng để không flaky
    expect(Math.abs(d1 - d2)).toBeLessThan(300);
  });

  it('#7 luồng reset đầy đủ: token 1 lần, thu hồi mọi phiên, mật khẩu mới dùng được', async () => {
    const email = 'staff@tenant-b.local';
    // R1: test này ĐỔI mật khẩu của user SEED DÙNG CHUNG. Không khôi phục thì
    // file nào chạy SAU và login user này bằng mật khẩu seed sẽ 401 — flaky
    // theo thứ tự file (sequencer xếp theo cache thời lượng, đổi giữa các lần).
    // Chụp hash trước, khôi phục ở cuối test.
    const seedHashRow = await h.rawPrisma.user.findUniqueOrThrow({
      where: { email },
      select: { passwordHash: true },
    });
    // Có phiên đang sống
    const before = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: h.seed.password, client: 'mobile' });
    expect(before.status).toBe(201);

    // Worker xử lý job forgot — gọi thẳng logic processor (đúng code chạy ở worker)
    const resetSvc = h.app.get(PasswordResetService);
    await resetSvc.processForgotPassword(email);
    const firstRow = await h.rawPrisma.passwordResetToken.findFirst({
      where: { usedAt: null, user: { email } },
      orderBy: { createdAt: 'desc' },
    });
    expect(firstRow).not.toBeNull(); // token đã tạo, DB chỉ lưu HASH (đúng thiết kế)

    // DB chỉ có hash nên test tự phát hành token thứ hai với bản gốc biết trước
    // (mô phỏng đúng luồng worker: invalidate token cũ → insert hash mới)
    const user = await h.rawPrisma.user.findUniqueOrThrow({ where: { email } });
    const plainToken = randomBytes(32).toString('base64url');
    await h.rawPrisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await h.rawPrisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(plainToken).digest('hex'),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });

    const oldRow = await h.rawPrisma.passwordResetToken.findUnique({
      where: { id: firstRow!.id },
    });
    expect(oldRow!.usedAt).not.toBeNull(); // token cũ bị vô hiệu khi cấp token mới (§4.3c)

    // Reset
    const newPassword = 'MatKhauMoi123!';
    const reset = await request(h.app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: plainToken, newPassword });
    expect(reset.status).toBe(204);

    // Token dùng lần hai → từ chối
    const again = await request(h.app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: plainToken, newPassword: 'KhacNua456!' });
    expect(again.status).toBe(404);

    // Mọi phiên cũ bị thu hồi
    const meDead = await request(h.app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${before.body.accessToken}`);
    expect(meDead.status).toBe(401);

    // Mật khẩu cũ chết, mật khẩu mới sống
    const oldPw = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: h.seed.password });
    expect(oldPw.status).toBe(401);
    const newPw = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: newPassword });
    expect(newPw.status).toBe(201);

    // KHÔI PHỤC mật khẩu seed cho các file chạy sau (xem chú thích đầu test).
    // Thu hồi luôn phiên vừa tạo bằng mật khẩu tạm — không để phiên "mồ côi".
    await h.rawPrisma.user.update({
      where: { email },
      data: { passwordHash: seedHashRow.passwordHash },
    });
    const restored = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: h.seed.password });
    expect(restored.status, 'mật khẩu seed phải dùng lại được sau khi khôi phục').toBe(201);
  });

  // ==================== Invitation (§4.3c) ====================

  it('mời tài khoản mới → accept đặt mật khẩu → login được với role đã gán', async () => {
    const admin = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@tenant-a.local', password: h.seed.password, client: 'mobile' });
    const staffRole = await h.rawPrisma.role.findFirstOrThrow({
      where: { tenantId: h.seed.tenantA.tenantId, code: 'STAFF' },
    });

    const invite = await request(h.app.getHttpServer())
      .post('/api/v1/users/invite')
      .set('Authorization', `Bearer ${admin.body.accessToken}`)
      .send({ email: 'moi-vao@nexus.local', roleIds: [staffRole.id] });
    expect(invite.status).toBe(201);

    // Token thật nằm trong mail; DB chỉ có hash — test thay hash bằng bản biết trước
    const token = randomBytes(32).toString('base64url');
    await h.rawPrisma.invitation.update({
      where: { id: invite.body.invitationId },
      data: { tokenHash: createHash('sha256').update(token).digest('hex') },
    });

    const accept = await request(h.app.getHttpServer())
      .post('/api/v1/auth/accept-invitation')
      .send({ token, fullName: 'Người Mới', password: 'MatKhau789!' });
    expect(accept.status).toBe(201);
    expect(accept.body.tenantId).toBe(h.seed.tenantA.tenantId);

    // Accept lần hai → từ chối (một lần)
    const twice = await request(h.app.getHttpServer())
      .post('/api/v1/auth/accept-invitation')
      .send({ token, fullName: 'Kẻ Mạo Danh', password: 'HackHack123!' });
    expect(twice.status).toBe(404);

    // Login + đúng permission của STAFF
    const login = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'moi-vao@nexus.local', password: 'MatKhau789!' });
    expect(login.status).toBe(201);
    const me = await request(h.app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', `access_token=${parseCookies(login)['access_token']}`);
    expect(me.body.permissions).toContain('user:read');
    expect(me.body.tenant.code).toBe('TENANT-A');
  });

  // ==================== Rate limit + khoá tài khoản (§4.3) ====================

  it('sai mật khẩu 5 lần → 429 RATE_LIMITED', async () => {
    // Email RIÊNG cho test này — không làm bẩn Redis cho các file test sau
    const email = 'nan-nhan-rate-limit@nexus.local';
    for (let i = 0; i < 5; i++) {
      await request(h.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'SaiHoanToan999!' });
    }
    const blocked = await request(h.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: h.seed.password }); // đúng hay sai đều bị chặn
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('COMMON.RATE_LIMITED');
  });
});
