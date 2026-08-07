import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * [CORE] Redis — cache / session / queue (spec §2.3).
 * Quy ước key: MỌI key gắn tenant phải mang tiền tố t:<tenantId>: (§4.4b).
 * Cache permission: perm:<tenantId>:<userId> (§4.3) — dùng tenantKey() bên dưới.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  /** Key theo tenant — perm:, cache: … KHÔNG bao giờ tự nối chuỗi ở nơi khác */
  tenantKey(prefix: string, tenantId: string, ...parts: string[]): string {
    return [prefix, tenantId, ...parts].join(':');
  }

  async onModuleDestroy(): Promise<void> {
    // quit() trên client lazy chưa connect sẽ cố connect rồi retry mãi → treo
    if (this.client.status === 'wait' || this.client.status === 'end') {
      this.client.disconnect();
      return;
    }
    await this.client.quit();
  }
}
