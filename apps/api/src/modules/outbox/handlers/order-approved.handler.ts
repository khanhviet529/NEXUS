import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RequestContextService } from '../../../infra/cls/request-context';
import { QueueService } from '../../../infra/queue/queue.service';
import type { OutboxEventRow } from '../outbox.repository';

/**
 * Consumer của ORDER_APPROVED — minh hoạ chuẩn consumer §8.2 ghi chú outbox:
 *
 * - Hệ thống là AT-LEAST-ONCE: handler PHẢI chịu được gọi lại (#20c)
 * - Chống trùng bằng eventId ỔN ĐỊNH: notification lấy id = eventId →
 *   xử lý lần 2 đụng P2002 → bỏ qua êm — "trạng thái nội bộ không nhân đôi"
 * - Side effect ra ngoài (mail): gửi kèm Idempotency-Key = eventId để
 *   provider hỗ trợ dedup (#20d)
 *
 * File này chạm Prisma vì consumer LÀ tầng repository của event —
 * đuôi .handler nằm trong allowlist ESLint bên dưới module outbox.
 */
@Injectable()
export class OrderApprovedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
    private readonly queue: QueueService,
  ) {}

  readonly eventType = 'ORDER_APPROVED';

  async handle(event: OutboxEventRow): Promise<void> {
    const payload = event.payload as {
      orderId: string;
      orderCode: string;
      createdById: string | null;
      approvedById: string;
    };

    await this.ctx.runWith(
      { tenantId: event.tenantId, actorId: 'system:outbox' }, // §4.9 worker actor
      async () => {
        if (!payload.createdById) return;
        const membership = await this.prisma.client.tenantMembership.findUnique({
          where: {
            tenantId_userId: { tenantId: event.tenantId, userId: payload.createdById },
          },
        });
        if (!membership) return;

        try {
          await this.prisma.client.notification.create({
            data: {
              id: event.id, // ← eventId làm PK: dedup tự nhiên (#20c)
              tenantId: event.tenantId,
              membershipId: membership.id,
              type: 'JOB_COMPLETED',
              title: `Đơn ${payload.orderCode} đã được duyệt`,
              data: { orderId: payload.orderId },
            },
          });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            return; // đã xử lý lần trước — at-least-once, bỏ qua êm (#20c)
          }
          throw e;
        }

        // Side effect ngoài: mail — kèm eventId làm idempotency key phía provider (#20d)
        await this.queue.add('MAIL_SEND', {
          kind: 'RAW',
          idempotencyKey: event.id,
          message: {
            to: 'notify@nexus.local',
            subject: `Đơn ${payload.orderCode} đã được duyệt`,
            html: `<p>Đơn hàng <b>${payload.orderCode}</b> đã được duyệt.</p>`,
          },
        });
      },
    );
  }
}
