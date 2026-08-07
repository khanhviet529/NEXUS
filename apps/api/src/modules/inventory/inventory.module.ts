import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryController } from './inventory.controller';
import { InventoryRepository } from './inventory.repository';

@Module({
  imports: [AuthModule],
  controllers: [InventoryController],
  providers: [InventoryRepository],
  exports: [InventoryRepository],
})
export class InventoryModule {}
