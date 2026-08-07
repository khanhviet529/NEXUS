import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface ListUsersParams {
  tenantId: string;
  scopeWhere: Record<string, unknown>;
  page: number;
  limit: number;
  sort: Array<{ field: string; dir: 'asc' | 'desc' }>;
  q?: string;
}

/**
 * Danh sách "người dùng" trong tenant = danh sách MEMBERSHIP (users là
 * global identity §4.4b). Scope áp lên membership, nằm TRONG query (§4.4).
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: ListUsersParams) {
    const userSortFields = new Set(['email', 'fullName', 'createdAt', 'lastLoginAt']);
    const orderBy: Prisma.TenantMembershipOrderByWithRelationInput[] = params.sort.map((s) =>
      userSortFields.has(s.field) ? { user: { [s.field]: s.dir } } : { [s.field]: s.dir },
    );
    orderBy.push({ id: 'asc' }); // tie-breaker (§3.4)

    const where: Prisma.TenantMembershipWhereInput = {
      ...(params.scopeWhere as Prisma.TenantMembershipWhereInput),
      ...(params.q
        ? {
            user: {
              OR: [
                { email: { contains: params.q, mode: 'insensitive' } },
                { fullName: { contains: params.q, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    // total = COUNT SAU filter + row-level permission (§3.3)
    const [data, total] = await Promise.all([
      this.prisma.client.tenantMembership.findMany({
        where,
        include: {
          user: true,
          orgUnit: { select: { id: true, code: true, name: true } },
          userRoles: { include: { role: { select: { id: true, code: true, name: true } } } },
        },
        orderBy,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.client.tenantMembership.count({ where }),
    ]);
    return { data, total };
  }

  /** findFirst với scope trong WHERE → ngoài phạm vi = null = 404, không lộ (§4.10 IDOR) */
  findInScope(scopeWhere: Record<string, unknown>, userId: string) {
    return this.prisma.client.tenantMembership.findFirst({
      where: {
        AND: [scopeWhere as Prisma.TenantMembershipWhereInput, { userId }],
      },
      include: {
        user: true,
        orgUnit: { select: { id: true, code: true, name: true } },
        userRoles: { include: { role: { select: { id: true, code: true, name: true } } } },
      },
    });
  }

  updateUser(
    userId: string,
    data: {
      fullName?: string;
      phone?: string | null;
      nationalId?: string | null;
      salary?: string | null;
      status?: string;
    },
  ) {
    return this.prisma.client.user.update({ where: { id: userId }, data });
  }

  updateMembershipOrgUnit(tenantId: string, membershipId: string, orgUnitId: string) {
    return this.prisma.client.tenantMembership.update({
      where: { tenantId_id: { tenantId, id: membershipId } },
      data: { orgUnitId },
    });
  }

  offboardMembership(tenantId: string, membershipId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { membershipId } });
      return tx.tenantMembership.update({
        where: { tenantId_id: { tenantId, id: membershipId } },
        data: { status: 'LEFT' },
      });
    });
  }

  /** Thay toàn bộ role của membership */
  replaceRoles(tenantId: string, membershipId: string, roleIds: string[]) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { membershipId } });
      for (const roleId of roleIds) {
        await tx.userRole.create({ data: { tenantId, membershipId, roleId } });
      }
    });
  }

  findRolesWithPermissions(tenantId: string, roleIds: string[]) {
    return this.prisma.client.role.findMany({
      where: { tenantId, id: { in: roleIds } },
      include: { permissions: { include: { permission: true } } },
    });
  }
}
