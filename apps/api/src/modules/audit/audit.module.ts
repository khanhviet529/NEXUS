import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditRepository } from './audit.repository';
import { AuditQueryRepository } from './audit-query.repository';
import { AuditController } from './audit.controller';

/** [CORE] Audit log §4.9 — append-only, không cho sửa/xoá (§12 #14) */

@Global()
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [AuditRepository, AuditQueryRepository],
  exports: [AuditRepository],
})
export class AuditModule {}
