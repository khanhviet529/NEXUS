import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class RolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.client.role.findMany({
      where: { tenantId },
      include: { permissions: { include: { permission: true } } },
      orderBy: { code: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.client.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
  }

  create(tenantId: string, data: { code: string; name: string }) {
    return this.prisma.client.role.create({ data: { tenantId, ...data } });
  }

  update(id: string, data: { name?: string }) {
    return this.prisma.client.role.update({ where: { id }, data });
  }

  softDelete(id: string) {
    return this.prisma.client.role.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  countUserRoles(roleId: string) {
    return this.prisma.client.userRole.count({ where: { roleId } });
  }

  /** Thay TOÀN BỘ (permission, scope) của role — một transaction */
  async replacePermissions(
    tenantId: string,
    roleId: string,
    entries: Array<{ permissionId: string; scope: string }>,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      for (const e of entries) {
        await tx.rolePermission.create({
          data: { tenantId, roleId, permissionId: e.permissionId, scope: e.scope },
        });
      }
    });
  }

  listPermissions() {
    return this.prisma.client.permission.findMany({ orderBy: { code: 'asc' } });
  }

  findPermissionsByCodes(codes: string[]) {
    return this.prisma.client.permission.findMany({ where: { code: { in: codes } } });
  }
}
