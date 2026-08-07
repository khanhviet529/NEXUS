import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { instanceToPlain } from 'class-transformer';
import { map, Observable } from 'rxjs';
import type { RequestContext } from '../../infra/cls/request-context';
import { currentFieldGroups } from '../guards/permission.guard';

/**
 * [CORE] SerializeInterceptor — spec §4.4c, quyết định #2.
 *
 * Áp field-level permission: DTO gắn @Expose({ groups: ['cost'|'hr'|...] }),
 * interceptor mở group theo permission của user (resolveFieldGroups).
 *
 * Đây là nơi áp #1/4 (API response). Ba nơi còn lại — export, report,
 * audit diff — dùng CHUNG currentFieldGroups() để không lệch nhau.
 *
 * Yêu cầu DTO: class có @Expose trên mọi field public
 * (excludeExtraneousValues khiến field không @Expose bị loại).
 */
@Injectable()
export class SerializeInterceptor implements NestInterceptor {
  constructor(
    private readonly cls: ClsService<RequestContext & { permissionSet?: string[] }>,
  ) {}

  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        // Chỉ serialize instance của class DTO; object thuần đi qua nguyên vẹn
        if (data === null || data === undefined) return data;
        if (!isDtoInstance(data)) return data;
        return instanceToPlain(data, {
          groups: currentFieldGroups(this.cls),
          excludeExtraneousValues: true,
        });
      }),
    );
  }
}

function isDtoInstance(data: unknown): boolean {
  if (Array.isArray(data)) return data.length > 0 && isDtoInstance(data[0]);
  return (
    typeof data === 'object' &&
    data !== null &&
    Object.getPrototypeOf(data) !== Object.prototype
  );
}
