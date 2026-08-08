import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContextService } from '../../infra/cls/request-context';
import { buildSearchColumns, type LocalizedText } from '../../common/query/localized';
import { AuditRepository } from '../audit/audit.repository';

const BATCH_SIZE = 500; // §4.7: mỗi batch MỘT transaction, 500–1.000 dòng

export interface ImportRowError {
  rowNumber: number;
  errors: string[];
}

/**
 * [OPT khuyến nghị giữ] Import — §4.7 đặc tả giao dịch KHÔNG MƠ HỒ:
 *   - Mỗi batch một transaction riêng — TUYỆT ĐỐI không 1 tx cho cả file
 *   - Checkpoint last_processed_row TRONG CÙNG transaction của batch —
 *     retry resume từ checkpoint, không chạy lại từ đầu (#27)
 *   - Chống trùng khi retry: UNIQUE business key (products code) — lớp 3 §3.9
 */
@Injectable()
export class ImportsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
    private readonly audit: AuditRepository,
  ) {}

  async createJob(input: {
    tenantId: string;
    entity: string;
    mode?: string;
    onDuplicate?: string;
    rows: Array<Record<string, unknown>>;
    createdById: string;
  }) {
    return this.prisma.client.$transaction(async (tx) => {
      const job = await tx.importJob.create({
        data: {
          tenantId: input.tenantId,
          entity: input.entity,
          mode: input.mode ?? 'partial-success',
          onDuplicate: input.onDuplicate ?? 'skip',
          status: 'PENDING',
          totalRows: input.rows.length,
          createdById: input.createdById,
        },
      });
      // createMany MỘT câu — 100k dòng không được chết vì timeout transaction
      await tx.importRow.createMany({
        data: input.rows.map((raw, i) => ({
          tenantId: input.tenantId,
          jobId: job.id,
          rowNumber: i + 1,
          raw: raw as Prisma.InputJsonValue,
        })),
      });
      return job;
    });
  }

  findJob(jobId: string) {
    return this.prisma.client.importJob.findUnique({
      where: { id: jobId },
      include: { _count: { select: { rows: true } } },
    });
  }

  listErrors(jobId: string) {
    return this.prisma.client.importRow.findMany({
      where: { jobId, status: 'ERROR' },
      orderBy: { rowNumber: 'asc' },
      select: { rowNumber: true, raw: true, errors: true },
    });
  }

  /**
   * Worker xử lý — GỌI LẠI được sau khi chết giữa chừng (#27).
   * failAfterBatches: cờ test — chết sau N batch để kiểm chứng resume.
   */
  async process(
    jobId: string,
    opts?: { batchSize?: number; failAfterBatches?: number },
  ): Promise<{ ok: number; errors: number; resumedFrom: number }> {
    // Job tự set CLS (§4.8): tra tenant của job (bypass có chủ đích) rồi
    // chạy TOÀN BỘ trong context tenant đó, actor system:import
    const jobMeta = await this.ctx.runWith({ tenancyBypass: true }, () =>
      this.prisma.client.importJob.findUniqueOrThrow({
        where: { id: jobId },
        select: { tenantId: true },
      }),
    );
    return this.ctx.runWith(
      { tenantId: jobMeta.tenantId, actorId: 'system:import' },
      () => this.processInContext(jobId, opts),
    );
  }

  private async processInContext(
    jobId: string,
    opts?: { batchSize?: number; failAfterBatches?: number },
  ): Promise<{ ok: number; errors: number; resumedFrom: number }> {
    const batchSize = opts?.batchSize ?? BATCH_SIZE;
    const job = await this.prisma.client.importJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    const resumedFrom = job.lastProcessedRow; // CHECKPOINT — không chạy lại từ đầu
    await this.prisma.client.importJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING' },
    });

    let batchesDone = 0;
    let cursor = resumedFrom;
    for (;;) {
      const rows = await this.prisma.client.importRow.findMany({
        where: { jobId, rowNumber: { gt: cursor } },
        orderBy: { rowNumber: 'asc' },
        take: batchSize,
      });
      if (rows.length === 0) break;

      // MỖI BATCH MỘT TRANSACTION (§4.7).
      // Postgres: một câu FAIL trong tx là tx ABORT (25P02) — nên KHÔNG catch
      // P2002 giữa chừng; PRE-CHECK trùng bằng SELECT trước khi insert.
      // (Race hai import song song → P2002 hiếm → cả batch rollback, retry lại.)
      // Timeout tường minh: batch 500 dòng ≈ 1.000 câu tuần tự — mặc định 5s
      // của Prisma không đủ khi máy tải nặng; hết timeout giữa batch vẫn an
      // toàn nhờ checkpoint (#27) nhưng làm job fail không đáng.
      await this.prisma.client.$transaction(
        async (tx) => {
        const codes = rows
          .map((r) => (r.raw as Record<string, unknown>)['code'])
          .filter((c): c is string => typeof c === 'string' && c !== '');
        // Chỉ bản SỐNG (extension inject deletedAt: null) — khớp partial unique
        const existing = new Set(
          (
            await tx.product.findMany({
              where: { code: { in: codes } },
              select: { code: true },
            })
          ).map((p) => p.code),
        );

        for (const row of rows) {
          const raw = row.raw as Record<string, unknown>;
          const errors = this.validateProductRow(raw);
          if (errors.length > 0) {
            await tx.importRow.update({
              where: { id: row.id },
              data: { status: 'ERROR', errors },
            });
            continue;
          }
          const code = String(raw['code']);
          if (existing.has(code)) {
            // UNIQUE business key (lớp 3 §3.9) — kể cả trùng do RETRY job
            const status = job.onDuplicate === 'skip' ? 'SKIPPED' : 'ERROR';
            await tx.importRow.update({
              where: { id: row.id },
              data: { status, errors: status === 'ERROR' ? ['Mã đã tồn tại'] : undefined },
            });
            continue;
          }
          existing.add(code); // trùng NGAY TRONG file cũng bắt
          await tx.product.create({
            data: {
              tenantId: job.tenantId,
              code,
              name: {
                vi: String(raw['nameVi']),
                en: raw['nameEn'] ? String(raw['nameEn']) : undefined,
              } as Prisma.InputJsonValue,
              baseUom: String(raw['baseUom']),
              costPrice: raw['costPrice'] ? String(raw['costPrice']) : undefined,
              source: 'import',
              externalId: raw['externalId'] ? String(raw['externalId']) : undefined,
              ...buildSearchColumns('name', {
                vi: String(raw['nameVi']),
                en: raw['nameEn'] ? String(raw['nameEn']) : undefined,
              } as LocalizedText),
            },
          });
          await tx.importRow.update({ where: { id: row.id }, data: { status: 'OK' } });
        }
        // CHECKPOINT trong CÙNG transaction của batch (#27)
        cursor = rows[rows.length - 1]!.rowNumber;
        await tx.importJob.update({
          where: { id: jobId },
          data: { lastProcessedRow: cursor },
        });
        },
        { timeout: 60_000, maxWait: 10_000 },
      );

      batchesDone++;
      if (opts?.failAfterBatches !== undefined && batchesDone >= opts.failAfterBatches) {
        throw new Error('TEST_WORKER_CRASH'); // #27: chết giữa chừng
      }
    }

    // Tổng kết
    const [ok, errors] = await Promise.all([
      this.prisma.client.importRow.count({ where: { jobId, status: 'OK' } }),
      this.prisma.client.importRow.count({ where: { jobId, status: 'ERROR' } }),
    ]);
    await this.prisma.client.importJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', validRows: ok, errorRows: errors },
    });
    // §4.9 (ADR-0004): bulk/import ghi MỘT bản audit cho CẢ LÔ + affectedCount,
    // không ghi 10.000 dòng
    await this.audit.write({
      tenantId: job.tenantId,
      entity: 'ImportJob',
      entityId: jobId,
      action: 'IMPORT_COMPLETED',
      after: { entityType: job.entity, affectedCount: ok, errorRows: errors, resumedFrom },
    });
    return { ok, errors, resumedFrom };
  }

  private validateProductRow(raw: Record<string, unknown>): string[] {
    const errors: string[] = [];
    if (!raw['code'] || String(raw['code']).trim() === '') errors.push('Thiếu mã (code)');
    if (!raw['nameVi'] || String(raw['nameVi']).trim() === '') {
      errors.push('Thiếu tên tiếng Việt (nameVi)'); // §3.10: locale gốc bắt buộc
    }
    if (!raw['baseUom']) errors.push('Thiếu đơn vị cơ sở (baseUom)');
    if (raw['costPrice'] !== undefined && raw['costPrice'] !== null && raw['costPrice'] !== '') {
      if (!/^\d+(\.\d+)?$/.test(String(raw['costPrice']))) {
        errors.push('costPrice phải là chuỗi decimal');
      }
    }
    return errors;
  }
}
