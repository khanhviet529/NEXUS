import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SavedViewsController, PreferencesController } from './saved-views.controller';
import { SavedViewsRepository } from './saved-views.repository';

@Module({
  imports: [AuthModule],
  controllers: [SavedViewsController, PreferencesController],
  providers: [SavedViewsRepository],
})
export class SavedViewsModule {}
