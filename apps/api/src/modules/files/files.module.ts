import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesController } from './files.controller';
import { FilesRepository } from './files.repository';

/** [CORE] Files qua presigned S3 (§2, matrix §2.5) — GĐ7 */
@Module({
  imports: [AuthModule],
  controllers: [FilesController],
  providers: [FilesRepository],
  exports: [FilesRepository],
})
export class FilesModule {}
