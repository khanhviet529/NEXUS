import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { maskSensitive, type AuditAction } from '@nexus/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContextService } from '../../infra/cls/request-context';

export interface AuditEntry {
  tenantId: string;
  entity: string;
  entityId: string;
  /**
   * ADR-0004: KIỂU ĐÓNG, không nhận chuỗi tự do — timeline §4.9 phải đọc
   * được. Action mới khai ở packages/shared/src/audit-actions.ts trước.
   */
  action: AuditAction;
  actorId?: string;
  actorName?: string;
  onBehalfOfId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/** Client Prisma trong transaction — chỉ cần khả năng tạo audit log */
export interface AuditTxClient {
  auditLog: { create(args: { data: Prisma.AuditLogUncheckedCreateInput }): unknown };
}

/**
 * [CORE] Ghi audit TƯỜNG MINH — spec §4.9, ADR-0004 (không dùng query
 * extension tự động; nhóm security-critical có thêm DB trigger).
 * audit_logs append-only — KHÔNG có update/delete ở đây.
 *
 * HAI ĐƯỜNG GHI, chọn đúng đường:
 *  - `writeInTx(tx, entry)` — BẮT BUỘC khi có transaction nghiệp vụ, để audit
 *    và write nghiệp vụ cùng sống cùng chết (ADR-0004 điều kiện 2). Ghi ngoài
 *    tx sinh HAI kịch bản sai âm thầm: rollback mà vẫn có audit (timeline có
 *    hành động chưa từng xảy ra), hoặc commit mà audit lỗi (mất dấu vết).
 *  - `write(entry)` — chỉ cho sự kiện KHÔNG thuộc transaction nghiệp vụ nào:
 *    security event (LOGIN, TOKEN_REUSE_DETECTED), cross-tenant access, thao
 *    tác vận hành. Bản thân nó tự mở transaction ngầm của Prisma.
 */
@Injectable()
export class AuditRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
  ) {}

  private buildData(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
    return {
      tenantId: entry.tenantId,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      actorId: entry.actorId ?? this.ctx.actorId ?? null,
      actorName: entry.actorName,
      onBehalfOfId: entry.onBehalfOfId,
      // §4.4c nơi thứ 4: che GIÁ TRỊ nhạy cảm TRƯỚC KHI GHI —
      // audit diff không bao giờ chứa lương/CCCD dạng rõ
      before: maskSensitive(entry.entity, entry.before) as Prisma.InputJsonValue | undefined,
      after: maskSensitive(entry.entity, entry.after) as Prisma.InputJsonValue | undefined,
      ip: entry.ip,
      userAgent: entry.userAgent,
      traceId: this.ctx.traceId,
    };
  }

  /** Sự kiện ngoài transaction nghiệp vụ (security, vận hành) */
  async write(entry: AuditEntry): Promise<void> {
    await this.ctx.runWith({ tenantId: entry.tenantId }, () =>
      this.prisma.client.auditLog.create({ data: this.buildData(entry) }),
    );
  }

  /** ADR-0004 đk2: audit CÙNG SỐNG CÙNG CHẾT với write nghiệp vụ */
  async writeInTx(tx: AuditTxClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: this.buildData(entry) });
    return undefined;
  }
}
