import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Writable } from 'node:stream';
import { once } from 'node:events';
import { PrismaService } from '../../infra/prisma/prisma.service';

const BATCH_SIZE = 1_000;

/**
 * [CORE] Export STREAMING — §5B.3/C1, quyết định #7: viết theo streaming
 * TỪ ĐẦU: lặp keyset cursor, ghi thẳng vào stream, KHÔNG giữ mảng kết quả
 * trong bộ nhớ. "Chi phí làm ngay: nửa ngày. Chi phí chuyển đổi sau: viết
 * lại toàn bộ tầng export."
 *
 * Field-level (§4.4c nơi 2): cột nhạy cảm bị LOẠI khỏi export theo quyền
 * của NGƯỜI TẢI — export cũng là một kênh xuất dữ liệu.
 */
@Injectable()
export class ExportStreamRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** CSV products — trả số dòng đã ghi. RAM O(batch), không O(n) (#26) */
  async streamProductsCsv(
    tenantId: string,
    out: Writable,
    opts: { includeCost: boolean; batchSize?: number },
  ): Promise<number> {
    const batchSize = opts.batchSize ?? BATCH_SIZE;
    const header = ['code', 'name_vi', 'name_en', 'base_uom', 'tracking_type']
      .concat(opts.includeCost ? ['cost_price'] : []) // §4.4c nơi 2
      .join(',');
    await write(out, header + '\n');

    let lastId = '00000000-0000-0000-0000-000000000000';
    let total = 0;
    for (;;) {
      // Keyset cursor — không OFFSET (chậm dần), không giữ toàn bộ
      const rows = await this.prisma.client.$queryRaw<
        Array<{
          id: string;
          code: string;
          name_vi: string | null;
          name_en: string | null;
          base_uom: string;
          tracking_type: string;
          cost_price: string | null;
        }>
      >(
        Prisma.sql`SELECT id, code, name->>'vi' AS name_vi, name->>'en' AS name_en,
                          base_uom, tracking_type, cost_price::text
                   FROM products
                   WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
                     AND id > ${lastId}::uuid
                   ORDER BY id
                   LIMIT ${batchSize}`,
      );
      if (rows.length === 0) break;
      // Ghi từng batch — backpressure qua await drain
      const chunk = rows
        .map((r) =>
          [csv(r.code), csv(r.name_vi), csv(r.name_en), csv(r.base_uom), csv(r.tracking_type)]
            .concat(opts.includeCost ? [csv(r.cost_price)] : [])
            .join(','),
        )
        .join('\n');
      await write(out, chunk + '\n');
      total += rows.length;
      lastId = rows[rows.length - 1]!.id;
    }
    return total;
  }
}

function csv(v: string | null): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** write có backpressure — stream đầy thì CHỜ drain, không phình RAM */
async function write(out: Writable, chunk: string): Promise<void> {
  if (!out.write(chunk)) await once(out, 'drain');
}
