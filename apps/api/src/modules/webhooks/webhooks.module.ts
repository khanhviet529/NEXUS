import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksRepository } from './webhooks.repository';

/** [OPT ưu tiên cao] Webhook §5C.5 — phát QUA OUTBOX (OutboxModule import module này) */
@Module({
  controllers: [WebhooksController],
  providers: [WebhooksRepository],
  exports: [WebhooksRepository],
})
export class WebhooksModule {}
