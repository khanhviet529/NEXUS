import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgUnitsController } from './org-units.controller';
import { OrgUnitsService } from './org-units.service';
import { OrgUnitsRepository } from './org-units.repository';

/** [CORE] Cây đơn vị §4.4 — `ltree`, nền của scope department/descendants (§12 #10) */

@Module({
  imports: [AuthModule],
  controllers: [OrgUnitsController],
  providers: [OrgUnitsService, OrgUnitsRepository],
})
export class OrgUnitsModule {}
