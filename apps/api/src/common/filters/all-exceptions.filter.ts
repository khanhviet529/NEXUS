import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { nextActionOf, type ApiErrorBody } from '@nexus/shared';
import type { RequestContext } from '../../infra/cls/request-context';
import { AppException } from '../errors/app.exception';

/**
 * [CORE] Map mọi exception → hình dạng lỗi §3.6.
 * 500 KHÔNG lộ chi tiết — chỉ trả traceId để tra log.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly cls: ClsService<RequestContext>) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const traceId = (this.cls.isActive() && this.cls.get('traceId')) || 'no-trace';
    const timestamp = new Date().toISOString();

    let body: ApiErrorBody;
    let status: number;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      body = {
        code: exception.code,
        message: exception.message,
        details: exception.details,
        // §3.6: BE nói "còn cách nào đi tiếp" bằng MÃ; FE quyết nhãn + route
        nextAction: nextActionOf(exception.code),
        traceId,
        timestamp,
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      // ValidationPipe (422) trả details dạng map field → string[] (§3.6)
      const details =
        typeof resp === 'object' && resp !== null && 'details' in resp
          ? ((resp as { details: Record<string, string[]> }).details ?? null)
          : null;
      const mappedCode = statusToCode(status);
      body = {
        code: mappedCode,
        message: exception.message,
        details,
        nextAction: nextActionOf(mappedCode),
        traceId,
        timestamp,
      };
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      this.logger.error(
        { traceId, err: exception instanceof Error ? exception.stack : String(exception) },
        'Unhandled exception',
      );
      body = {
        code: 'COMMON.INTERNAL_ERROR',
        message: 'Lỗi hệ thống',
        details: null,
        traceId,
        timestamp,
      };
    }

    res.status(status).json(body);
  }
}

function statusToCode(status: number): string {
  switch (status) {
    case 400:
      return 'COMMON.BAD_REQUEST';
    case 401:
      return 'AUTH.UNAUTHENTICATED';
    case 403:
      return 'AUTH.FORBIDDEN';
    case 404:
      return 'COMMON.NOT_FOUND';
    case 409:
      return 'COMMON.VERSION_CONFLICT';
    case 422:
      return 'COMMON.VALIDATION_FAILED';
    case 429:
      return 'COMMON.RATE_LIMITED';
    default:
      return 'COMMON.INTERNAL_ERROR';
  }
}
