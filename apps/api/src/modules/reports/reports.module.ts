import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KyselyService } from '../../infra/kysely/kysely.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** [CORE] Report framework §5B.1/A1 — registry là CORE; các ReportDef mẫu bên trong là REF */

@Module({
  imports: [AuthModule],
  controllers: [ReportsController],
  providers: [ReportsService, KyselyService],
})
export class ReportsModule {}
