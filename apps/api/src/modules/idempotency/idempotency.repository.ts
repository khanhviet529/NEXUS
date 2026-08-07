import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

const EXPIRES_DAYS = 30; // §3.9: dài hơn cửa sổ retry tối đa của queue

@Injectable()
export class IdempotencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Lớp 2 — INSERT với status PROCESSING. P2002 = key đã tồn tại */
  async tryInsert(input: {
    tenantId: string;
    key: string;
    operation: string;
    requestHash: string;
  }): Promise<'inserted' | 'exists'> {
    try {
      await this.prisma.client.idempotencyRequest.create({
        data: {
          tenantId: input.tenantId,
          key: input.key,
          operation: input.operation,
          requestHash: input.requestHash,
          status: 'PROCESSING',
          expiresAt: new Date(Date.now() + EXPIRES_DAYS * 86_400_000),
        },
      });
      return 'inserted';
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return 'exists';
      }
      throw e;
    }
  }

  findByKey(tenantId: string, key: string) {
    return this.prisma.client.idempotencyRequest.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
  }

  markCompleted(id: string, responseStatus: number, responseBody: unknown) {
    return this.prisma.client.idempotencyRequest.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        responseStatus,
        responseBody: responseBody as Prisma.InputJsonValue,
      },
    });
  }

  /** KHÔNG XOÁ row khi thất bại (§3.9) — giữ để đếm attempts + điều tra */
  markFailed(id: string) {
    return this.prisma.client.idempotencyRequest.update({
      where: { id },
      data: { status: 'FAILED' },
    });
  }

  /** FAILED → cho chạy lại: giành quyền bằng conditional update (chống race) */
  async tryTakeoverFailed(id: string): Promise<boolean> {
    const r = await this.prisma.client.idempotencyRequest.updateMany({
      where: { id, status: 'FAILED' },
      data: { status: 'PROCESSING', attempts: { increment: 1 } },
    });
    return r.count === 1;
  }
}
