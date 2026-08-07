import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController, CrossTenantGuard, TenantSelfController } from './admin.controller';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';


@Module({
  imports: [AuthModule],
  controllers: [AdminController, TenantSelfController],
  providers: [AdminService, AdminRepository, CrossTenantGuard],
})
export class AdminModule {}
