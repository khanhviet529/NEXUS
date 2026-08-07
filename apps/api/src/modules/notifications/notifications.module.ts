import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';

/** [OPT] Notifications (§11 bảng cắt gọt) — phía đọc; ghi ở outbox consumer */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsRepository],
  exports: [NotificationsRepository],
})
export class NotificationsModule {}
