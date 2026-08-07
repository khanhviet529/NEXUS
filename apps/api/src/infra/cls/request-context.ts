import { ClsService, ClsStore } from 'nestjs-cls';
import { Injectable } from '@nestjs/common';

/**
 * [CORE] Request context trên CLS — spec §3.1c, §4.2.
 * Middleware/guard set MỘT LẦN; service không tự đọc header.
 */
export interface RequestContext extends ClsStore {
  traceId: string;
  /** Nguồn DUY NHẤT: access token (§3.1b). Undefined = chưa xác thực */
  tenantId?: string;
  userId?: string;
  membershipId?: string;
  sessionId?: string;
  orgUnitId?: string;
  /** uuid người thật, hoặc 'system:<jobName>' / 'migration:<version>' (§4.9) */
  actorId?: string;
  /** Impersonation: người thật ở actorId, người bị mạo danh ở đây */
  onBehalfOfId?: string;
  locale: string;
  timezone: string;
  /**
   * Bypass tenancy — CHỈ cho: bootstrap sync permission, seed, và endpoint
   * /admin/* đã qua guard system:cross_tenant + audit CROSS_TENANT_ACCESS.
   * Mặc định fail-closed: TENANT model mà không có tenantId → ném lỗi.
   */
  tenancyBypass?: boolean;
}

@Injectable()
export class RequestContextService {
  constructor(private readonly cls: ClsService<RequestContext>) {}

  get traceId(): string {
    return this.cls.get('traceId') ?? 'no-trace';
  }

  get tenantId(): string | undefined {
    return this.cls.get('tenantId');
  }

  get userId(): string | undefined {
    return this.cls.get('userId');
  }

  get membershipId(): string | undefined {
    return this.cls.get('membershipId');
  }

  get actorId(): string | undefined {
    return this.cls.get('actorId');
  }

  get locale(): string {
    return this.cls.get('locale') ?? 'vi';
  }

  get timezone(): string {
    return this.cls.get('timezone') ?? 'Asia/Ho_Chi_Minh';
  }

  get tenancyBypass(): boolean {
    return this.cls.get('tenancyBypass') === true;
  }

  set<K extends keyof RequestContext>(key: K, value: RequestContext[K]): void {
    this.cls.set(key, value);
  }

  /**
   * Chạy một đoạn code trong context riêng — worker/seed dùng (§4.8).
   *
   * LUÔN await BÊN TRONG cls.run: PrismaPromise thực thi lazy lúc .then(),
   * nếu await ở ngoài thì query chạy khi AsyncLocalStorage đã đóng →
   * extension không thấy tenantId → fail-closed oan (bug có thật, test GĐ1 bắt được).
   */
  runWith<T>(ctx: Partial<RequestContext>, fn: () => T | Promise<T>): Promise<T> {
    return this.cls.run(async () => {
      for (const [k, v] of Object.entries(ctx)) {
        this.cls.set(k as keyof RequestContext, v as never);
      }
      return await fn();
    });
  }
}
