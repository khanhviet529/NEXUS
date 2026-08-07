import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface ResolvedAuthority {
  /** false = KHÔNG có dòng nào cho loại chứng từ này → NO_APPROVAL_AUTHORITY */
  hasAnyRow: boolean;
  /** true = có dòng bao trùm số tiền → được duyệt */
  covered: boolean;
  /** Hạn mức của dòng thắng (null = không giới hạn) — cho FE hiển thị */
  maxAmount: string | null;
}

/**
 * [OPT] GĐ10 — hạn mức duyệt §5C.12, quyết định #62.
 * Quy tắc phân giải NGUYÊN VĂN spec: lọc theo (docType, currency, hiệu lực)
 * → khớp đối tượng (membership/role/orgUnit) → cụ thể thắng chung
 * (membership > role > orgUnit) → priority → max_amount lớn nhất + cảnh báo.
 * HAI LUẬT CỨNG: không khớp dòng nào = KHÔNG duyệt (fail-closed);
 * khác tiền tệ mà không có dòng khớp currency = fail-closed (chưa có bảng
 * tỷ giá — đa tiền tệ là OPT B3, ghi chú progress.md).
 */
@Injectable()
export class ApprovalAuthoritiesRepository {
  private readonly logger = new Logger(ApprovalAuthoritiesRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  private async roleIdsOf(membershipId: string): Promise<string[]> {
    const rows = await this.prisma.client.userRole.findMany({
      where: { membershipId },
      select: { roleId: true },
    });
    return rows.map((r) => r.roleId);
  }

  async resolveFor(
    user: AuthUser,
    documentType: string,
    currency: string,
    amount: Prisma.Decimal | string,
    docDate: Date,
  ): Promise<ResolvedAuthority> {
    const roleIds = await this.roleIdsOf(user.membershipId);
    // Bước 1+2 — lọc hiệu lực + khớp đối tượng, NHÚNG trong WHERE
    const rows = await this.prisma.client.approvalAuthority.findMany({
      where: {
        documentType,
        currency,
        effectiveFrom: { lte: docDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: docDate } }],
        AND: [
          {
            OR: [
              { membershipId: user.membershipId },
              ...(roleIds.length > 0 ? [{ roleId: { in: roleIds } }] : []),
              ...(user.orgUnitId ? [{ orgUnitId: user.orgUnitId }] : []),
            ],
          },
        ],
      },
    });
    if (rows.length === 0) return { hasAnyRow: false, covered: false, maxAmount: null };

    // Bước 3 TRƯỚC — cụ thể thắng chung: membership(3) > role(2) > org_unit(1).
    // Dòng cụ thể ĐÈ dòng chung kể cả khi dòng chung rộng hơn — hạn mức riêng
    // gắn cho một người phải thắng hạn mức không giới hạn của vai trò.
    const specificity = (r: (typeof rows)[number]): number =>
      r.membershipId ? 3 : r.roleId ? 2 : 1;
    const top = Math.max(...rows.map(specificity));
    const winners = rows.filter((r) => specificity(r) === top);

    // Trong CÙNG mức cụ thể: nhiều khoảng (0→100tr, 100tr→1tỷ) là cấu hình hợp lệ
    // → bao trùm nếu BẤT KỲ dòng nào chứa số tiền (bước 4/5 chỉ để chọn dòng
    // hiển thị khi nhiều dòng cùng bao trùm)
    const value = new Prisma.Decimal(amount);
    const covering = winners.filter(
      (r) => value.gte(r.minAmount) && (r.maxAmount === null || value.lte(r.maxAmount)),
    );
    if (covering.length === 0) return { hasAnyRow: true, covered: false, maxAmount: null };

    // Bước 4 — priority cao hơn thắng; Bước 5 — hoà: max_amount lớn nhất + cảnh báo
    const topPriority = Math.max(...covering.map((r) => r.priority));
    const tied = covering.filter((r) => r.priority === topPriority);
    if (tied.length > 1) {
      this.logger.warn(
        `Hạn mức duyệt mơ hồ: ${tied.length} dòng cùng thắng (${documentType}, ${currency})`,
      );
    }
    const unlimited = tied.find((r) => r.maxAmount === null);
    const winner =
      unlimited ?? tied.reduce((a, b) => (a.maxAmount!.gte(b.maxAmount!) ? a : b));
    return {
      hasAnyRow: true,
      covered: true,
      maxAmount: winner.maxAmount === null ? null : String(winner.maxAmount),
    };
  }

  list() {
    return this.prisma.client.approvalAuthority.findMany({
      orderBy: [{ documentType: 'asc' }, { priority: 'desc' }],
    });
  }

  create(input: {
    tenantId: string;
    documentType: string;
    currency: string;
    membershipId?: string;
    roleId?: string;
    orgUnitId?: string;
    minAmount: string;
    maxAmount?: string | null;
    effectiveFrom: Date;
    effectiveTo?: Date;
    priority: number;
  }) {
    return this.prisma.client.approvalAuthority.create({ data: input });
  }

  async softDelete(id: string): Promise<number> {
    const res = await this.prisma.client.approvalAuthority.updateMany({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return res.count;
  }

  /**
   * "Kiểm tra hạn mức" (§5C.12): docType + số tiền + ngày → AI đủ thẩm quyền.
   * Không có endpoint này thì cấu hình sai chỉ lộ khi chứng từ kẹt.
   */
  async whoCanApprove(documentType: string, currency: string, amount: string, date: Date) {
    const value = new Prisma.Decimal(amount);
    const rows = await this.prisma.client.approvalAuthority.findMany({
      where: {
        documentType,
        currency,
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      },
    });
    const covering = rows.filter(
      (r) => value.gte(r.minAmount) && (r.maxAmount === null || value.lte(r.maxAmount)),
    );
    const membershipIds = new Set<string>();
    for (const r of covering) {
      if (r.membershipId) {
        membershipIds.add(r.membershipId);
      } else if (r.roleId) {
        const urs = await this.prisma.client.userRole.findMany({
          where: { roleId: r.roleId },
          select: { membershipId: true },
        });
        urs.forEach((u) => membershipIds.add(u.membershipId));
      } else if (r.orgUnitId) {
        const ms = await this.prisma.client.tenantMembership.findMany({
          where: { orgUnitId: r.orgUnitId, status: 'ACTIVE' },
          select: { id: true },
        });
        ms.forEach((m) => membershipIds.add(m.id));
      }
    }
    if (membershipIds.size === 0) return [];
    const members = await this.prisma.client.tenantMembership.findMany({
      where: { id: { in: [...membershipIds] } },
      include: { user: { select: { fullName: true, email: true } } },
    });
    return members.map((m) => ({
      membershipId: m.id,
      fullName: m.user.fullName,
      email: m.user.email,
    }));
  }
}
