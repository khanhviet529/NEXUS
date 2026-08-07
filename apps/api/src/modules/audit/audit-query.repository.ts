import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AbilityService } from '../auth/ability.service';
import { OrgTreeRepository } from '../auth/org-tree.repository';

export interface AuditListQuery {
  entity?: string;
  entityId?: string;
  action?: string;
  page: number;
  limit: number;
}

/**
 * [CORE] GĐ7 — đọc audit_logs (§4.9). audit_logs KHÔNG có org_unit_id, nên
 * scope dept/desc dịch thành: actor_id IN (user có membership trong cây đơn vị)
 * — vẫn NHÚNG TRONG WHERE (§4.4), không lọc sau khi query.
 */
@Injectable()
export class AuditQueryRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ability: AbilityService,
    private readonly orgTree: OrgTreeRepository,
  ) {}

  private async scopeActorWhere(user: AuthUser): Promise<Record<string, unknown>> {
    const ability = await this.ability.forUser(user);
    const scope = ability.scopeOf('audit:read');
    if (!scope) throw new AppException('AUTH.FORBIDDEN');
    if (scope === 'all') return {};
    if (scope === 'own') return { actorId: user.sub };

    // department / descendants → danh sách userId trong cây (fail-closed khi rỗng)
    if (!user.orgUnitId) return { actorId: '__none__' };
    const orgUnitIds =
      scope === 'department'
        ? [user.orgUnitId]
        : await this.orgTree.getDescendantIds(user.tenantId, user.orgUnitId);
    const members = await this.prisma.client.tenantMembership.findMany({
      where: { orgUnitId: { in: orgUnitIds.length > 0 ? orgUnitIds : ['__none__'] } },
      select: { userId: true },
    });
    const userIds = members.map((m) => m.userId);
    return { actorId: { in: userIds.length > 0 ? userIds : ['__none__'] } };
  }

  async list(user: AuthUser, q: AuditListQuery) {
    const actorWhere = await this.scopeActorWhere(user);
    const where = {
      ...actorWhere,
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.action ? { action: q.action } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: {
          id: true,
          createdAt: true,
          entity: true,
          entityId: true,
          action: true,
          actorId: true,
          actorName: true,
          onBehalfOfId: true,
          before: true,
          after: true,
          ip: true,
          traceId: true,
        },
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);
    return { rows, total };
  }
}
