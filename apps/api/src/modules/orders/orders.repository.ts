import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { calculateMoney, DEFAULT_MONEY_CONFIG, type MoneyResult } from '@nexus/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { OutboxRepository, type TxClient } from '../outbox/outbox.repository';
import { AuditRepository, type AuditEntry } from '../audit/audit.repository';

export interface OrderItemInput {
  productId: string;
  quantity: string;
  unitPrice: string;
  discountPercent?: string;
  taxRate?: string;
  uom?: string;
}

const ORDER_INCLUDE = {
  customer: { select: { id: true, code: true, name: true } },
  items: { orderBy: { lineNo: 'asc' as const } },
};

/**
 * [REF] Repository orders — mẫu chuẩn cho chứng từ:
 * đánh số atomic UPSERT (§4.7), aggregate ghi trong MỘT transaction,
 * items xoá cứng trong tx sửa Order (#47), outbox trong CÙNG tx (§4.8).
 */
@Injectable()
export class OrdersRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxRepository,
    private readonly audit: AuditRepository,
  ) {}

  /** §4.7 — ĐÃ CHỐT: atomic UPSERT, trong CÙNG transaction tạo chứng từ */
  private async nextCode(tx: TxClient, tenantId: string, year: number): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ current_value: number }>>(
      Prisma.sql`INSERT INTO document_sequences (tenant_id, key, year, current_value)
                 VALUES (${tenantId}::uuid, 'ORDER', ${year}, 1)
                 ON CONFLICT (tenant_id, key, year)
                 DO UPDATE SET current_value = document_sequences.current_value + 1
                 RETURNING current_value`,
    );
    const seq = rows[0]!.current_value;
    return `ORD-${year}-${String(seq).padStart(5, '0')}`;
  }

  /** Snapshot sản phẩm cho items (§3.10 luật 2: chốt tên lúc phát sinh) */
  private async buildItems(
    tx: TxClient,
    tenantId: string,
    inputs: OrderItemInput[],
    money: MoneyResult,
  ) {
    const products = await tx.product.findMany({
      where: { id: { in: inputs.map((i) => i.productId) } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return inputs.map((input, i) => {
      const product = byId.get(input.productId);
      if (!product) {
        throw new Prisma.PrismaClientKnownRequestError('Product not found', {
          code: 'P2025',
          clientVersion: 'app',
        });
      }
      const name = product.name as { vi?: string; en?: string };
      return {
        tenantId,
        productId: input.productId,
        productNameSnapshot: name.vi ?? name.en ?? product.code, // chốt tên (§3.10)
        quantity: input.quantity,
        uom: input.uom ?? product.baseUom,
        uomFactorSnapshot: '1',
        unitPrice: input.unitPrice,
        discountPercent: input.discountPercent ?? '0',
        taxRate: input.taxRate ?? '0',
        amount: money.lines[i]!.amount,
        costPrice: product.costPrice, // chốt giá vốn — group cost
        lineNo: i + 1,
      };
    });
  }

  private computeMoney(items: OrderItemInput[]): MoneyResult {
    return calculateMoney(
      items.map((i) => ({
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountPercent: i.discountPercent,
        taxRate: i.taxRate,
      })),
      DEFAULT_MONEY_CONFIG,
    );
  }

  /** margin = Σ(net) − Σ(cost×qty) — field-level group cost */
  private computeMargin(
    money: MoneyResult,
    items: Array<{ costPrice: Prisma.Decimal | string | null; quantity: string }>,
  ): string {
    const cost = items.reduce(
      (s, i) => s + Number(i.costPrice ?? 0) * Number(i.quantity),
      0,
    );
    return (Number(money.subtotal) - cost).toFixed(2);
  }

  async create(input: {
    tenantId: string;
    userId: string;
    orgUnitId?: string;
    customerId: string;
    currency?: string;
    items: OrderItemInput[];
  }) {
    const money = this.computeMoney(input.items);
    return this.prisma.client.$transaction(async (tx) => {
      const code = await this.nextCode(tx, input.tenantId, new Date().getFullYear());
      const items = await this.buildItems(tx, input.tenantId, input.items, money);
      return tx.order.create({
        data: {
          tenantId: input.tenantId,
          code,
          customerId: input.customerId,
          currency: input.currency ?? 'VND',
          status: 'DRAFT',
          subtotal: money.subtotal,
          discountTotal: money.discountTotal,
          taxTotal: money.taxTotal,
          total: money.total,
          margin: this.computeMargin(money, items),
          createdById: input.userId,
          orgUnitId: input.orgUnitId,
          items: { create: items.map(({ tenantId: _t, ...rest }) => rest) },
        },
        include: ORDER_INCLUDE,
      });
    });
  }

  /** Sửa DRAFT/REJECTED: thay TOÀN BỘ items trong tx + optimistic lock (#47) */
  async replaceItems(input: {
    tenantId: string;
    orderId: string;
    version: number;
    items: OrderItemInput[];
  }): Promise<'ok' | 'conflict'> {
    const money = this.computeMoney(input.items);
    return this.prisma.client.$transaction(async (tx) => {
      const items = await this.buildItems(tx, input.tenantId, input.items, money);
      const affected = await tx.order.updateMany({
        where: { id: input.orderId, version: input.version },
        data: {
          subtotal: money.subtotal,
          discountTotal: money.discountTotal,
          taxTotal: money.taxTotal,
          total: money.total,
          margin: this.computeMargin(money, items),
          version: { increment: 1 },
        },
      });
      if (affected.count === 0) return 'conflict'; // §4.5 optimistic locking
      await tx.orderItem.deleteMany({ where: { orderId: input.orderId } }); // xoá cứng trong tx (#47)
      for (const item of items) {
        await tx.orderItem.create({ data: { ...item, orderId: input.orderId } });
      }
      return 'ok';
    });
  }

  /**
   * Chuyển trạng thái + optimistic lock trong MỘT câu UPDATE có điều kiện.
   * approve: ghi outbox ORDER_APPROVED trong CÙNG transaction (§4.8, #20b).
   */
  async transition(input: {
    tenantId: string;
    orderId: string;
    version: number;
    fromStatus: string;
    toStatus: string;
    actorId: string;
    /** ADR-0004 đk2: audit ghi TRONG CÙNG tx — cùng sống cùng chết */
    audit: AuditEntry;
    emitApprovedEvent?: boolean;
    orderCode?: string;
    createdById?: string | null;
    failAfterOutboxForTest?: boolean; // #20b: rollback sau khi ghi outbox
    failAuditForTest?: boolean; // ADR-0004: lỗi SAU audit → phải rollback cả write
  }): Promise<'ok' | 'conflict'> {
    return this.prisma.client.$transaction(async (tx) => {
      const affected = await tx.order.updateMany({
        where: { id: input.orderId, version: input.version, status: input.fromStatus },
        data: {
          status: input.toStatus,
          version: { increment: 1 },
          ...(input.toStatus === 'APPROVED'
            ? { approvedAt: new Date(), approvedById: input.actorId }
            : {}),
        },
      });
      if (affected.count === 0) return 'conflict';

      // Audit TRONG transaction (ADR-0004 đk2) — trước outbox để mọi lỗi
      // phía sau đều cuốn cả audit lẫn write nghiệp vụ về cùng trạng thái
      await this.audit.writeInTx(tx, input.audit);
      if (input.failAuditForTest) {
        throw new Error('TEST_AUDIT_FAILURE');
      }

      if (input.emitApprovedEvent) {
        await this.outbox.enqueueInTx(tx, {
          tenantId: input.tenantId,
          eventType: 'ORDER_APPROVED',
          aggregateType: 'Order',
          aggregateId: input.orderId,
          payload: {
            orderId: input.orderId,
            orderCode: input.orderCode ?? '',
            createdById: input.createdById ?? null,
            approvedById: input.actorId,
          },
        });
        if (input.failAfterOutboxForTest) {
          throw new Error('TEST_ROLLBACK_AFTER_OUTBOX'); // #20b
        }
      }
      return 'ok';
    });
  }

  findById(orderId: string) {
    return this.prisma.client.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
  }

  findInScope(scopeWhere: Record<string, unknown>, orderId: string) {
    return this.prisma.client.order.findFirst({
      where: { AND: [scopeWhere as Prisma.OrderWhereInput, { id: orderId }] },
      include: ORDER_INCLUDE,
    });
  }

  async list(params: {
    where: Record<string, unknown>;
    scopeWhere: Record<string, unknown>;
    orderBy: Array<Record<string, 'asc' | 'desc'>>;
    page: number;
    limit: number;
  }) {
    const where: Prisma.OrderWhereInput = {
      AND: [params.where as Prisma.OrderWhereInput, params.scopeWhere as Prisma.OrderWhereInput],
    };
    const [data, total] = await Promise.all([
      this.prisma.client.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: params.orderBy as Prisma.OrderOrderByWithRelationInput[],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.client.order.count({ where }),
    ]);
    return { data, total };
  }

  softDelete(orderId: string) {
    return this.prisma.client.order.update({
      where: { id: orderId },
      data: { deletedAt: new Date() },
    });
  }

  /** Delete guard A2: Product đang được order item nào tham chiếu? */
  countItemsOfProduct(productId: string) {
    return this.prisma.client.orderItem.count({ where: { productId } });
  }

  countOrdersOfCustomer(customerId: string) {
    return this.prisma.client.order.count({ where: { customerId } });
  }
}
