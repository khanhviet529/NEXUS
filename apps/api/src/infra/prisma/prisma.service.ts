import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  assertExhaustiveSoftDeletePolicy,
  assertExhaustiveTenancyPolicy,
} from '@nexus/shared';
import { ClsService } from 'nestjs-cls';
import type { RequestContext } from '../cls/request-context';
import { createTenancyExtension } from './tenancy.extension';
import { createSoftDeleteExtension } from './soft-delete.extension';
import { ALL_MODELS, MODELS_WITH_DELETED_AT } from './model-registry.gen';

/**
 * [CORE] PrismaService — spec §4.4b, §4.5, §4.9.
 *
 * - Kiểm tra VÉT CẠN lúc khởi động: model chưa phân loại tenancy / soft-delete
 *   → app KHÔNG khởi động được (test #3c).
 * - `client` là Prisma client ĐÃ MẮC extension (tenancy → soft-delete).
 *   Repository CHỈ dùng `client`, không đụng base client.
 * - File này là nơi DUY NHẤT khởi tạo PrismaClient (ESLint chặn nơi khác).
 */

function buildExtendedClient(base: PrismaClient, cls: ClsService<RequestContext>) {
  // THỨ TỰ QUAN TRỌNG: extension thêm TRƯỚC chạy TRƯỚC trên đường vào query.
  // Soft-delete phải xử lý `where` THÔ (đọc/gỡ sentinel deletedAt ở top-level)
  // trước khi tenancy bọc nó vào AND — đảo lại là sentinel bị đè (test #3d bắt được).
  return base
    .$extends(createSoftDeleteExtension())
    .$extends(
      createTenancyExtension(() => ({
        tenantId: cls.isActive() ? cls.get('tenantId') : undefined,
        bypass: cls.isActive() ? cls.get('tenancyBypass') === true : false,
      })),
    );
}

export type ExtendedPrismaClient = ReturnType<typeof buildExtendedClient>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly base: PrismaClient;
  readonly client: ExtendedPrismaClient;

  constructor(cls: ClsService<RequestContext>) {
    // Vét cạn TRƯỚC khi client nhận query nào — spec §4.4b:
    // "biến sai sót thành bất khả thi"
    assertExhaustiveTenancyPolicy(ALL_MODELS);
    assertExhaustiveSoftDeletePolicy(MODELS_WITH_DELETED_AT);

    this.base = new PrismaClient({
      log: [{ emit: 'event', level: 'query' }],
    });
    // Đếm query cho test #12 (expectQueryCount) + cảnh báo N+1 dev mode (§4.6)
    (this.base as unknown as { $on(e: 'query', cb: () => void): void }).$on('query', () => {
      for (const l of this.queryListeners) l();
    });
    this.client = buildExtendedClient(this.base, cls);
  }

  /** Test #12 + log cảnh báo N+1 đăng ký ở đây */
  readonly queryListeners = new Set<() => void>();

  async onModuleInit(): Promise<void> {
    if (process.env.GEN_OPENAPI === '1') return; // codegen không cần DB
    await this.base.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }

  /**
   * Base client KHÔNG extension — chỉ cho: sync permission lúc boot, seed,
   * và test #3b (chứng minh DB tự chặn khi bypass tầng ứng dụng).
   * Mọi chỗ khác dùng `client`.
   */
  get unsafeBaseClient(): PrismaClient {
    return this.base;
  }
}
