import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface ResolvedSetting {
  key: string;
  value: unknown;
  /** 'tenant' = override của tenant; 'global' = mặc định hệ thống */
  scope: 'tenant' | 'global';
}

/**
 * [CORE] Settings — bảng HYBRID (§6.4): tenant_id NULL = mặc định toàn hệ
 * thống, dòng tenant là OVERRIDE. Extension áp `tenant OR NULL` cho đường
 * đọc; ĐƯỜNG GHI từ API luôn là dòng TENANT (global chỉ sửa qua seed/sysadmin
 * — TC-1 §3C đã siết lỗ ghi chéo).
 */
@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Merge ưu tiên dòng tenant (§6.4 HYBRID "ưu tiên dòng có tenant") */
  async listResolved(tenantId: string): Promise<ResolvedSetting[]> {
    const rows = await this.prisma.client.setting.findMany({
      orderBy: { key: 'asc' },
    });
    const byKey = new Map<string, ResolvedSetting>();
    for (const row of rows) {
      const isTenant = row.tenantId === tenantId;
      const existing = byKey.get(row.key);
      if (!existing || (isTenant && existing.scope === 'global')) {
        byKey.set(row.key, {
          key: row.key,
          value: row.value,
          scope: isTenant ? 'tenant' : 'global',
        });
      }
    }
    return [...byKey.values()];
  }

  /** Upsert dòng TENANT — không đụng dòng global */
  async upsertTenantValue(tenantId: string, key: string, value: unknown) {
    const existing = await this.prisma.client.setting.findFirst({
      where: { key, tenantId }, // extension thêm OR null nhưng tenantId đã chỉ định
    });
    if (existing && existing.tenantId === tenantId) {
      return this.prisma.client.setting.update({
        where: { id: existing.id },
        data: { value: value as Prisma.InputJsonValue },
      });
    }
    return this.prisma.client.setting.create({
      data: { tenantId, key, value: value as Prisma.InputJsonValue },
    });
  }
}
