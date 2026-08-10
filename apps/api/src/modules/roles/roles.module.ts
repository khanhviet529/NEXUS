import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { RolesRepository } from './roles.repository';

/** [CORE] Vai trò §4.4 — vai trò là DỮ LIỆU, không phải mã; nền của `can()` (§12 #2) */

@Module({
  imports: [AuthModule],
  controllers: [RolesController],
  providers: [RolesService, RolesRepository],
})
export class RolesModule {}
