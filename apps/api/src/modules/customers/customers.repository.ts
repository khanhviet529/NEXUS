import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { buildSearchColumns, type LocalizedText } from '../../common/query/localized';

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(page: number, limit: number) {
    return Promise.all([
      this.prisma.client.customer.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.customer.count(),
    ]);
  }

  create(tenantId: string, input: { code: string; name: LocalizedText; taxCode?: string }) {
    return this.prisma.client.customer.create({
      data: {
        tenantId,
        code: input.code,
        name: input.name as Prisma.InputJsonValue,
        taxCode: input.taxCode,
        ...buildSearchColumns('name', input.name), // §3.10 — mọi đường ghi
      },
    });
  }
}
