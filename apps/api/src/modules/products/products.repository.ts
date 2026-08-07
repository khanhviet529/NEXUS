import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { buildSearchColumns, type LocalizedText } from '../../common/query/localized';

/**
 * [REF] Repository products — khuôn mẫu cho generator GĐ9.
 * QUY TẮC §3.10: mọi đường ghi tính lại cột *Search (buildSearchColumns).
 */
@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    where: Record<string, unknown>;
    orderBy: Array<Record<string, 'asc' | 'desc'>>;
    page: number;
    limit: number;
  }) {
    const where = params.where as Prisma.ProductWhereInput;
    const [data, total] = await Promise.all([
      this.prisma.client.product.findMany({
        where,
        orderBy: params.orderBy as Prisma.ProductOrderByWithRelationInput[],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.client.product.count({ where }),
    ]);
    return { data, total };
  }

  findById(id: string) {
    return this.prisma.client.product.findUnique({ where: { id } });
  }

  create(
    tenantId: string,
    input: {
      code: string;
      name: LocalizedText;
      baseUom: string;
      trackingType?: string;
      costPrice?: string;
    },
  ) {
    return this.prisma.client.product.create({
      data: {
        tenantId,
        code: input.code,
        name: input.name as Prisma.InputJsonValue,
        baseUom: input.baseUom,
        trackingType: input.trackingType ?? 'NONE',
        costPrice: input.costPrice,
        ...buildSearchColumns('name', input.name), // §3.10 — BẮT BUỘC mọi đường ghi
      },
    });
  }

  update(
    id: string,
    version: number,
    input: { name?: LocalizedText; baseUom?: string; costPrice?: string },
  ) {
    return this.prisma.client.product.updateMany({
      where: { id, version }, // optimistic locking (§4.5)
      data: {
        name: input.name as Prisma.InputJsonValue | undefined,
        baseUom: input.baseUom,
        costPrice: input.costPrice,
        version: { increment: 1 },
        ...(input.name ? buildSearchColumns('name', input.name) : {}),
      },
    });
  }

  softDelete(id: string) {
    return this.prisma.client.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
