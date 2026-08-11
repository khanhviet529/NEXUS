import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyRepository } from './idempotency.repository';

/** [CORE] Idempotency ba lớp §3.9 — Redis + bảng DB + unique business key (§12 #20) */

@Global()
@Module({
  providers: [IdempotencyService, IdempotencyRepository],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
