/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  PERMISSIONS,
  SEED_ROLES,
  SEED_ROLE_PERMISSIONS,
  VN_DEFAULT_WORKING_HOURS,
  VN_LUNAR_HOLIDAYS,
  VN_RECURRING_HOLIDAYS,
} from '@nexus/shared';

/**
 * [CORE] Seed — spec §8.3: fixture HAI TENANT dữ liệu giống nhau.
 * Một tenant thì test cách ly (#1) vô nghĩa.
 *
 * File này là nơi DUY NHẤT (ngoài packages/shared/src/seed-roles.ts) được
 * phép so sánh/dùng chuỗi mã vai trò — CI check no-role-branching cho qua
 * đúng hai file đó.
 *
 * Tài khoản seed (mật khẩu chung: Passw0rd!):
 *   sysadmin@nexus.local      — SYSADMIN (tenant A, cross-tenant qua /admin/*)
 *   admin@tenant-a.local      — TENANT_ADMIN tenant A
 *   manager@tenant-a.local    — MANAGER tenant A
 *   staff@tenant-a.local      — STAFF tenant A
 *   viewer@tenant-a.local     — VIEWER tenant A
 *   (tương tự @tenant-b.local cho tenant B)
 *   dual@nexus.local          — STAFF ở CẢ HAI tenant (test chọn tenant)
 */
const PASSWORD = 'Passw0rd!';

// Test import runSeed() với client của Testcontainers; CLI dùng client này
let prisma: PrismaClient;

// Quyền theo vai trò seed: SEED_ROLE_PERMISSIONS (packages/shared) — dùng chung
// với TenantProvisionService (§5C.1). 'ALL' = mọi permission trong registry.
const ROLE_PERMISSIONS: Record<string, Array<{ code: string; scope: string }>> =
  Object.fromEntries(
    Object.entries(SEED_ROLE_PERMISSIONS).map(([role, perms]) => [
      role,
      perms === 'ALL' ? PERMISSIONS.map((p) => ({ code: p.code, scope: 'all' })) : perms,
    ]),
  );

async function seedPermissions(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const def of PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { code: def.code },
      create: {
        code: def.code,
        resource: def.resource,
        action: def.action,
        description: def.description,
      },
      update: {},
    });
    map.set(def.code, row.id);
  }
  return map;
}

async function seedUser(email: string, fullName: string, passwordHash: string) {
  return prisma.user.upsert({
    where: { email },
    create: {
      email,
      fullName,
      passwordHash,
      status: 'ACTIVE',
      // Dữ liệu nhạy cảm cho test field-level #10 (§4.4c):
      // phone = contact (ai cũng thấy) · nationalId = pii · salary = hr
      phone: '0900000000',
      nationalId: '079123456789',
      salary: '12345678.00',
    },
    update: {},
  });
}

interface TenantSeedResult {
  tenantId: string;
  orgUnitId: string;
}

async function seedTenant(
  code: string,
  name: string,
  permissionIds: Map<string, string>,
  passwordHash: string,
): Promise<TenantSeedResult> {
  const tenant = await prisma.tenant.upsert({
    where: { code },
    create: { code, name, status: 'ACTIVE' },
    update: {},
  });

  // Cây đơn vị tối thiểu: 1 gốc — GĐ3 mở rộng
  let root = await prisma.orgUnit.findFirst({
    where: { tenantId: tenant.id, code: 'ROOT' },
  });
  if (!root) {
    root = await prisma.orgUnit.create({
      data: { tenantId: tenant.id, code: 'ROOT', name: `${name} (gốc)` },
    });
    // ltree path — cột nằm ngoài Prisma (manual DDL), set bằng raw SQL
    await prisma.$executeRaw`UPDATE org_units SET path = text2ltree('root') WHERE id = ${root.id}::uuid`;
  }

  // 5 vai trò seed + gán quyền
  const roleIds = new Map<string, string>();
  for (const [roleCode, perms] of Object.entries(ROLE_PERMISSIONS)) {
    let role = await prisma.role.findFirst({
      where: { tenantId: tenant.id, code: roleCode },
    });
    if (!role) {
      role = await prisma.role.create({
        data: { tenantId: tenant.id, code: roleCode, name: roleCode, isSystem: true },
      });
    }
    roleIds.set(roleCode, role.id);
    for (const p of perms) {
      const permissionId = permissionIds.get(p.code);
      if (!permissionId) throw new Error(`Permission ${p.code} chưa có trong registry`);
      await prisma.rolePermission.upsert({
        where: {
          tenantId_roleId_permissionId: {
            tenantId: tenant.id,
            roleId: role.id,
            permissionId,
          },
        },
        create: { tenantId: tenant.id, roleId: role.id, permissionId, scope: p.scope },
        update: { scope: p.scope },
      });
    }
  }

  // Tài khoản theo vai trò — DỮ LIỆU GIỐNG NHAU giữa hai tenant (§8.3)
  const domain = code.toLowerCase();
  const accounts: Array<[string, string, string]> = [
    [`admin@${domain}.local`, `Admin ${name}`, SEED_ROLES.TENANT_ADMIN],
    [`manager@${domain}.local`, `Manager ${name}`, SEED_ROLES.MANAGER],
    [`staff@${domain}.local`, `Staff ${name}`, SEED_ROLES.STAFF],
    [`viewer@${domain}.local`, `Viewer ${name}`, SEED_ROLES.VIEWER],
  ];

  for (const [email, fullName, roleCode] of accounts) {
    const user = await seedUser(email, fullName, passwordHash);
    const membership = await prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        orgUnitId: root.id,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
      update: {},
    });
    const roleId = roleIds.get(roleCode);
    if (!roleId) throw new Error(`Role ${roleCode} chưa seed`);
    await prisma.userRole.upsert({
      where: {
        tenantId_membershipId_roleId: {
          tenantId: tenant.id,
          membershipId: membership.id,
          roleId,
        },
      },
      create: { tenantId: tenant.id, membershipId: membership.id, roleId },
      update: {},
    });
  }

  // Business calendar mặc định (§5C.4, GĐ7) — giờ hành chính + lễ VN.
  // Lễ âm lịch là DATA theo năm (chốt 2026-08-07), recurring neo năm 2026.
  let calendar = await prisma.businessCalendar.findFirst({
    where: { tenantId: tenant.id, isDefault: true },
  });
  if (!calendar) {
    calendar = await prisma.businessCalendar.create({
      data: { tenantId: tenant.id, name: 'Lịch làm việc chuẩn', isDefault: true },
    });
    await prisma.calendarWorkingHour.createMany({
      data: VN_DEFAULT_WORKING_HOURS.flatMap((d) =>
        d.intervals.map((iv) => ({
          tenantId: tenant.id,
          calendarId: calendar!.id,
          dayOfWeek: d.dayOfWeek,
          fromTime: iv.from,
          toTime: iv.to,
        })),
      ),
    });
    await prisma.calendarHoliday.createMany({
      data: [
        ...VN_RECURRING_HOLIDAYS.map((h) => ({
          tenantId: tenant.id,
          calendarId: calendar!.id,
          date: new Date(`2026-${h.monthDay}T00:00:00Z`),
          name: h.name,
          isRecurring: true,
        })),
        ...VN_LUNAR_HOLIDAYS.map((h) => ({
          tenantId: tenant.id,
          calendarId: calendar!.id,
          date: new Date(`${h.date}T00:00:00Z`),
          name: h.name,
          isRecurring: false,
        })),
      ],
    });
  }

  return { tenantId: tenant.id, orgUnitId: root.id };
}

