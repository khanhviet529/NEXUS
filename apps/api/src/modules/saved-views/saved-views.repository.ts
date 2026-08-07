import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** saved_views + user_preferences — XOÁ CỨNG (§6.2), lưu theo membership (ERD #1) */
@Injectable()
export class SavedViewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listViews(membershipId: string, entity?: string) {
    return this.prisma.client.savedView.findMany({
      where: {
        entity,
        // của mình HOẶC được chia sẻ (§5C.2)
        OR: [{ membershipId }, { isShared: true }],
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  createView(input: {
    tenantId: string;
    membershipId: string;
    entity: string;
    name: string;
    config: Record<string, unknown>;
    isDefault?: boolean;
    isShared?: boolean;
  }) {
    return this.prisma.client.savedView.create({
      data: { ...input, config: input.config as Prisma.InputJsonValue },
    });
  }

  findView(id: string) {
    return this.prisma.client.savedView.findUnique({ where: { id } });
  }

  updateView(
    id: string,
    input: { name?: string; config?: Record<string, unknown>; isDefault?: boolean; isShared?: boolean },
  ) {
    return this.prisma.client.savedView.update({
      where: { id },
      data: { ...input, config: input.config as Prisma.InputJsonValue | undefined },
    });
  }

  deleteView(id: string) {
    return this.prisma.client.savedView.delete({ where: { id } }); // xoá cứng
  }

  getPreferences(membershipId: string) {
    return this.prisma.client.userPreference.findMany({ where: { membershipId } });
  }

  upsertPreference(tenantId: string, membershipId: string, key: string, value: unknown) {
    return this.prisma.client.userPreference.upsert({
      where: { tenantId_membershipId_key: { tenantId, membershipId, key } },
      create: { tenantId, membershipId, key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
  }
}
