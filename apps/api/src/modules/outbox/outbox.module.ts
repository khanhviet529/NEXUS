import { Global, Module } from '@nestjs/common';
import { OutboxRepository } from './outbox.repository';
import { OutboxWorkerService } from './outbox-worker.service';
import { OrderApprovedHandler } from './handlers/order-approved.handler';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Global()
@Module({
  imports: [WebhooksModule], // GĐ10 §5C.5 — webhook phát qua outbox
  providers: [OutboxRepository, OutboxWorkerService, OrderApprovedHandler],
  exports: [OutboxRepository, OutboxWorkerService],
})
export class OutboxModule {}
