import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

/**
 * [CORE] GĐ7g — cron tạo mảnh partition trước 1 tháng (§5B.3/C2).
 * Hai bảng partition RANGE (created_at): movements (GĐ5b) + audit_logs (GĐ7).
 * Idempotent (CREATE TABLE IF NOT EXISTS) — worker gọi mỗi ngày vô hại.
 */
@Injectable()
export class PartitionMaintenanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Đảm bảo mảnh tháng này + tháng sau cho cả hai bảng. Trả tên các mảnh. */
  async ensureUpcoming(now = new Date()): Promise<string[]> {
    const months = [now, new Date(now.getFullYear(), now.getMonth() + 1, 1)].map(
      (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
    );
    const names: string[] = [];
    for (const month of months) {
      const [m] = await this.prisma.client.$queryRaw<
        Array<{ ensure_movements_partition: string }>
      >(Prisma.sql`SELECT ensure_movements_partition(${month}::date)`);
      const [a] = await this.prisma.client.$queryRaw<
        Array<{ ensure_audit_logs_partition: string }>
      >(Prisma.sql`SELECT ensure_audit_logs_partition(${month}::date)`);
      names.push(m!.ensure_movements_partition, a!.ensure_audit_logs_partition);
    }
    return names;
  }
}
