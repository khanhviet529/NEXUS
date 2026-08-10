import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApprovalAuthoritiesModule } from '../approval-authorities/approval-authorities.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';

/** [REF] Module mẫu chuẩn — TỒN TẠI ĐỂ LÀM KHUÔN. Copy rồi xoá (§11 bước 3) */

@Module({
  imports: [AuthModule, ApprovalAuthoritiesModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
  exports: [OrdersRepository],
})
export class OrdersModule {}
