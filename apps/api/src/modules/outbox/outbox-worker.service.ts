import { Injectable, Logger } from '@nestjs/common';
import { OutboxRepository, type OutboxEventRow } from './outbox.repository';
import { OrderApprovedHandler } from './handlers/order-approved.handler';
import { WebhooksRepository } from '../webhooks/webhooks.repository';

/**
 * [CORE] Outbox dispatcher — spec §4.8.
 * Chạy trong worker process (worker.ts) theo vòng lặp; test gọi runOnce()
 * trực tiếp. KHÔNG exactly-once: giảm số lần trùng, không loại bỏ (#42).
 */
@Injectable()
export class OutboxWorkerService {
  private readonly logger = new Logger(OutboxWorkerService.name);
  private readonly handlers = new Map<string, (e: OutboxEventRow) => Promise<void>>();

  constructor(
    private readonly repo: OutboxRepository,
    private readonly webhooks: WebhooksRepository,
    orderApproved: OrderApprovedHandler,
  ) {
    this.handlers.set(orderApproved.eventType, (e) => orderApproved.handle(e));
  }

  /** Một vòng: thu hồi event kẹt lease → claim → xử lý từng event */
  async runOnce(workerId: string, limit = 100): Promise<{ processed: number; failed: number }> {
    await this.repo.requeueStale();
    const events = await this.repo.claimBatch(workerId, limit);
    let processed = 0;
    let failed = 0;
    for (const event of events) {
      const handler = this.handlers.get(event.eventType);
      try {
        if (handler) await handler(event);
        else this.logger.warn(`Không có handler cho ${event.eventType} — đánh DONE`);
        // GĐ10 §5C.5 — webhook phát QUA OUTBOX: fan-out cho MỌI event có
        // subscription; dedup bằng UNIQUE (tenant, endpoint, event)
        await this.webhooks.fanoutEvent(event);
        await this.repo.markDone(event.id);
        processed++;
      } catch (e) {
        this.logger.error(
          `Event ${event.id} (${event.eventType}) lỗi: ${e instanceof Error ? e.message : e}`,
        );
        await this.repo.markFailed(event.id, event.attempts);
        failed++;
      }
    }
    return { processed, failed };
  }
}
