import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SearchController } from './search.controller';
import { SearchRepository } from './search.repository';

/** [OPT ưu tiên cao] Global search §5C.7 — GĐ8 */
@Module({
  imports: [AuthModule],
  controllers: [SearchController],
  providers: [SearchRepository],
})
export class SearchModule {}
