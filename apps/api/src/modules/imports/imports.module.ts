import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ImportsController } from './imports.controller';
import { ImportsRepository } from './imports.repository';
import { ExportStreamRepository } from '../exports/export-stream.repository';

@Module({
  imports: [AuthModule],
  controllers: [ImportsController],
  providers: [ImportsRepository, ExportStreamRepository],
  exports: [ImportsRepository, ExportStreamRepository],
})
export class ImportsModule {}
