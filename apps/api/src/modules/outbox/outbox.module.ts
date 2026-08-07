import { Global, Module } from '@nestjs/common';
import { OutboxRepository } from './outbox.repository';
import { OutboxWorkerService } from './outbox-worker.service';
import { OrderApprovedHandler } from './handlers/order-approved.handler';

@Global()
@Module({
  providers: [OutboxRepository, OutboxWorkerService, OrderApprovedHandler],
  exports: [OutboxRepository, OutboxWorkerService],
})
export class OutboxModule {}
