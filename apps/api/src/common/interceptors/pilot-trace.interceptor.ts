import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { appendFileSync } from 'node:fs';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import type { AuthUser } from '../decorators/current-user.decorator';

/**
 * PILOT TRACE (sweep C0.0 tầng 2 — "interceptor gắn vào luồng request").
 *
 * Bật bằng `PILOT_TRACE=1` (mặc định TẮT — không chạy ở prod/test thường).
 * Ghi MỖI request một dòng NDJSON vào PILOT_TRACE_FILE (mặc định
 * ./pilot-trace.ndjson): ts, method, url, status, ms, tenantId, userId, err.
 *
 * Dùng để làm gì trong pilot: sau buổi "dùng thật 1–2h", file này trả lời
 * (a) đã đi qua endpoint nào / CHƯA đụng endpoint nào, (b) request nào 4xx/5xx
 * và mã lỗi gì — không dựa vào trí nhớ người bấm.
 *
 * appendFileSync: pilot là MỘT người bấm tay, vài request/giây — đơn giản và
 * không mất dòng khi process chết quan trọng hơn throughput.
 */
@Injectable()
export class PilotTraceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PilotTraceInterceptor.name);
  private readonly file = process.env.PILOT_TRACE_FILE ?? 'pilot-trace.ndjson';

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const res = ctx.switchToHttp().getResponse<Response>();

    const write = (extra: Record<string, unknown>) => {
      try {
        appendFileSync(
          this.file,
          JSON.stringify({
            ts: new Date().toISOString(),
            method: req.method,
            url: req.originalUrl,
            ms: Date.now() - started,
            tenantId: req.user?.tenantId ?? null,
            userId: req.user?.sub ?? null,
            ...extra,
          }) + '\n',
        );
      } catch (e) {
        this.logger.warn(`không ghi được pilot trace: ${String(e)}`);
      }
    };

    return next.handle().pipe(
      tap({
        next: () => write({ status: res.statusCode }),
        error: (err: unknown) => {
          const e = err as { status?: number; code?: string; message?: string };
          write({
            status: e.status ?? 500,
            errCode: e.code ?? null,
            errMessage: e.message?.slice(0, 200) ?? String(err).slice(0, 200),
          });
        },
      }),
    );
  }
}
