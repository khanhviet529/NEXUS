import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContextService } from '../../infra/cls/request-context';

/** Sentinel cho tracking_type = NONE — PK không nhận NULL (#59) */
export const LOT_SENTINEL = '00000000-0000-0000-0000-000000000000';

export interface MovementInput {
  tenantId: string;
  warehouseId: string;
  productId: string;
  /** NONE → bỏ trống, tự dùng sentinel */
  lotId?: string;
  quantity: string;
  refType: string;
  refId: string;
  movementType: string;
  actorId?: string;
  /** SERIAL: danh sách serial id — đổi status trong CÙNG transaction (#58) */
  serialIds?: string[];
}

export interface MovementResult {
  movementId: string;
  duplicate: boolean;
}

function accountKey(warehouseId: string, productId: string, lotId: string): string {
  return `${warehouseId}:${productId}:${lotId}`;
}

/**
 * [CORE] §5B.2/B4 — thuật toán 4 bước ĐÃ CHỐT, KHÔNG dùng SELECT FOR UPDATE.
 * Raw SQL không qua tenancy extension → MỌI câu tự mang tenant_id (§4.9);
 * audit tường minh do service ghi (§4.9 bảng "đường ghi").
 */
@Injectable()
export class InventoryRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
  ) {}

  /** XUẤT KHO — 4 bước trong MỘT transaction (spec nguyên văn) */
  async issue(input: MovementInput): Promise<MovementResult> {
    const lotId = input.lotId ?? LOT_SENTINEL;
    const movementId = randomUUID();
    const now = new Date();

    return this.prisma.client.$transaction(async (tx) => {
      // BƯỚC 1: chống trùng — bảng KHÔNG partition nên unique dùng được (#28).
      // ON CONFLICT DO NOTHING: không row trả về = retry → trả kết quả cũ, 200
      const inserted = await tx.$queryRaw<Array<{ movement_id: string }>>(
        Prisma.sql`INSERT INTO movement_dedup_keys
                     (tenant_id, ref_type, ref_id, movement_type, movement_id, movement_created_at)
                   VALUES (${input.tenantId}::uuid, ${input.refType}, ${input.refId}::uuid,
                           ${input.movementType}, ${movementId}::uuid, ${now})
                   ON CONFLICT (tenant_id, ref_type, ref_id, movement_type) DO NOTHING
                   RETURNING movement_id`,
      );
      if (inserted.length === 0) {
        const existing = await tx.$queryRaw<Array<{ movement_id: string }>>(
          Prisma.sql`SELECT movement_id FROM movement_dedup_keys
                     WHERE tenant_id = ${input.tenantId}::uuid AND ref_type = ${input.refType}
                       AND ref_id = ${input.refId}::uuid AND movement_type = ${input.movementType}`,
        );
        return { movementId: existing[0]!.movement_id, duplicate: true }; // retry, không phải lỗi
      }

      // BƯỚC 2: chống xuất âm — conditional UPDATE tự nó đã nguyên tử.
      // 0 dòng = không đủ tồn HOẶC bị chen ngang — KHÔNG CẦN phân biệt: đều 409
      const affected = await tx.$executeRaw(
        Prisma.sql`UPDATE stock_balances
                   SET available = available - ${input.quantity}::decimal,
                       on_hand   = on_hand   - ${input.quantity}::decimal,
                       version   = version + 1,
                       last_movement_at = ${now},
                       updated_at = now()
                   WHERE tenant_id    = ${input.tenantId}::uuid
                     AND warehouse_id = ${input.warehouseId}::uuid
                     AND product_id   = ${input.productId}::uuid
                     AND lot_id       = ${lotId}::uuid
                     AND available   >= ${input.quantity}::decimal`,
      );
      if (affected === 0) {
        throw new AppException('STOCK.INSUFFICIENT'); // → ROLLBACK (cả dedup key)
      }

      // SERIAL: đổi status trong CÙNG transaction (#58) — stock_balances vẫn là nguồn tồn
      if (input.serialIds && input.serialIds.length > 0) {
        const updated = await tx.inventorySerial.updateMany({
          where: {
            id: { in: input.serialIds },
            warehouseId: input.warehouseId,
            productId: input.productId,
            status: 'IN_STOCK',
          },
          data: { status: 'ISSUED', refType: input.refType, refId: input.refId },
        });
        if (
          updated.count !== input.serialIds.length ||
          Number(input.quantity) !== input.serialIds.length
        ) {
          throw new AppException('STOCK.INSUFFICIENT', {
            message: 'Serial không khớp số lượng hoặc không ở trạng thái IN_STOCK',
          });
        }
      }

      // BƯỚC 3: ghi lịch sử (append-only)
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO movements
                     (id, created_at, tenant_id, account_type, account_key, movement_type,
                      direction, quantity, ref_type, ref_id, created_by_id)
                   VALUES (${movementId}::uuid, ${now}, ${input.tenantId}::uuid, 'STOCK',
                           ${accountKey(input.warehouseId, input.productId, lotId)},
                           ${input.movementType}, -1, ${input.quantity}::decimal,
                           ${input.refType}, ${input.refId}::uuid,
                           ${input.actorId ?? null}::uuid)`,
      );
      // BƯỚC 4: outbox nếu event có tác dụng phụ ngoài DB — caller quyết (§4.8)
      return { movementId, duplicate: false };
    });
  }

  /** NHẬP KHO — cùng khung 4 bước, balance UPSERT cộng dồn */
  async receive(input: MovementInput): Promise<MovementResult> {
    const lotId = input.lotId ?? LOT_SENTINEL;
    const movementId = randomUUID();
    const now = new Date();

    return this.prisma.client.$transaction(async (tx) => {
      const inserted = await tx.$queryRaw<Array<{ movement_id: string }>>(
        Prisma.sql`INSERT INTO movement_dedup_keys
                     (tenant_id, ref_type, ref_id, movement_type, movement_id, movement_created_at)
                   VALUES (${input.tenantId}::uuid, ${input.refType}, ${input.refId}::uuid,
                           ${input.movementType}, ${movementId}::uuid, ${now})
                   ON CONFLICT (tenant_id, ref_type, ref_id, movement_type) DO NOTHING
                   RETURNING movement_id`,
      );
      if (inserted.length === 0) {
        const existing = await tx.$queryRaw<Array<{ movement_id: string }>>(
          Prisma.sql`SELECT movement_id FROM movement_dedup_keys
                     WHERE tenant_id = ${input.tenantId}::uuid AND ref_type = ${input.refType}
                       AND ref_id = ${input.refId}::uuid AND movement_type = ${input.movementType}`,
        );
        return { movementId: existing[0]!.movement_id, duplicate: true };
      }

      await tx.$executeRaw(
        Prisma.sql`INSERT INTO stock_balances
                     (tenant_id, warehouse_id, product_id, lot_id, on_hand, available,
                      version, last_movement_at, updated_at)
                   VALUES (${input.tenantId}::uuid, ${input.warehouseId}::uuid,
                           ${input.productId}::uuid, ${lotId}::uuid,
                           ${input.quantity}::decimal, ${input.quantity}::decimal, 1, ${now}, now())
                   ON CONFLICT (tenant_id, warehouse_id, product_id, lot_id)
                   DO UPDATE SET on_hand   = stock_balances.on_hand   + ${input.quantity}::decimal,
                                 available = stock_balances.available + ${input.quantity}::decimal,
                                 version   = stock_balances.version + 1,
                                 last_movement_at = ${now},
                                 updated_at = now()`,
      );

      if (input.serialIds && input.serialIds.length > 0) {
        // Nhập serial: caller đã tạo inventory_serials trước (service lo);
        // ở đây chỉ đảm bảo số lượng khớp
        if (Number(input.quantity) !== input.serialIds.length) {
          throw new AppException('COMMON.VALIDATION_FAILED', {
            details: { serialIds: ['Số serial phải bằng số lượng nhập'] },
          });
        }
      }

      await tx.$executeRaw(
        Prisma.sql`INSERT INTO movements
                     (id, created_at, tenant_id, account_type, account_key, movement_type,
                      direction, quantity, ref_type, ref_id, created_by_id)
                   VALUES (${movementId}::uuid, ${now}, ${input.tenantId}::uuid, 'STOCK',
                           ${accountKey(input.warehouseId, input.productId, lotId)},
                           ${input.movementType}, 1, ${input.quantity}::decimal,
                           ${input.refType}, ${input.refId}::uuid,
                           ${input.actorId ?? null}::uuid)`,
      );
      return { movementId, duplicate: false };
    });
  }

  getBalance(tenantId: string, warehouseId: string, productId: string, lotId?: string) {
    return this.prisma.client.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId_lotId: {
          tenantId,
          warehouseId,
          productId,
          lotId: lotId ?? LOT_SENTINEL,
        },
      },
    });
  }

  listBalances(tenantId: string) {
    return this.prisma.client.stockBalance.findMany({
      where: { tenantId },
      orderBy: [{ warehouseId: 'asc' }, { productId: 'asc' }],
    });
  }

  /**
   * JOB [CORE] 1 — rebuild snapshot từ TOÀN BỘ movement (§5B.2/B4 luật 2).
   * Movement là nguồn tính lại; reserved giữ nguyên (không thuộc movement STOCK).
   */
  async rebuildBalances(tenantId: string): Promise<number> {
    const rows = await this.prisma.client.$queryRaw<
      Array<{ account_key: string; net: string }>
    >(
      Prisma.sql`SELECT account_key, COALESCE(SUM(direction * quantity), 0)::text AS net
                 FROM movements
                 WHERE tenant_id = ${tenantId}::uuid AND account_type = 'STOCK'
                 GROUP BY account_key`,
    );
    for (const row of rows) {
      const [warehouseId, productId, lotId] = row.account_key.split(':');
      await this.prisma.client.$executeRaw(
        Prisma.sql`INSERT INTO stock_balances
                     (tenant_id, warehouse_id, product_id, lot_id, on_hand, available, updated_at)
                   VALUES (${tenantId}::uuid, ${warehouseId}::uuid, ${productId}::uuid,
                           ${lotId}::uuid, ${row.net}::decimal, ${row.net}::decimal, now())
                   ON CONFLICT (tenant_id, warehouse_id, product_id, lot_id)
                   DO UPDATE SET on_hand   = ${row.net}::decimal,
                                 available = ${row.net}::decimal - stock_balances.reserved,
                                 version   = stock_balances.version + 1,
                                 updated_at = now()`,
      );
    }
    return rows.length;
  }

  /**
   * JOB [CORE] 2 — đối soát định kỳ (§5B.2/B4 luật 3): so số tính lại với
   * snapshot, ghi reconciliation_logs khi lệch. Thiếu job này movement
   * pattern KHÔNG an toàn.
   */
  async reconcile(tenantId: string): Promise<Array<{ accountKey: string; diff: string }>> {
    const rows = await this.prisma.client.$queryRaw<
      Array<{ account_key: string; expected: string; actual: string; diff: string }>
    >(
      Prisma.sql`WITH computed AS (
                   SELECT account_key, COALESCE(SUM(direction * quantity), 0) AS expected
                   FROM movements
                   WHERE tenant_id = ${tenantId}::uuid AND account_type = 'STOCK'
                   GROUP BY account_key
                 ),
                 stored AS (
                   SELECT warehouse_id::text || ':' || product_id::text || ':' || lot_id::text
                            AS account_key,
                          on_hand AS actual
                   FROM stock_balances WHERE tenant_id = ${tenantId}::uuid
                 )
                 SELECT COALESCE(c.account_key, s.account_key) AS account_key,
                        COALESCE(c.expected, 0)::text AS expected,
                        COALESCE(s.actual, 0)::text   AS actual,
                        (COALESCE(s.actual, 0) - COALESCE(c.expected, 0))::text AS diff
                 FROM computed c
                 FULL OUTER JOIN stored s ON s.account_key = c.account_key
                 WHERE COALESCE(s.actual, 0) <> COALESCE(c.expected, 0)`,
    );
    // Job tự set CLS — §4.8: actorId = 'system:<jobName>', payload mang tenantId
    await this.ctx.runWith({ tenantId, actorId: 'system:stock-reconcile' }, async () => {
      for (const row of rows) {
        await this.prisma.client.reconciliationLog.create({
          data: {
            tenantId,
            accountType: 'STOCK',
            accountKey: row.account_key,
            expected: row.expected,
            actual: row.actual,
            diff: row.diff,
          },
        });
      }
    });
    return rows.map((r) => ({ accountKey: r.account_key, diff: r.diff }));
  }

  /** Tạo mảnh partition tháng — cron gọi trước 1 tháng (§5B.3/C2, test #25) */
  async ensureMovementPartition(month: Date): Promise<string> {
    const rows = await this.prisma.client.$queryRaw<Array<{ ensure_movements_partition: string }>>(
      Prisma.sql`SELECT ensure_movements_partition(${month}::date)`,
    );
    return rows[0]!.ensure_movements_partition;
  }

  createWarehouse(tenantId: string, code: string, name: string) {
    return this.prisma.client.warehouse.create({ data: { tenantId, code, name } });
  }

  createLot(tenantId: string, productId: string, lotNo: string, expiryDate?: Date) {
    return this.prisma.client.lot.create({
      data: { tenantId, productId, lotNo, expiryDate },
    });
  }

  createSerials(
    tenantId: string,
    input: { productId: string; warehouseId: string; lotId?: string; serialNos: string[] },
  ) {
    return this.prisma.client.inventorySerial.createMany({
      data: input.serialNos.map((serialNo) => ({
        tenantId,
        serialNo,
        productId: input.productId,
        warehouseId: input.warehouseId,
        lotId: input.lotId ?? LOT_SENTINEL,
        status: 'IN_STOCK',
      })),
    });
  }

  countSerials(tenantId: string, warehouseId: string, productId: string, status: string) {
    return this.prisma.client.inventorySerial.count({
      where: { tenantId, warehouseId, productId, status },
    });
  }
}
