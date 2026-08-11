import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PersonalizationController } from './personalization.controller';
import { PersonalizationRepository } from './personalization.repository';
import { ItemRefRepository } from './item-ref.repository';

/** [OPT ưu tiên cao] Recent/favorites §5C.2/§5C.7 — GĐ10; V13 thêm resolver nhãn */
@Module({
  imports: [AuthModule],
  controllers: [PersonalizationController],
  providers: [PersonalizationRepository, ItemRefRepository],
})
export class PersonalizationModule {}
