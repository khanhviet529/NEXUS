import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyRepository } from './idempotency.repository';

@Global()
@Module({
  providers: [IdempotencyService, IdempotencyRepository],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
