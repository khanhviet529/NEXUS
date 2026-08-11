import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ImportsController } from './imports.controller';
import { ImportsRepository } from './imports.repository';
import { ExportStreamRepository } from '../exports/export-stream.repository';

/** [OPT khuyến nghị giữ] Import §4.7 — transaction theo batch + checkpoint + resume (§12 #23) */

@Module({
  imports: [AuthModule],
  controllers: [ImportsController],
  providers: [ImportsRepository, ExportStreamRepository],
  exports: [ImportsRepository, ExportStreamRepository],
})
export class ImportsModule {}
