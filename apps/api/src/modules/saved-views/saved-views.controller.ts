import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/errors/app.exception';
import { SavedViewsRepository } from './saved-views.repository';

class CreateViewDto {
  @ApiProperty({ example: 'User' })
  @IsString()
  entity!: string;

  @ApiProperty({ example: 'Nhân sự phòng KD' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ type: Object, description: 'filters, sort, columns, density, pageSize (§5C.2)' })
  @IsObject()
  config!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Chia sẻ trong đơn vị' })
  @IsOptional()
  @IsBoolean()
  isShared?: boolean;
}

class UpdateViewDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isShared?: boolean;
}

/** Saved views — nhóm "chỉ cần đăng nhập": dữ liệu tiện ích của chính user (§5C.2) */
@ApiTags('saved-views')
@Controller('saved-views')
export class SavedViewsController {
  constructor(private readonly repo: SavedViewsRepository) {}

  @AllowAuthenticated()
  @Get()
  @ApiOperation({ summary: 'View của tôi + view được chia sẻ, lọc theo entity' })
  list(@CurrentUser() user: AuthUser, @Query('entity') entity?: string) {
    return this.repo.listViews(user.membershipId, entity);
  }

  @AllowAuthenticated()
  @Post()
  @HttpCode(201)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateViewDto) {
    return this.repo.createView({
      tenantId: user.tenantId,
      membershipId: user.membershipId,
      ...dto,
    });
  }

  @AllowAuthenticated()
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateViewDto,
  ) {
    const view = await this.repo.findView(id);
    // Chỉ chủ sở hữu sửa được — view chia sẻ là read-only với người khác
    if (!view || view.membershipId !== user.membershipId) {
      throw new AppException('COMMON.NOT_FOUND');
    }
    return this.repo.updateView(id, dto);
  }

  @AllowAuthenticated()
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const view = await this.repo.findView(id);
    if (!view || view.membershipId !== user.membershipId) {
      throw new AppException('COMMON.NOT_FOUND');
    }
    await this.repo.deleteView(id); // xoá cứng (§6.2)
  }
}

/** PATCH /me/preferences — ma trận §2.1: chỉ sửa của chính mình */
@ApiTags('auth')
@Controller('me/preferences')
export class PreferencesController {
  constructor(private readonly repo: SavedViewsRepository) {}

  @AllowAuthenticated()
  @Get()
  async get(@CurrentUser() user: AuthUser) {
    const rows = await this.repo.getPreferences(user.membershipId);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  @AllowAuthenticated()
  @Patch()
  @ApiOperation({ summary: 'Upsert từng key: locale, timezone, density, pageSize, theme (§5C.2)' })
  async patch(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const ALLOWED_KEYS = ['locale', 'timezone', 'density', 'pageSize', 'theme', 'defaultOrgUnit'];
    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_KEYS.includes(key)) {
        throw new AppException('COMMON.VALIDATION_FAILED', {
          details: { [key]: ['Key preference không hợp lệ'] },
        });
      }
      await this.repo.upsertPreference(user.tenantId, user.membershipId, key, value);
    }
    const rows = await this.repo.getPreferences(user.membershipId);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}
