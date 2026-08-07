import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AppException } from '../../common/errors/app.exception';
import { RedisService } from '../../infra/redis/redis.service';
import { IdempotencyRepository } from './idempotency.repository';

const REDIS_TTL_SECONDS = 24 * 3600; // lớp 1 — cache 24h (§3.9)

export interface IdempotentResult {
  status: number;
  body: unknown;
  /** true = trả lại từ lần gọi trước, không chạy nghiệp vụ */
  replayed: boolean;
}

/**
 * [CORE] Idempotency 3 lớp — spec §3.9, quyết định #20/#50.
 *
 *   Lớp 1: Redis cache theo key      — retry nhanh trong vài giây
 *   Lớp 2: bảng idempotency_requests — retry sau nhiều ngày, Redis đã mất
 *   Lớp 3: unique business key       — TRÁCH NHIỆM CỦA NGHIỆP VỤ (mã chứng từ,
 *          movement_dedup_keys) — lớp này không nằm ở đây, nhưng là lớp duy
 *          nhất chống trùng đến từ đường không qua idempotency. KHÔNG ĐƯỢC BỎ.
 *
 * State machine #50:
 *   chưa có key                → INSERT PROCESSING → chạy nghiệp vụ
 *   cùng hash + COMPLETED      → trả NGUYÊN response cũ
 *   cùng hash + PROCESSING     → 409 IDEMPOTENCY_IN_PROGRESS + Retry-After
 *   KHÁC hash                  → 409 IDEMPOTENCY_KEY_REUSED (lỗi client)
 *   FAILED                     → chạy lại, attempts + 1 (không xoá row)
 */
@Injectable()
export class IdempotencyService {
  constructor(
    private readonly repo: IdempotencyRepository,
    private readonly redis: RedisService,
  ) {}

  private redisKey(tenantId: string, key: string): string {
    return this.redis.tenantKey('idem', tenantId, key);
  }

  /** Hash body đã CHUẨN HOÁ (sort key đệ quy) — cùng nội dung luôn cùng hash */
  static hashRequest(body: unknown): string {
    return createHash('sha256').update(canonicalJson(body)).digest('hex');
  }

  async run(input: {
    tenantId: string;
    key: string;
    operation: string;
    requestBody: unknown;
    handler: () => Promise<{ status: number; body: unknown }>;
  }): Promise<IdempotentResult> {
    const requestHash = IdempotencyService.hashRequest(input.requestBody);

    // ---- Lớp 1: Redis ----
    try {
      const cached = await this.redis.client.get(this.redisKey(input.tenantId, input.key));
      if (cached) {
        const parsed = JSON.parse(cached) as { hash: string; status: number; body: unknown };
        if (parsed.hash !== requestHash) {
          throw new AppException('COMMON.IDEMPOTENCY_KEY_REUSED');
        }
        return { status: parsed.status, body: parsed.body, replayed: true };
      }
    } catch (e) {
      if (e instanceof AppException) throw e;
      // Redis hỏng → rơi xuống lớp DB, không chặn request
    }

    // ---- Lớp 2: DB — vòng lặp state machine ----
    // Tối đa 2 vòng: inserted → chạy; exists → phân xử; FAILED takeover → chạy
    for (let attempt = 0; attempt < 3; attempt++) {
      const inserted = await this.repo.tryInsert({
        tenantId: input.tenantId,
        key: input.key,
        operation: input.operation,
        requestHash,
      });

      if (inserted === 'inserted') {
        return this.execute(input, requestHash);
      }

      const row = await this.repo.findByKey(input.tenantId, input.key);
      if (!row) continue; // row vừa bị xoá bởi job dọn hạn — thử insert lại

      if (row.requestHash !== requestHash) {
        // Client dùng lại key cho NỘI DUNG KHÁC — lỗi phía client (#50)
        throw new AppException('COMMON.IDEMPOTENCY_KEY_REUSED');
      }
      if (row.status === 'COMPLETED') {
        return { status: row.responseStatus ?? 200, body: row.responseBody, replayed: true };
      }
      if (row.status === 'PROCESSING') {
        throw new AppException('COMMON.IDEMPOTENCY_IN_PROGRESS', {
          details: { retryAfterSeconds: 2 },
        });
      }
      // FAILED → giành quyền chạy lại
      if (await this.repo.tryTakeoverFailed(row.id)) {
        return this.execute(input, requestHash, row.id);
      }
      // Thua race takeover → vòng sau sẽ thấy PROCESSING/COMPLETED
    }
    throw new AppException('COMMON.IDEMPOTENCY_IN_PROGRESS', {
      details: { retryAfterSeconds: 2 },
    });
  }

  private async execute(
    input: {
      tenantId: string;
      key: string;
      handler: () => Promise<{ status: number; body: unknown }>;
    },
    requestHash: string,
    existingRowId?: string,
  ): Promise<IdempotentResult> {
    let rowId = existingRowId;
    if (!rowId) {
      const row = await this.repo.findByKey(input.tenantId, input.key);
      rowId = row!.id;
    }
    try {
      const result = await input.handler();
      await this.repo.markCompleted(rowId, result.status, result.body);
      try {
        await this.redis.client.set(
          this.redisKey(input.tenantId, input.key),
          JSON.stringify({ hash: requestHash, status: result.status, body: result.body }),
          'EX',
          REDIS_TTL_SECONDS,
        );
      } catch {
        /* cache best-effort */
      }
      return { ...result, replayed: false };
    } catch (e) {
      // Nghiệp vụ rollback trước khi có side-effect → FAILED, GIỮ ROW (§3.9)
      await this.repo.markFailed(rowId).catch(() => undefined);
      throw e;
    }
  }
}

function canonicalJson(v: unknown): string {
  if (v === undefined) return 'null'; // trong mảng: JSON coi undefined = null
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  // Key undefined bị BỎ (đúng ngữ nghĩa JSON) — DTO instance có optional
  // key = undefined phải hash GIỐNG object không có key đó
  const keys = Object.keys(v as object)
    .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
    .sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}
