import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SavedViewsController, PreferencesController } from './saved-views.controller';
import { SavedViewsRepository } from './saved-views.repository';

/** [OPT] Saved views §5.5 — spec gọi thẳng là "Tuỳ chọn" của DataTable; lưu bộ lọc + cấu hình cột */

@Module({
  imports: [AuthModule],
  controllers: [SavedViewsController, PreferencesController],
  providers: [SavedViewsRepository],
})
export class SavedViewsModule {}
