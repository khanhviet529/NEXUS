import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { JOB_NAMES, type JobName, type TenantJobPayload } from '@nexus/shared';

/**
 * [CORE] BullMQ producer — spec §4.8.
 * - Mỗi loại job một queue riêng, tên + retry policy lấy từ JOB_NAMES registry
 * - Payload job gắn tenant BẮT BUỘC chứa tenantId (worker set CLS trước khi xử lý)
 * - Retry 3 lần backoff luỹ thừa; thất bại → giữ trong failed (dead-letter, §5C.8)
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queues = new Map<string, Queue>();

  constructor(config: ConfigService) {
    // BullMQ yêu cầu maxRetriesPerRequest: null — connection riêng, không dùng chung RedisService
    this.connection = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }

  queue(name: JobName): Queue {
    const def = JOB_NAMES[name];
    let q = this.queues.get(def.queue);
    if (!q) {
      q = new Queue(def.queue, {
        connection: this.connection,
        defaultJobOptions: {
          attempts: def.attempts,
          backoff: { type: 'exponential', delay: def.backoffMs },
          removeOnComplete: 1000,
          removeOnFail: false, // giữ để màn vận hành retry (§5C.8)
        },
      });
      this.queues.set(def.queue, q);
    }
    return q;
  }

  /** Enqueue tiện dụng — data phải nghiêm túc về tenantId nếu là job tenant-scoped */
  async add<T extends object>(
    name: JobName,
    data: T | (T & TenantJobPayload),
  ): Promise<void> {
    await this.queue(name).add(name, data);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    if (this.connection.status === 'wait' || this.connection.status === 'end') {
      this.connection.disconnect();
    } else {
      await this.connection.quit();
    }
  }
}
