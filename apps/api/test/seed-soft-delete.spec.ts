import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createTestApp, type TestHarness } from './setup/test-app';
import { runSeed } from '../prisma/seed';

/**
 * F12 (C1 lượt 2) — seed dùng PrismaClient TRẦN nên THẤY bản ghi soft-delete.
 *
 * Kịch bản gốc ở dogfood sourcing: role mồ côi bị soft-delete vẫn được
 * seed `findFirst` khớp → userRole gán vào XÁC CHẾT → login 403 khó hiểu.
 * Sau vá: mọi query model soft-delete trong seed tự lọc `deletedAt: null`
 * → re-seed tạo role SỐNG mới và gán userRole vào đó.
 */
describe('F12 — re-seed không trỏ userRole vào role đã soft-delete', () => {
  let h: TestHarness;
  let raw: PrismaClient; // client TRẦN — đúng loại client seed dùng

  beforeAll(async () => {
    h = await createTestApp(); // seed lần đầu đã chạy
    raw = new PrismaClient(); // DATABASE_URL do global-setup export
  });
  afterAll(async () => {
    await raw.$disconnect();
    await h.close();
  });

  it('soft-delete STAFF rồi re-seed → role SỐNG mới + userRole trỏ vào role sống', async () => {
    const tenantA = await raw.tenant.findFirstOrThrow({ where: { code: 'TENANT-A' } });

    // Dàn cảnh đúng F12: role STAFF của tenant A bị soft-delete (xác chết)
    const dead = await raw.role.findFirstOrThrow({
      where: { tenantId: tenantA.id, code: 'STAFF', deletedAt: null },
    });
    await raw.role.update({ where: { id: dead.id }, data: { deletedAt: new Date() } });

    const deadLinksBefore = await raw.userRole.count({ where: { roleId: dead.id } });

    await runSeed(raw); // re-seed bằng client trần — y hệt `prisma db seed`

    // Role SỐNG mới phải tồn tại và KHÁC id xác chết
    const live = await raw.role.findFirstOrThrow({
      where: { tenantId: tenantA.id, code: 'STAFF', deletedAt: null },
    });
    expect(live.id).not.toBe(dead.id);

    // Membership do seed quản (staff@tenant-a.local) phải có userRole → role SỐNG
    const staffUser = await raw.user.findFirstOrThrow({
      where: { email: 'staff@tenant-a.local' },
    });
    const membership = await raw.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: tenantA.id, userId: staffUser.id } },
    });
    const liveLink = await raw.userRole.findFirst({
      where: { membershipId: membership.id, roleId: live.id },
    });
    expect(liveLink, 'seed phải gán userRole vào role SỐNG, không phải xác chết').not.toBeNull();

    // Re-seed KHÔNG được đẻ thêm liên kết vào role chết
    const deadLinksAfter = await raw.userRole.count({ where: { roleId: dead.id } });
    expect(deadLinksAfter).toBe(deadLinksBefore);

    // TRẢ HIỆN TRƯỜNG THẬT — file chạy chung một DB (fileParallelism:false):
    // để lại xác STAFF là file sau vớ phải nó (đúng bẫy F12 mà test này mô tả).
    // Xoá role MỚI (kèm liên kết seed vừa tạo) rồi hồi sinh role gốc.
    await raw.userRole.deleteMany({ where: { roleId: live.id } });
    await raw.rolePermission.deleteMany({ where: { roleId: live.id } });
    await raw.role.delete({ where: { id: live.id } });
    await raw.role.update({ where: { id: dead.id }, data: { deletedAt: null } });
  });
});
