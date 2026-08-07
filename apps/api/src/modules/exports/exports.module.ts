import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExportStreamRepository } from './export-stream.repository';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

/** [CORE] Export qua queue (§4.7, GĐ7f) — worker gọi ExportsService */
@Module({
  imports: [AuthModule, FilesModule, NotificationsModule],
  controllers: [ExportsController],
  providers: [ExportStreamRepository, ExportsService],
  exports: [ExportsService],
})
export class ExportsModule {}
