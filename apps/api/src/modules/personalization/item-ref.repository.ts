import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Locale } from '../../common/query/localized';
import { resolveLocalizedValue } from '../../common/query/localized';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AbilityService } from '../auth/ability.service';

export interface ResolvedRef {
  code: string;
  label: string;
  href: string;
}

/**
 * V13 — đổi (entity, entityId) thành nhãn hiển thị cho Cmd+K (§5C.7).
 *
 * CÙNG LUẬT với global search: quyền row-level NHÚNG TRONG WHERE (§4.4) —
 * bản ghi user hết quyền xem (đổi đơn vị, thu quyền) thì KHÔNG resolve được
 * và bị caller loại khỏi danh sách, thay vì lộ nhãn của bản ghi cấm.
 * Chỉ trả cột định danh (code/label) — field-level không có gì để rò.
 */
@Injectable()
export class ItemRefRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ability: AbilityService,
  ) {}

  async resolve(
    user: AuthUser,
    locale: Locale,
    refs: Array<{ entity: string; entityId: string }>,
  ): Promise<Map<string, ResolvedRef>> {
    const out = new Map<string, ResolvedRef>();
    if (refs.length === 0) return out;

    const byEntity = new Map<string, string[]>();
    for (const r of refs) {
      byEntity.set(r.entity, [...(byEntity.get(r.entity) ?? []), r.entityId]);
    }
    const ability = await this.ability.forUser(user);
    const put = (entity: string, id: string, ref: ResolvedRef) =>
      out.set(`${entity}:${id}`, ref);

    const productIds = byEntity.get('Product');
    if (productIds && ability.can('product:read')) {
      const rows = await this.prisma.client.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, code: true, name: true },
      });
      for (const r of rows) {
        put('Product', r.id, {
          code: r.code,
          label: resolveLocalizedValue(r.name, locale) ?? r.code,
          href: `/products/${r.id}`,
        });
      }
    }

    const customerIds = byEntity.get('Customer');
    if (customerIds && ability.can('customer:read')) {
      const rows = await this.prisma.client.customer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, code: true, name: true },
      });
      for (const r of rows) {
        put('Customer', r.id, {
          code: r.code,
          label: resolveLocalizedValue(r.name, locale) ?? r.code,
          href: `/customers/${r.id}`,
        });
      }
    }

    const orderIds = byEntity.get('Order');
    if (orderIds && ability.can('order:read')) {
      const scopeWhere = (await ability.scopeWhere('order:read')) as Prisma.OrderWhereInput;
      const rows = await this.prisma.client.order.findMany({
        where: { AND: [scopeWhere, { id: { in: orderIds } }] },
        select: { id: true, code: true, status: true },
      });
      for (const r of rows) {
        put('Order', r.id, {
          code: r.code,
          label: `${r.code} · ${r.status}`,
          href: `/orders/${r.id}`,
        });
      }
    }

    const userIds = byEntity.get('User');
    if (userIds && ability.can('user:read')) {
      const membershipWhere = (await ability.membershipScopeWhere(
        'user:read',
      )) as Prisma.TenantMembershipWhereInput;
      const rows = await this.prisma.client.tenantMembership.findMany({
        where: { AND: [membershipWhere, { userId: { in: userIds } }] },
        select: { userId: true, user: { select: { fullName: true, email: true } } },
      });
      for (const r of rows) {
        put('User', r.userId, {
          code: r.user.email,
          label: r.user.fullName,
          href: `/users/${r.userId}`,
        });
      }
    }

    // Entity ngoài 4 loại có màn hình → không resolve, caller tự loại.
    return out;
  }
}
