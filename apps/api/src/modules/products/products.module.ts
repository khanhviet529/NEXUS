import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';

/** [REF] Danh mục mẫu — khuôn cho generator GĐ9, xoá sau khi đã copy */

@Module({
  imports: [AuthModule],
  controllers: [ProductsController],
  providers: [ProductsRepository],
})
export class ProductsModule {}
