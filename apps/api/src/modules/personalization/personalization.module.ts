import { Module } from '@nestjs/common';
import { PersonalizationController } from './personalization.controller';
import { PersonalizationRepository } from './personalization.repository';

/** [OPT ưu tiên cao] Recent/favorites §5C.2/§5C.7 — GĐ10 */
@Module({
  controllers: [PersonalizationController],
  providers: [PersonalizationRepository],
})
export class PersonalizationModule {}
