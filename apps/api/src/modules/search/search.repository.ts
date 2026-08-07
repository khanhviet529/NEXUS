import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Locale } from '../../common/query/localized';
import { normalizeSearch, resolveLocalizedValue, searchColumnFor } from '../../common/query/localized';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AbilityService } from '../auth/ability.service';

export interface SearchGroup {
  entity: 'Product' | 'Customer' | 'Order' | 'User';
  items: Array<{ id: string; code: string; label: string; href: string }>;
}

const LIMIT_PER_GROUP = 5;

/**
 * [OPT ưu tiên cao] GĐ8 — global search (§5C.7, test #29).
 * LUẬT: row-level scope NHÚNG TRONG WHERE từng nhóm (§4.4 — lọc sau làm sai
 * kết quả); chỉ trả cột định danh (id/code/label) — KHÔNG trả cột nhạy cảm
 * nên field-level không có gì để rò; q chuẩn hoá bằng normalizeSearch trên
 * cột *_search (§3.10 — không unaccent trong DB).
 */
@Injectable()
export class SearchRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ability: AbilityService,
  ) {}

  async search(user: AuthUser, rawQ: string, locale: Locale): Promise<SearchGroup[]> {
    const q = normalizeSearch(rawQ) ?? '';
    if (q.length < 2) return []; // 1 ký tự = quét vô nghĩa + tốn index

    const ability = await this.ability.forUser(user);
    const searchCol = searchColumnFor('name', locale); // đã fallback ở tầng ghi (§3.10)
    const groups: SearchGroup[] = [];

    if (ability.can('product:read')) {
      const rows = await this.prisma.client.product.findMany({
        where: {
          OR: [
            { code: { contains: rawQ.trim(), mode: 'insensitive' } },
            { [searchCol]: { contains: q } },
          ],
        },
        select: { id: true, code: true, name: true },
        take: LIMIT_PER_GROUP,
        orderBy: { code: 'asc' },
      });
      if (rows.length > 0) {
        groups.push({
          entity: 'Product',
          items: rows.map((r) => ({
            id: r.id,
            code: r.code,
            label: resolveLocalizedValue(r.name, locale) ?? r.code,
            href: `/products/${r.id}`,
          })),
        });
      }
    }

    if (ability.can('customer:read')) {
      const rows = await this.prisma.client.customer.findMany({
        where: {
          OR: [
            { code: { contains: rawQ.trim(), mode: 'insensitive' } },
            { [searchCol]: { contains: q } },
          ],
        },
        select: { id: true, code: true, name: true },
        take: LIMIT_PER_GROUP,
        orderBy: { code: 'asc' },
      });
      if (rows.length > 0) {
        groups.push({
          entity: 'Customer',
          items: rows.map((r) => ({
            id: r.id,
            code: r.code,
            label: resolveLocalizedValue(r.name, locale) ?? r.code,
            href: `/customers/${r.id}`,
          })),
        });
      }
    }

    if (ability.can('order:read')) {
      // Scope own/desc NHÚNG WHERE — test #29: staff không thấy đơn người khác
      const scopeWhere = (await ability.scopeWhere('order:read')) as Prisma.OrderWhereInput;
      const rows = await this.prisma.client.order.findMany({
        where: {
          AND: [scopeWhere, { code: { contains: rawQ.trim(), mode: 'insensitive' } }],
        },
        select: { id: true, code: true, status: true },
        take: LIMIT_PER_GROUP,
        orderBy: { code: 'desc' },
      });
      if (rows.length > 0) {
        groups.push({
          entity: 'Order',
          items: rows.map((r) => ({
            id: r.id,
            code: r.code,
            label: `${r.code} · ${r.status}`,
            href: `/orders/${r.id}`,
          })),
        });
      }
    }

    if (ability.can('user:read')) {
      // Người dùng theo MEMBERSHIP trong tenant + scope membership-shape (§4.4)
      const membershipWhere = (await ability.membershipScopeWhere(
        'user:read',
      )) as Prisma.TenantMembershipWhereInput;
      const rows = await this.prisma.client.tenantMembership.findMany({
        where: {
          AND: [
            membershipWhere,
            { status: 'ACTIVE' },
            {
              user: {
                OR: [
                  { fullName: { contains: rawQ.trim(), mode: 'insensitive' } },
                  { email: { contains: rawQ.trim(), mode: 'insensitive' } },
                ],
              },
            },
          ],
        },
        select: { userId: true, user: { select: { fullName: true, email: true } } },
        take: LIMIT_PER_GROUP,
      });
      if (rows.length > 0) {
        groups.push({
          entity: 'User',
          items: rows.map((r) => ({
            id: r.userId,
            code: r.user.email,
            label: r.user.fullName,
            href: `/users/${r.userId}`,
          })),
        });
      }
    }

    return groups;
  }
}
