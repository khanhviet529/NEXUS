import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryController } from './inventory.controller';
import { InventoryRepository } from './inventory.repository';

/** [CORE nếu có kho] Tồn kho §5B.2/B4 — movement append-only + snapshot (§12 #3/#4) */

@Module({
  imports: [AuthModule],
  controllers: [InventoryController],
  providers: [InventoryRepository],
  exports: [InventoryRepository],
})
export class InventoryModule {}
