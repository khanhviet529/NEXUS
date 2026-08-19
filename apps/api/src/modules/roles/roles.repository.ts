import { Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS } from '@nexus/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditRepository } from '../audit/audit.repository';

@Injectable()
export class RolesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRepository,
  ) {}

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

  /**
   * F10 (C1): tạo role + gán quyền + audit trong MỘT transaction — cấp quyền
   * fail (luật §2.3, permission lạ…) thì KHÔNG để lại role mồ côi 0 quyền.
   * Audit writeInTx theo ADR-0004: cùng sống cùng chết với write nghiệp vụ.
   */
  createWithPermissions(
    tenantId: string,
    data: { code: string; name: string },
    entries: Array<{ permissionId: string; scope: string }>,
    auditInput: { actorId?: string; after: Record<string, unknown> },
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const role = await tx.role.create({ data: { tenantId, ...data } });
      for (const e of entries) {
        await tx.rolePermission.create({
          data: { tenantId, roleId: role.id, permissionId: e.permissionId, scope: e.scope },
        });
      }
      await this.audit.writeInTx(tx, {
        tenantId,
        entity: 'Role',
        entityId: role.id,
        action: AUDIT_ACTIONS.CREATE,
        actorId: auditInput.actorId,
        after: auditInput.after,
      });
      return role;
    });
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
