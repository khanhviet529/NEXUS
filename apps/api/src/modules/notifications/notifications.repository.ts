import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * [CORE nhẹ] GĐ7 — phía ĐỌC notifications (ghi nằm ở outbox consumer, id = eventId).
 * Mọi truy vấn LUÔN khoá theo membershipId — thông báo là dữ liệu "own" tuyệt đối,
 * không có scope nào khác (matrix không có quyền notification riêng).
 */
@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    membershipId: string,
    q: { unreadOnly?: boolean; page: number; limit: number },
  ) {
    const where = {
      membershipId,
      ...(q.unreadOnly ? { readAt: null } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.client.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.client.notification.count({ where }),
    ]);
    return { rows, total };
  }

  unreadCount(membershipId: string): Promise<number> {
    return this.prisma.client.notification.count({
      where: { membershipId, readAt: null },
    });
  }

  /** Đánh dấu đã đọc — updateMany khoá membership: không đọc hộ người khác */
  async markRead(membershipId: string, id: string): Promise<number> {
    const res = await this.prisma.client.notification.updateMany({
      where: { id, membershipId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  }

  async markAllRead(membershipId: string): Promise<number> {
    const res = await this.prisma.client.notification.updateMany({
      where: { membershipId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  }

  /** Ghi từ job/consumer — id do CALLER quyết (eventId/jobId) để dedup at-least-once */
  createForMembership(input: {
    id: string;
    tenantId: string;
    membershipId: string;
    type: string;
    title: string;
    body?: string;
    data?: Record<string, unknown>;
  }) {
    return this.prisma.client.notification.create({ data: input });
  }

  listPreferences(membershipId: string) {
    return this.prisma.client.notificationPreference.findMany({
      where: { membershipId },
      select: { type: true, channels: true },
      orderBy: { type: 'asc' },
    });
  }

  upsertPreference(tenantId: string, membershipId: string, type: string, channels: string[]) {
    return this.prisma.client.notificationPreference.upsert({
      where: {
        tenantId_membershipId_type: { tenantId, membershipId, type },
      },
      create: { tenantId, membershipId, type, channels },
      update: { channels },
      select: { type: true, channels: true },
    });
  }
}
