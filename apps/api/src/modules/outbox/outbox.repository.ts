import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** TransactionClient của client ĐÃ extension — dùng trong $transaction nghiệp vụ */
export type TxClient = Parameters<
  Parameters<PrismaService['client']['$transaction']>[0]
>[0];

export interface OutboxEventRow {
  id: string;
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  attempts: number;
}

const MAX_ATTEMPTS = 3;
const LEASE_MINUTES = 5; // §4.8: worker chết → trả về PENDING sau lease timeout

/**
 * [CORE] Outbox — spec §4.8, quyết định #21/#42/#56.
 *
 * LUẬT: event có tác dụng phụ NGOÀI transaction DB (email, webhook,
 * notification) BẮT BUỘC ghi outbox TRONG CÙNG transaction nghiệp vụ.
 * Ngữ nghĩa: at-least-once — chống trùng là việc của CONSUMER (#42).
 */
@Injectable()
export class OutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Ghi event TRONG transaction nghiệp vụ của caller — điểm mấu chốt (#20b) */
  enqueueInTx(
    tx: TxClient,
    event: {
      tenantId: string;
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
    },
  ) {
    return tx.outboxEvent.create({
      data: {
        tenantId: event.tenantId,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload as Prisma.InputJsonValue,
        status: 'PENDING',
      },
    });
  }

  /**
   * Claim protocol §4.8 — NGUYÊN VĂN: FOR UPDATE SKIP LOCKED trong một
   * transaction ngắn. Hai worker song song không bao giờ nhận cùng event.
   * Raw SQL bỏ qua tenancy extension CÓ CHỦ ĐÍCH — worker xử lý mọi tenant,
   * mỗi event tự mang tenantId (§4.4b).
   */
  async claimBatch(workerId: string, limit = 100): Promise<OutboxEventRow[]> {
    return this.prisma.client.$transaction(async (tx) => {
      const ids = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM outbox_events
                   WHERE status = 'PENDING' AND available_at <= now()
                   ORDER BY created_at
                   FOR UPDATE SKIP LOCKED
                   LIMIT ${limit}`,
      );
      if (ids.length === 0) return [];
      const idList = ids.map((r) => r.id);
      await tx.$executeRaw(
        Prisma.sql`UPDATE outbox_events
                   SET status = 'PROCESSING', locked_at = now(), locked_by = ${workerId}
                   WHERE id = ANY(${idList}::uuid[])`,
      );
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          tenant_id: string;
          event_type: string;
          aggregate_type: string;
          aggregate_id: string;
          payload: unknown;
          attempts: number;
        }>
      >(
        Prisma.sql`SELECT id, tenant_id, event_type, aggregate_type, aggregate_id, payload, attempts
                   FROM outbox_events WHERE id = ANY(${idList}::uuid[])`,
      );
      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        eventType: r.event_type,
        aggregateType: r.aggregate_type,
        aggregateId: r.aggregate_id,
        payload: r.payload,
        attempts: r.attempts,
      }));
    });
  }

  async markDone(id: string): Promise<void> {
    await this.prisma.client.$executeRaw(
      Prisma.sql`UPDATE outbox_events
                 SET status = 'DONE', processed_at = now(), updated_at = now()
                 WHERE id = ${id}::uuid`,
    );
  }

  /** Thất bại: attempts+1; vượt max → DEAD (màn vận hành §5C.8 retry tay) */
  async markFailed(id: string, currentAttempts: number, backoffBaseMs = 5_000): Promise<void> {
    const attempts = currentAttempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await this.prisma.client.$executeRaw(
        Prisma.sql`UPDATE outbox_events
                   SET status = 'DEAD', attempts = ${attempts}, updated_at = now()
                   WHERE id = ${id}::uuid`,
      );
      return;
    }
    const backoffSeconds = Math.round((backoffBaseMs * 2 ** (attempts - 1)) / 1000);
    await this.prisma.client.$executeRaw(
      Prisma.sql`UPDATE outbox_events
                 SET status = 'PENDING', attempts = ${attempts},
                     available_at = now() + (${backoffSeconds}::int * interval '1 second'),
                     locked_at = NULL, locked_by = NULL, updated_at = now()
                 WHERE id = ${id}::uuid`,
    );
  }

  /** Worker chết giữa chừng: quá lease → trả PENDING (#20e, §4.8) */
  async requeueStale(leaseMinutes = LEASE_MINUTES): Promise<number> {
    return this.prisma.client.$executeRaw(
      Prisma.sql`UPDATE outbox_events
                 SET status = 'PENDING', locked_at = NULL, locked_by = NULL, updated_at = now()
                 WHERE status = 'PROCESSING'
                   AND locked_at < now() - (${leaseMinutes}::int * interval '1 minute')`,
    );
  }
}
