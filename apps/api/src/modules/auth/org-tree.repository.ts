import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * [CORE] Cây đơn vị bằng ltree — spec §4.4 quy tắc 5: scope descendants là
 * MỘT truy vấn, không đệ quy.
 *
 * Raw SQL đọc (cột path nằm ngoài Prisma) — raw KHÔNG qua tenancy extension
 * nên PHẢI tự thêm tenant_id vào WHERE (§4.9, cookbook §12 bước 3).
 */
@Injectable()
export class OrgTreeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Đơn vị + toàn bộ con cháu — dùng cho scope descendants */
  async getDescendantIds(tenantId: string, orgUnitId: string): Promise<string[]> {
    const rows = await this.prisma.client.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM org_units
                 WHERE tenant_id = ${tenantId}::uuid
                   AND deleted_at IS NULL
                   AND path <@ (SELECT path FROM org_units
                                WHERE id = ${orgUnitId}::uuid
                                  AND tenant_id = ${tenantId}::uuid)`,
    );
    return rows.map((r) => r.id);
  }

  /** label ltree từ uuid: bỏ dấu gạch — [a-f0-9]{32}, hợp lệ tuyệt đối */
  static label(id: string): string {
    return id.replace(/-/g, '');
  }

  /** Set path lúc tạo: path cha + label mình (root: label mình) */
  async setPathOnCreate(
    tenantId: string,
    id: string,
    parentId: string | null,
    // Caller đang trong $transaction PHẢI truyền tx: chạy trên client riêng
    // sẽ không thấy org_unit chưa commit (F10 mở rộng — provisionTenant)
    db?: { $executeRaw: (sql: Prisma.Sql) => Promise<unknown> },
  ): Promise<void> {
    const client = db ?? this.prisma.client;
    if (parentId) {
      await client.$executeRaw(
        Prisma.sql`UPDATE org_units
                   SET path = (SELECT path FROM org_units
                               WHERE id = ${parentId}::uuid AND tenant_id = ${tenantId}::uuid)
                              || text2ltree(${OrgTreeRepository.label(id)})
                   WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`,
      );
    } else {
      await client.$executeRaw(
        Prisma.sql`UPDATE org_units
                   SET path = text2ltree(${OrgTreeRepository.label(id)})
                   WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`,
      );
    }
  }

  /** node đích có phải con cháu của node gốc? — chặn vòng lặp khi move (§5C.10) */
  async isDescendantOf(tenantId: string, nodeId: string, maybeAncestorId: string): Promise<boolean> {
    const rows = await this.prisma.client.$queryRaw<Array<{ ok: boolean }>>(
      Prisma.sql`SELECT (SELECT path FROM org_units WHERE id = ${nodeId}::uuid AND tenant_id = ${tenantId}::uuid)
                        <@ (SELECT path FROM org_units WHERE id = ${maybeAncestorId}::uuid AND tenant_id = ${tenantId}::uuid)
                        AS ok`,
    );
    return rows[0]?.ok === true;
  }

  /** Move cả subtree khi đổi cha — chuẩn ltree, một câu UPDATE */
  async moveSubtree(tenantId: string, id: string, newParentId: string | null): Promise<void> {
    const newParentPath = newParentId
      ? Prisma.sql`(SELECT path FROM org_units WHERE id = ${newParentId}::uuid AND tenant_id = ${tenantId}::uuid) || text2ltree(${OrgTreeRepository.label(id)})`
      : Prisma.sql`text2ltree(${OrgTreeRepository.label(id)})`;
    await this.prisma.client.$executeRaw(
      Prisma.sql`UPDATE org_units child
                 SET path = ${newParentPath} || CASE
                       WHEN nlevel(child.path) > nlevel(me.path)
                       THEN subpath(child.path, nlevel(me.path))
                       ELSE ''::ltree END
                 FROM org_units me
                 WHERE me.id = ${id}::uuid AND me.tenant_id = ${tenantId}::uuid
                   AND child.tenant_id = ${tenantId}::uuid
                   AND child.path <@ me.path`,
    );
  }
}
