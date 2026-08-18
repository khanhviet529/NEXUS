import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { RequestContextService } from '../../infra/cls/request-context';
import type { OutboxEventRow } from '../outbox/outbox.repository';

const MAX_ATTEMPTS = 8;
const DISABLE_AFTER_FAILURES = 10; // tự tắt endpoint sau N lần lỗi LIÊN TIẾP (§5C.5)
const BASE_BACKOFF_MS = 30_000;

/**
 * [OPT ưu tiên cao] GĐ10 — webhook outgoing (§5C.5).
 * - Phát BẮT BUỘC qua outbox (§4.8): fanoutEvent() chạy trong outbox worker
 * - Ký HMAC-SHA256: X-Nexus-Signature: t=<unix>,v1=<hmac(secret, t.body)>
 *   [,v1prev=...] — secret rotation giữ HAI secret cùng hiệu lực
 * - Chống gửi trùng: UNIQUE (tenant, endpoint, event) + skipDuplicates
 * - Secret MÃ HOÁ tầng ứng dụng (§4.11); API chỉ trả plaintext MỘT LẦN
 *   lúc tạo/rotate
 */
@Injectable()
export class WebhooksRepository {
  private readonly logger = new Logger(WebhooksRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly ctx: RequestContextService,
  ) {}

  // ==================== Quản trị endpoint ====================

  async createEndpoint(tenantId: string, url: string): Promise<{ id: string; secret: string }> {
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const row = await this.prisma.client.webhookEndpoint.create({
      data: { tenantId, url, secret: this.crypto.encrypt(secret) },
    });
    return { id: row.id, secret }; // plaintext DUY NHẤT lần này
  }

