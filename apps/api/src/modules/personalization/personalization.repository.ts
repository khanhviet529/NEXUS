import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * [OPT ưu tiên cao] GĐ10 — recent/favorite items (§5C.2/§5C.7).
 * LUÔN khoá theo membershipId — dữ liệu cá nhân hoá, xoá CỨNG (matrix §6.5).
 */
@Injectable()
export class PersonalizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  touchRecent(tenantId: string, membershipId: string, entity: string, entityId: string) {
    return this.prisma.client.recentItem.upsert({
      where: {
        tenantId_membershipId_entity_entityId: { tenantId, membershipId, entity, entityId },
      },
      create: { tenantId, membershipId, entity, entityId },
      update: { viewedAt: new Date() },
    });
  }

  listRecent(membershipId: string, limit = 20) {
    return this.prisma.client.recentItem.findMany({
      where: { membershipId },
      orderBy: { viewedAt: 'desc' },
      take: limit,
      select: { entity: true, entityId: true, viewedAt: true },
    });
  }

  addFavorite(
    tenantId: string,
    membershipId: string,
    entity: string,
    entityId: string,
    label?: string,
  ) {
    return this.prisma.client.favoriteItem.upsert({
      where: {
        tenantId_membershipId_entity_entityId: { tenantId, membershipId, entity, entityId },
      },
      create: { tenantId, membershipId, entity, entityId, label },
      update: { label },
    });
  }

  async removeFavorite(membershipId: string, entity: string, entityId: string): Promise<number> {
    const res = await this.prisma.client.favoriteItem.deleteMany({
      where: { membershipId, entity, entityId },
    });
    return res.count;
  }

  listFavorites(membershipId: string) {
    return this.prisma.client.favoriteItem.findMany({
      where: { membershipId },
      orderBy: { createdAt: 'desc' },
      select: { entity: true, entityId: true, label: true },
    });
  }
}
