import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { v7 as uuidv7 } from 'uuid';
import { AUDIT_ACTIONS, ALL_ENTITY_TYPES } from '@nexus/shared';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/errors/app.exception';
import { AuditRepository } from '../audit/audit.repository';
import { S3Service } from '../../infra/s3/s3.service';
import { FilesRepository } from './files.repository';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB — cột size là int4 (schema ghi chú)

class PresignDto {
  @ApiProperty({ example: 'bao-gia.pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename!: string;

  @ApiProperty({ example: 'application/pdf' })
  @Matches(/^[\w.+-]+\/[\w.+-]+$/)
  mime!: string;
}

class ConfirmDto extends PresignDto {
  @ApiProperty({ description: 'fileId nhận từ presign' })
  @IsUUID()
  fileId!: string;

  @ApiPropertyOptional({ enum: ALL_ENTITY_TYPES, description: 'Đính ngay vào bản ghi' })
  @IsOptional()
  @IsIn(ALL_ENTITY_TYPES)
  entity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ example: 'contract' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;
}

/**
 * [CORE] GĐ7 — file qua presigned URL, KHÔNG đẩy byte qua API server (§2).
 * Luồng: presign (chưa ghi DB) → client PUT thẳng MinIO/S3 → confirm
 * (HeadObject xác minh rồi mới ghi row). GET kế thừa quyền entity gốc (§2.5).
 */
@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(
    private readonly repo: FilesRepository,
    private readonly s3: S3Service,
    private readonly audit: AuditRepository,
  ) {}

  @Post('presign')
  @RequirePermission('file:upload')
  @ApiOperation({ summary: 'Xin presigned PUT — objectKey server dựng, tiền tố <tenantId>/' })
  async presign(@CurrentUser() user: AuthUser, @Body() dto: PresignDto) {
    const fileId = uuidv7();
    const objectKey = this.s3.buildObjectKey(user.tenantId, fileId, dto.filename);
    const uploadUrl = await this.s3.presignPut(objectKey, dto.mime);
    return { fileId, objectKey, uploadUrl, expiresInSeconds: 600 };
  }

  @Post('confirm')
  @RequirePermission('file:upload')
  @ApiOperation({ summary: 'Xác nhận đã PUT xong — HeadObject xác minh rồi mới ghi row files' })
  async confirm(@CurrentUser() user: AuthUser, @Body() dto: ConfirmDto) {
    if ((dto.entity && !dto.entityId) || (!dto.entity && dto.entityId)) {
      throw new AppException('COMMON.VALIDATION_FAILED', {
        details: { entity: ['entity và entityId phải đi cùng nhau'] },
      });
    }
    const objectKey = this.s3.buildObjectKey(user.tenantId, dto.fileId, dto.filename);
    const head = await this.s3.head(objectKey);
    if (!head) {
      throw new AppException('COMMON.VALIDATION_FAILED', {
        details: { fileId: ['Chưa thấy object trên S3 — client chưa PUT xong?'] },
      });
    }
    if (head.size > MAX_FILE_SIZE) {
      await this.s3.deleteObject(objectKey); // quá cỡ: dọn luôn, không giữ rác
      throw new AppException('COMMON.VALIDATION_FAILED', {
        details: { size: [`Tối đa ${MAX_FILE_SIZE} byte`] },
      });
    }
    // Đính vào entity → phải ĐỌC được entity đó (kế thừa quyền, fail-closed)
    if (dto.entity && dto.entityId) {
      const ok = await this.repo.canReadEntity(user, dto.entity, dto.entityId);
      if (!ok) throw new AppException('AUTH.FORBIDDEN');
    }

    const file = await this.repo.createFile({
      id: dto.fileId,
      tenantId: user.tenantId,
      bucket: this.s3.bucket,
      objectKey,
      filename: dto.filename,
      mime: dto.mime,
      size: head.size,
      checksum: head.etag,
      uploadedById: user.sub,
    });
    if (dto.entity && dto.entityId) {
      await this.repo.attach({
        tenantId: user.tenantId,
        fileId: file.id,
        entity: dto.entity,
        entityId: dto.entityId,
        category: dto.category,
      });
    }
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'File',
      entityId: file.id,
      action: AUDIT_ACTIONS.CREATE,
      after: { filename: dto.filename, size: head.size, entity: dto.entity ?? null },
    });
    return { id: file.id, filename: file.filename, size: file.size, mime: file.mime };
  }

  @AllowAuthenticated()
  @Get('by-entity/:entity/:entityId')
  @ApiOperation({ summary: 'Tệp đính kèm của một bản ghi — kiểm quyền entity gốc' })
  async listByEntity(
    @CurrentUser() user: AuthUser,
    @Param('entity') entity: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ) {
    const ok = await this.repo.canReadEntity(user, entity, entityId);
    if (!ok) throw new AppException('AUTH.FORBIDDEN');
    const rows = await this.repo.listByEntity(entity, entityId);
    return rows.map((a) => ({
      attachmentId: a.id,
      fileId: a.fileId,
      filename: a.file.filename,
      mime: a.file.mime,
      size: a.file.size,
      category: a.category,
      createdAt: a.createdAt,
    }));
  }

  @AllowAuthenticated()
  @Get(':id')
  @ApiOperation({
    summary: 'Presigned GET — quyền KẾ THỪA entity đính kèm; file trôi nổi: chỉ người upload',
  })
  async download(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const file = await this.repo.findFile(id);
    if (!file || file.deletedAt) throw new AppException('COMMON.NOT_FOUND');

    let allowed = false;
    if (file.attachments.length === 0) {
      allowed = file.uploadedById === user.sub; // file trôi nổi — chỉ uploader
    } else {
      for (const a of file.attachments) {
        if (await this.repo.canReadEntity(user, a.entity, a.entityId)) {
          allowed = true;
          break; // xem được MỘT entity đính là đủ
        }
      }
    }
    if (!allowed) throw new AppException('AUTH.FORBIDDEN');

    const url = await this.s3.presignGet(file.objectKey, file.filename);
    return { url, filename: file.filename, mime: file.mime, size: file.size };
  }
}
