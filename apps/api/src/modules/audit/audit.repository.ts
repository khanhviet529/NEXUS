import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContextService } from '../../infra/cls/request-context';

export interface AuditEntry {
  tenantId: string;
  entity: string;
  entityId: string;
  action: string;
  actorId?: string;
  actorName?: string;
  onBehalfOfId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/**
 * [CORE] Ghi audit tường minh — spec §4.9.
 * GĐ2 dùng cho security event (LOGIN, TOKEN_REUSE_DETECTED, PASSWORD_RESET…).
 * GĐ7 bổ sung query-extension diff cho CRUD + DB trigger nhóm security-critical.
 * audit_logs append-only — KHÔNG có update/delete ở đây.
 */
@Injectable()
export class AuditRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
  ) {}

  async write(entry: AuditEntry): Promise<void> {
    await this.ctx.runWith({ tenantId: entry.tenantId }, () =>
      this.prisma.client.auditLog.create({
        data: {
          tenantId: entry.tenantId,
          entity: entry.entity,
          entityId: entry.entityId,
          action: entry.action,
          actorId: entry.actorId ?? this.ctx.actorId ?? null,
          actorName: entry.actorName,
          onBehalfOfId: entry.onBehalfOfId,
          before: entry.before,
          after: entry.after,
          ip: entry.ip,
          userAgent: entry.userAgent,
          traceId: this.ctx.traceId,
        },
      }),
    );
  }
}
