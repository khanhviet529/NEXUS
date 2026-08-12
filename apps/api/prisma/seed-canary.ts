import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * CANARY cho pilot (sweep C0.0 tầng 1 — "seed canary vào DB").
 *
 * Tạo tenant CANARY-C với dữ liệu mà TÊN NÀO CŨNG chứa marker `CANARY`.
 * Luật đọc trong buổi pilot: đăng nhập tenant A/B mà THẤY chữ "CANARY" ở
 * bất kỳ đâu (danh sách, tìm kiếm, Cmd+K, báo cáo, export, thông báo…) =
 * RÒ RỈ CHÉO TENANT — chụp màn hình, ghi F-xx, dừng phân loại sau.
 *
 * Chạy: pnpm --filter @nexus/api exec tsx prisma/seed-canary.ts
 * (idempotent — chạy lại không nhân đôi)
 */
const MARK = 'CANARY';
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { code: 'CANARY-C' },
    create: { code: 'CANARY-C', name: `Công ty ${MARK} (không được thấy ở tenant khác)`, status: 'ACTIVE' },
    update: {},
  });

  let root = await prisma.orgUnit.findFirst({ where: { tenantId: tenant.id, code: 'ROOT' } });
  if (!root) {
    root = await prisma.orgUnit.create({
      data: { tenantId: tenant.id, code: 'ROOT', name: `${MARK} gốc` },
    });
    await prisma.$executeRaw`UPDATE org_units SET path = text2ltree('root') WHERE id = ${root.id}::uuid`;
  }

  const passwordHash = await argon2.hash('Passw0rd!', { type: argon2.argon2id });
  const user = await prisma.user.upsert({
    where: { email: 'admin@canary.local' },
    create: { email: 'admin@canary.local', fullName: `Quản trị ${MARK}`, passwordHash },
    update: {},
  });
  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    create: { tenantId: tenant.id, userId: user.id, orgUnitId: root.id, status: 'ACTIVE' },
    update: {},
  });

  // Dữ liệu nghiệp vụ mang marker — mỗi loại vài dòng là đủ để lộ trong list/search
  for (let i = 1; i <= 3; i++) {
    // Không có unique (tenantId, code) trên hai bảng này — idempotent bằng findFirst
    const spCode = `${MARK}-SP-${i}`;
    if (!(await prisma.product.findFirst({ where: { tenantId: tenant.id, code: spCode } }))) {
      await prisma.product.create({
        data: {
          tenantId: tenant.id,
          code: spCode,
          name: { vi: `Sản phẩm ${MARK} ${i}`, en: `${MARK} product ${i}` },
          nameViSearch: `san pham canary ${i}`,
          nameEnSearch: `canary product ${i}`,
          baseUom: 'CAI',
        },
      });
    }
    const khCode = `${MARK}-KH-${i}`;
    if (!(await prisma.customer.findFirst({ where: { tenantId: tenant.id, code: khCode } }))) {
      await prisma.customer.create({
        data: {
          tenantId: tenant.id,
          code: khCode,
          name: { vi: `Khách ${MARK} ${i}` },
          nameViSearch: `khach canary ${i}`,
        },
      });
    }
  }

  console.log(
    `Canary sẵn sàng: tenant CANARY-C (admin@canary.local / Passw0rd!), ` +
      `3 sản phẩm + 3 khách mang marker "${MARK}". ` +
      `Thấy "${MARK}" khi đăng nhập tenant KHÁC = rò rỉ chéo tenant.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
