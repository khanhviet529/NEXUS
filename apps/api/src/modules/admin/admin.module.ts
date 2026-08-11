import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController, CrossTenantGuard, TenantSelfController } from './admin.controller';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';
import { AnnouncementsController, OpsController } from './ops.controller';
import { OpsRepository } from './ops.repository';

/** [CORE] Truy cập chéo tenant §4.4b — luôn audit CROSS_TENANT_ACCESS (§12 #18) */

@Module({
  imports: [AuthModule],
  controllers: [AdminController, TenantSelfController, OpsController, AnnouncementsController],
  providers: [AdminService, AdminRepository, CrossTenantGuard, OpsRepository],
})
export class AdminModule {}
