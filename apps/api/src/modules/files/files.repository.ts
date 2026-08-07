import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ENTITY_TYPES } from '@nexus/shared';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AbilityService } from '../auth/ability.service';

/**
 * [CORE] GĐ7 — Files + attachments (matrix §2.5).
 * LUẬT KẾ THỪA QUYỀN: file KHÔNG có quyền đọc riêng — xem được entity gốc thì
 * xem được file đính kèm. File chưa đính vào đâu: chỉ NGƯỜI UPLOAD xem được.
 */
@Injectable()
export class FilesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ability: AbilityService,
  ) {}

  createFile(input: {
    id: string;
    tenantId: string;
    bucket: string;
    objectKey: string;
    filename: string;
    mime: string;
    size: number;
    checksum?: string;
    uploadedById: string;
  }) {
    return this.prisma.client.file.create({ data: input });
  }

  findFile(id: string) {
    return this.prisma.client.file.findFirst({
      where: { id },
      include: { attachments: true },
    });
  }

  attach(input: {
    tenantId: string;
    fileId: string;
    entity: string;
    entityId: string;
    category?: string;
  }) {
    return this.prisma.client.attachment.create({ data: input });
  }

  /** File đính vào một bản ghi — cho tab "Tệp đính kèm" trang chi tiết */
  listByEntity(entity: string, entityId: string) {
    return this.prisma.client.attachment.findMany({
      where: { entity, entityId },
      include: { file: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Quyền đọc KẾ THỪA entity gốc (matrix §2.5): có permission read của entity
   * VÀ bản ghi nằm trong scope — kiểm bằng scoped findFirst, NHÚNG trong WHERE.
   */
  async canReadEntity(user: AuthUser, entity: string, entityId: string): Promise<boolean> {
    const ability = await this.ability.forUser(user);
    const scopedExists = async (
      permission: string,
      find: (where: Record<string, unknown>) => Promise<{ id: string } | null>,
    ): Promise<boolean> => {
      if (!ability.can(permission)) return false;
      const scopeWhere = await ability.scopeWhere(permission);
      return !!(await find(scopeWhere));
    };

    switch (entity) {
      case ENTITY_TYPES.ORDER:
        return scopedExists('order:read', (w) =>
          this.prisma.client.order.findFirst({
            where: { AND: [w as Prisma.OrderWhereInput, { id: entityId }] },
            select: { id: true },
          }),
        );
      case ENTITY_TYPES.CUSTOMER:
        return scopedExists('customer:read', (w) =>
          this.prisma.client.customer.findFirst({
            where: { AND: [w as Prisma.CustomerWhereInput, { id: entityId }] },
            select: { id: true },
          }),
        );
      case ENTITY_TYPES.PRODUCT:
        return scopedExists('product:read', (w) =>
          this.prisma.client.product.findFirst({
            where: { AND: [w as Prisma.ProductWhereInput, { id: entityId }] },
            select: { id: true },
          }),
        );
      default:
        // Entity chưa đăng ký kế thừa quyền → fail-closed (§4.4)
        return false;
    }
  }
}
