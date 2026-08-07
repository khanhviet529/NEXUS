import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';

@Module({
  imports: [AuthModule],
  controllers: [ProductsController],
  providers: [ProductsRepository],
})
export class ProductsModule {}