export interface SeedResult {
  tenantA: TenantSeedResult;
  tenantB: TenantSeedResult;
  password: string;
}

export async function runSeed(client: PrismaClient): Promise<SeedResult> {
  prisma = client;
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id }); // §4.3

  const permissionIds = await seedPermissions();
  const a = await seedTenant('TENANT-A', 'Tenant A', permissionIds, passwordHash);
  const b = await seedTenant('TENANT-B', 'Tenant B', permissionIds, passwordHash);

  // SYSADMIN: membership ở tenant A, cross-tenant qua /admin/* + audit (§4.4b)
  const sysadmin = await seedUser('sysadmin@nexus.local', 'System Admin', passwordHash);
  const sysRole = await prisma.role.findFirst({
    where: { tenantId: a.tenantId, code: SEED_ROLES.SYSADMIN },
  });
  if (!sysRole) throw new Error('SYSADMIN role chưa seed');
  const sysMembership = await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: a.tenantId, userId: sysadmin.id } },
    create: {
      tenantId: a.tenantId,
      userId: sysadmin.id,
      orgUnitId: a.orgUnitId,
      status: 'ACTIVE',
      joinedAt: new Date(),
    },
    update: {},
  });
  await prisma.userRole.upsert({
    where: {
      tenantId_membershipId_roleId: {
        tenantId: a.tenantId,
        membershipId: sysMembership.id,
        roleId: sysRole.id,
      },
    },
    create: { tenantId: a.tenantId, membershipId: sysMembership.id, roleId: sysRole.id },
    update: {},
  });

  // User hai membership — test màn chọn tenant (§4.4b "một user, nhiều membership")
  const dual = await seedUser('dual@nexus.local', 'Dual Membership', passwordHash);
  for (const t of [a, b]) {
    const staffRole = await prisma.role.findFirst({
      where: { tenantId: t.tenantId, code: SEED_ROLES.STAFF },
    });
    if (!staffRole) continue;
    const m = await prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: t.tenantId, userId: dual.id } },
      create: {
        tenantId: t.tenantId,
        userId: dual.id,
        orgUnitId: t.orgUnitId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
      update: {},
    });
    await prisma.userRole.upsert({
      where: {
        tenantId_membershipId_roleId: {
          tenantId: t.tenantId,
          membershipId: m.id,
          roleId: staffRole.id,
        },
      },
      create: { tenantId: t.tenantId, membershipId: m.id, roleId: staffRole.id },
      update: {},
    });
  }

  console.log('Seed xong: 2 tenant (TENANT-A, TENANT-B), 5 vai trò × 2, 10 tài khoản.');
  console.log(`Mật khẩu chung: ${PASSWORD}`);
  return { tenantA: a, tenantB: b, password: PASSWORD };
}

// Chạy trực tiếp (pnpm prisma:seed) — test thì import runSeed()
if (require.main === module) {
  const client = new PrismaClient();
  runSeed(client)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => client.$disconnect());
}
