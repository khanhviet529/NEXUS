import { Injectable } from '@nestjs/common';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { v7 as uuidv7 } from 'uuid';
import { RequestContextService } from '../../infra/cls/request-context';
import { S3Service } from '../../infra/s3/s3.service';
import { FilesRepository } from '../files/files.repository';
import { NotificationsRepository } from '../notifications/notifications.repository';
import { ExportStreamRepository } from './export-stream.repository';

/** Payload job EXPORT_RUN — field-level chốt tại thời điểm ENQUEUE (§4.4c nơi 2) */
export interface ExportJobPayload {
  tenantId: string;
  userId: string;
  membershipId: string;
  entity: 'products';
  includeCost: boolean;
  /** jobId ổn định — dedup notification khi job retry (at-least-once) */
  jobId: string;
}

/**
 * [CORE] GĐ7f — export QUA QUEUE (§4.7: "luôn qua queue, kể cả dữ liệu nhỏ").
 * Luồng: stream CSV (keyset, RAM O(batch)) → file tạm → S3 → row files
 * → notification JOB_COMPLETED kèm fileId; FE tải qua GET /files/:id (hạn 24h
 * là hạn presigned GET). Chạy trong WORKER — API chỉ enqueue.
 */
@Injectable()
export class ExportsService {
  constructor(
    private readonly exportStream: ExportStreamRepository,
    private readonly s3: S3Service,
    private readonly files: FilesRepository,
    private readonly notifications: NotificationsRepository,
    private readonly ctx: RequestContextService,
  ) {}

  async runExportJob(payload: ExportJobPayload): Promise<{ fileId: string; rows: number }> {
    return this.ctx.runWith(
      { tenantId: payload.tenantId, actorId: 'system:export-run' }, // §4.9 worker actor
      async () => {
        const dir = await mkdtemp(join(tmpdir(), 'nexus-export-'));
        const tmpFile = join(dir, 'export.csv');
        try {
          const out = createWriteStream(tmpFile, { encoding: 'utf8' });
          const rows = await this.exportStream.streamProductsCsv(payload.tenantId, out, {
            includeCost: payload.includeCost,
          });
          out.end();
          await once(out, 'close');

          const fileId = uuidv7();
          const filename = `products-${new Date().toISOString().slice(0, 10)}.csv`;
          const objectKey = this.s3.buildObjectKey(payload.tenantId, fileId, filename);
          const { size } = await stat(tmpFile);
          await this.s3.putObjectStream(objectKey, createReadStream(tmpFile), size, 'text/csv');

          await this.files.createFile({
            id: fileId,
            tenantId: payload.tenantId,
            bucket: this.s3.bucket,
            objectKey,
            filename,
            mime: 'text/csv',
            size,
            uploadedById: payload.userId,
          });
          try {
            await this.notifications.createForMembership({
              id: payload.jobId, // dedup: retry job không tạo thông báo thứ hai
              tenantId: payload.tenantId,
              membershipId: payload.membershipId,
              type: 'JOB_COMPLETED',
              title: `Export ${payload.entity} xong (${rows} dòng)`,
              data: { fileId, rows },
            });
          } catch (e) {
            if (!isUniqueViolation(e)) throw e; // P2002 = retry lần 2 — bỏ qua êm
          }
          return { fileId, rows };
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      },
    );
  }
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002'
  );
}
