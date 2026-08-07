import { Module } from '@nestjs/common';
import { ApprovalAuthoritiesController } from './approval-authorities.controller';
import { ApprovalAuthoritiesRepository } from './approval-authorities.repository';

/** [OPT] Hạn mức duyệt §5C.12 — GĐ10. OrdersModule import để fail-closed approve */
@Module({
  controllers: [ApprovalAuthoritiesController],
  providers: [ApprovalAuthoritiesRepository],
  exports: [ApprovalAuthoritiesRepository],
})
export class ApprovalAuthoritiesModule {}
