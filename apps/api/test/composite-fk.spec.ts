import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { createTestApp, type TestHarness } from './setup/test-app';

/**
 * Test §8.2 #2 + #3b — LƯỚI CUỐI ở tầng DB (§6.4).
 * Cố tình dùng rawPrisma / raw SQL để BỎ QUA extension và repository,
 * chứng minh DB tự chặn kể cả khi tầng ứng dụng hỏng toàn bộ.
 */
describe('Composite FK — DB là lưới cuối (§8.2 #2, #3b)', () => {
  let h: TestHarness;

  beforeAll(async () => {
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
  });

  it('#2 không gán được role của tenant B cho membership tenant A (composite FK)', async () => {
    const membershipA = await h.rawPrisma.tenantMembership.findFirstOrThrow({
      where: { tenantId: h.seed.tenantA.tenantId },
    });
    const roleB = await h.rawPrisma.role.findFirstOrThrow({
      where: { tenantId: h.seed.tenantB.tenantId },
    });

    // Khai tenantId = A: FK (tenant_id, role_id) → roles(tenant_id, id)
    // không có dòng (A, roleB.id) → 23503
    await expect(
      h.rawPrisma.userRole.create({
        data: {
          tenantId: h.seed.tenantA.tenantId,
          membershipId: membershipA.id,
          roleId: roleB.id,
        },
      }),
    ).rejects.toThrow(); // Prisma P2003 = FK violation

    // Khai tenantId = B: membership (B, membershipA.id) không tồn tại → cũng 23503
    await expect(
      h.rawPrisma.userRole.create({
        data: {
          tenantId: h.seed.tenantB.tenantId,
          membershipId: membershipA.id,
          roleId: roleB.id,
        },
      }),
    ).rejects.toThrow();

    // KHÔNG có giá trị tenantId nào làm cho cặp (membership A, role B) hợp lệ —
    // đây chính là "bất khả thi ở tầng DB" (§6.4)
  });

  it('#3b bỏ qua repository, raw SQL thiếu tenant_id → NOT NULL chặn', async () => {
    const membershipA = await h.rawPrisma.tenantMembership.findFirstOrThrow({
      where: { tenantId: h.seed.tenantA.tenantId },
    });
    const roleA = await h.rawPrisma.role.findFirstOrThrow({
      where: { tenantId: h.seed.tenantA.tenantId },
    });
    await expect(
      h.rawPrisma.$executeRaw(
        Prisma.sql`INSERT INTO user_roles (id, tenant_id, membership_id, role_id, created_at, updated_at)
                   VALUES (gen_random_uuid(), NULL, ${membershipA.id}::uuid, ${roleA.id}::uuid, now(), now())`,
      ),
    ).rejects.toThrow(/tenant_id|null/i); // 23502 not_null_violation
  });

  it('#3b bỏ qua repository, raw SQL chéo tenant → composite FK chặn', async () => {
    const membershipA = await h.rawPrisma.tenantMembership.findFirstOrThrow({
      where: { tenantId: h.seed.tenantA.tenantId },
    });
    const roleB = await h.rawPrisma.role.findFirstOrThrow({
      where: { tenantId: h.seed.tenantB.tenantId },
    });
    await expect(
      h.rawPrisma.$executeRaw(
        Prisma.sql`INSERT INTO user_roles (id, tenant_id, membership_id, role_id, created_at, updated_at)
                   VALUES (gen_random_uuid(), ${h.seed.tenantA.tenantId}::uuid, ${membershipA.id}::uuid, ${roleB.id}::uuid, now(), now())`,
      ),
    ).rejects.toThrow(/foreign key|violates/i); // 23503
  });
});
