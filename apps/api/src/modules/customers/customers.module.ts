import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomersController } from './customers.controller';
import { CustomersRepository } from './customers.repository';

/** [REF] Danh mục mẫu GĐ5 — copy làm khuôn rồi xoá, như orders */

@Module({
  imports: [AuthModule],
  controllers: [CustomersController],
  providers: [CustomersRepository],
})
export class CustomersModule {}
