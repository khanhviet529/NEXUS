import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class OrgUnitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.client.orgUnit.findMany({
      where: { tenantId },
      orderBy: { code: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.client.orgUnit.findUnique({ where: { id } });
  }

  create(tenantId: string, data: { code: string; name: string; parentId?: string }) {
    return this.prisma.client.orgUnit.create({
      data: { tenantId, ...data },
    });
  }

  update(id: string, data: { name?: string; parentId?: string | null; version: number }) {
    // Optimistic locking (§4.5): WHERE id AND version — 0 dòng → conflict
    return this.prisma.client.orgUnit.updateMany({
      where: { id, version: data.version },
      data: {
        name: data.name,
        parentId: data.parentId,
        version: { increment: 1 },
      },
    });
  }

  softDelete(id: string) {
    return this.prisma.client.orgUnit.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  countChildren(tenantId: string, id: string) {
    return this.prisma.client.orgUnit.count({ where: { tenantId, parentId: id } });
  }

  countMemberships(tenantId: string, id: string) {
    return this.prisma.client.tenantMembership.count({
      where: { tenantId, orgUnitId: id, status: 'ACTIVE' },
    });
  }
}
