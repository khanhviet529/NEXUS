import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgUnitsController } from './org-units.controller';
import { OrgUnitsService } from './org-units.service';
import { OrgUnitsRepository } from './org-units.repository';

@Module({
  imports: [AuthModule],
  controllers: [OrgUnitsController],
  providers: [OrgUnitsService, OrgUnitsRepository],
})
export class OrgUnitsModule {}