  listEndpoints() {
    return this.prisma.client.webhookEndpoint.findMany({
      select: {
        id: true,
        url: true,
        status: true,
        failureCount: true,
        disabledAt: true,
        secretRotatedAt: true,
        subscriptions: { select: { eventType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Rotation (§5C.5): secret cũ còn hiệu lực song song tới lần rotate sau */
  async rotateSecret(id: string): Promise<{ secret: string } | null> {
    const current = await this.prisma.client.webhookEndpoint.findFirst({ where: { id } });
    if (!current) return null;
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    await this.prisma.client.webhookEndpoint.update({
      where: { id },
      data: {
        secret: this.crypto.encrypt(secret),
        secretPrevious: current.secret,
        secretRotatedAt: new Date(),
      },
    });
    return { secret };
  }

  /**
   * Tra endpoint trong PHẠM VI tenant hiện hành (extension tự chèn where).
   * Controller gọi trước mọi thao tác ghi lên endpoint: thiếu bước này thì id
   * của tenant khác làm vỡ composite FK và trả 500 thay vì 404 (§3.6).
   */
  findEndpoint(id: string) {
    return this.prisma.client.webhookEndpoint.findFirst({ where: { id }, select: { id: true } });
  }

  async subscribe(tenantId: string, endpointId: string, eventType: string) {
    return this.prisma.client.webhookSubscription.upsert({
      where: { tenantId_endpointId_eventType: { tenantId, endpointId, eventType } },
      create: { tenantId, endpointId, eventType },
      update: {},
    });
  }

  /** Bật lại endpoint đã tự tắt — thao tác chủ đích của người vận hành */
  async reEnable(id: string): Promise<number> {
    const res = await this.prisma.client.webhookEndpoint.updateMany({
      where: { id, status: 'DISABLED' },
      data: { status: 'ACTIVE', failureCount: 0, disabledAt: null },
    });
    return res.count;
  }

  // ==================== Fan-out từ outbox (§4.8) ====================

  /** Gọi TRONG outbox worker cho MỌI event — tạo delivery cho endpoint đã đăng ký */
  async fanoutEvent(event: OutboxEventRow): Promise<number> {
    return this.ctx.runWith({ tenantId: event.tenantId, actorId: 'system:webhook' }, async () => {
      const subs = await this.prisma.client.webhookSubscription.findMany({
        where: { eventType: event.eventType, endpoint: { status: 'ACTIVE' } },
        select: { endpointId: true },
      });
      if (subs.length === 0) return 0;
      const res = await this.prisma.client.webhookDelivery.createMany({
        data: subs.map((s) => ({
          tenantId: event.tenantId,
          endpointId: s.endpointId,
          eventId: event.id,
          eventType: event.eventType,
          payload: {
            id: event.id,
            type: event.eventType,
            tenantId: event.tenantId,
            data: event.payload,
          } as Prisma.InputJsonValue,
        })),
        skipDuplicates: true, // at-least-once: outbox retry không tạo delivery trùng
      });
      return res.count;
    });
  }

  // ==================== Gửi + retry ====================

  sign(secretPlain: string, timestamp: number, body: string): string {
    return createHmac('sha256', secretPlain).update(`${timestamp}.${body}`).digest('hex');
  }

  /**
   * Worker gọi định kỳ: gửi các delivery PENDING đến hạn.
   * Chạy XUYÊN TENANT (như outbox claim) → raw SQL lấy hàng đợi kèm tenant_id
   * (extension không inject vào $queryRaw), rồi runWith(tenantId) từng dòng —
   * mọi UPDATE sau đó đi qua extension bình thường.
   */
  async deliverDue(now = new Date(), limit = 50): Promise<{ sent: number; failed: number }> {
    const due = await this.prisma.client.$queryRaw<Array<{ id: string; tenant_id: string }>>(
      Prisma.sql`SELECT d.id, d.tenant_id
                 FROM webhook_deliveries d
                 JOIN webhook_endpoints e
                   ON e.tenant_id = d.tenant_id AND e.id = d.endpoint_id
                 WHERE d.status = 'PENDING'
                   AND (d.next_retry_at IS NULL OR d.next_retry_at <= ${now})
                   AND e.status = 'ACTIVE'
                 ORDER BY d.created_at
                 LIMIT ${limit}`,
    );
    let sent = 0;
    let failed = 0;
    for (const row of due) {
      const ok = await this.ctx.runWith(
        { tenantId: row.tenant_id, actorId: 'system:webhook' },
        async () => {
          const delivery = await this.prisma.client.webhookDelivery.findFirst({
            where: { id: row.id, status: 'PENDING' },
            include: { endpoint: true },
          });
          if (!delivery || delivery.endpoint.status !== 'ACTIVE') return null;
          try {
            return await this.sendOne(delivery);
          } catch (err) {
            // MỘT dòng độc (secret hỏng định dạng, row rác…) không được giết
            // CẢ vòng gửi của mọi tenant — flaky R1 lộ đúng lỗi này: endpoint
            // secret không decrypt được làm deliverDue ném xuyên loop.
            // Đánh FAILED hẳn (không retry: lỗi dữ liệu, retry vô ích) rồi đi tiếp.
            await this.prisma.client.webhookDelivery.update({
              where: { id: delivery.id },
              data: { status: 'FAILED', attempts: delivery.attempts + 1, nextRetryAt: null },
            });
            this.logger.error(
              `webhook delivery ${delivery.id} hỏng dữ liệu, đánh FAILED: ${String(err)}`,
            );
            return false;
          }
        },
      );
      if (ok === null) continue;
      if (ok) sent++;
      else failed++;
    }
    return { sent, failed };
  }

  private async sendOne(
    delivery: Prisma.WebhookDeliveryGetPayload<{ include: { endpoint: true } }>,
  ): Promise<boolean> {
    const body = JSON.stringify(delivery.payload);
    const t = Math.floor(Date.now() / 1000);
    const secret = this.crypto.decrypt(delivery.endpoint.secret);
    let signature = `t=${t},v1=${this.sign(secret, t, body)}`;
    if (delivery.endpoint.secretPrevious) {
      const prev = this.crypto.decrypt(delivery.endpoint.secretPrevious);
      signature += `,v1prev=${this.sign(prev, t, body)}`; // hai secret cùng hiệu lực
    }

    let status: number | null = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(delivery.endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Nexus-Signature': signature,
          'X-Nexus-Event-Id': delivery.eventId, // idempotency phía nhận (§5C.5)
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      status = res.status;
    } catch {
      status = null; // network/timeout
    }

    const success = status !== null && status >= 200 && status < 300;
    if (success) {
      await this.prisma.client.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'DELIVERED', responseStatus: status, deliveredAt: new Date(),
          attempts: delivery.attempts + 1 },
      });
      // Thành công reset chuỗi lỗi liên tiếp
      await this.prisma.client.webhookEndpoint.update({
        where: { id: delivery.endpointId },
        data: { failureCount: 0 },
      });
      return true;
    }

    const attempts = delivery.attempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    await this.prisma.client.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: exhausted ? 'FAILED' : 'PENDING',
        responseStatus: status,
        attempts,
        // exponential backoff (§5C.5)
        nextRetryAt: exhausted ? null : new Date(Date.now() + BASE_BACKOFF_MS * 2 ** attempts),
      },
    });
    const endpoint = await this.prisma.client.webhookEndpoint.update({
      where: { id: delivery.endpointId },
      data: { failureCount: { increment: 1 } },
    });
    if (endpoint.failureCount >= DISABLE_AFTER_FAILURES && endpoint.status === 'ACTIVE') {
      await this.prisma.client.webhookEndpoint.update({
        where: { id: delivery.endpointId },
        data: { status: 'DISABLED', disabledAt: new Date() },
      });
      this.logger.warn(`Webhook endpoint ${delivery.endpointId} TỰ TẮT sau ${endpoint.failureCount} lỗi liên tiếp`);
    }
    return false;
  }

  // ==================== Replay + tra cứu ====================

  listDeliveries(endpointId?: string) {
    return this.prisma.client.webhookDelivery.findMany({
      where: endpointId ? { endpointId } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        endpointId: true,
        eventId: true,
        eventType: true,
        status: true,
        responseStatus: true,
        attempts: true,
        nextRetryAt: true,
        deliveredAt: true,
        createdAt: true,
      },
    });
  }

  /** Replay thủ công (§5C.5) — đưa delivery về PENDING gửi lại ngay */
  async replay(id: string): Promise<number> {
    const res = await this.prisma.client.webhookDelivery.updateMany({
      where: { id },
      data: { status: 'PENDING', nextRetryAt: null },
    });
    return res.count;
  }
}
