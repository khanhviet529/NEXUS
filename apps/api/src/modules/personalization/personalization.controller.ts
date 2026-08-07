import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ALL_ENTITY_TYPES } from '@nexus/shared';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/errors/app.exception';
import { PersonalizationRepository } from './personalization.repository';

class TouchItemDto {
  @ApiProperty({ enum: ALL_ENTITY_TYPES })
  @IsIn(ALL_ENTITY_TYPES)
  entity!: string;

  @ApiProperty()
  @IsUUID()
  entityId!: string;
}

class FavoriteDto extends TouchItemDto {
  @ApiPropertyOptional({ example: 'Đơn VIP tháng 8' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

/**
 * [OPT ưu tiên cao] GĐ10 — vừa xem + yêu thích (§5C.2/§5C.7).
 * "Own" tuyệt đối theo membership — @AllowAuthenticated, không quyền riêng.
 */
@ApiTags('personalization')
@Controller()
export class PersonalizationController {
  constructor(private readonly repo: PersonalizationRepository) {}

  @AllowAuthenticated()
  @Put('recent-items')
  @ApiOperation({ summary: 'Chạm "vừa xem" — trang chi tiết gọi khi mở (§5C.7)' })
  touch(@CurrentUser() user: AuthUser, @Body() dto: TouchItemDto) {
    return this.repo.touchRecent(user.tenantId, user.membershipId, dto.entity, dto.entityId);
  }

  @AllowAuthenticated()
  @Get('recent-items')
  @ApiOperation({ summary: '20 bản ghi vừa xem gần nhất của TÔI' })
  listRecent(@CurrentUser() user: AuthUser) {
    return this.repo.listRecent(user.membershipId);
  }

  @AllowAuthenticated()
  @Put('favorite-items')
  @ApiOperation({ summary: 'Ghim yêu thích (upsert theo entity+entityId)' })
  addFavorite(@CurrentUser() user: AuthUser, @Body() dto: FavoriteDto) {
    return this.repo.addFavorite(
      user.tenantId,
      user.membershipId,
      dto.entity,
      dto.entityId,
      dto.label,
    );
  }

  @AllowAuthenticated()
  @Delete('favorite-items/:entity/:entityId')
  @HttpCode(200)
  async removeFavorite(
    @CurrentUser() user: AuthUser,
    @Param('entity') entity: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ) {
    const count = await this.repo.removeFavorite(user.membershipId, entity, entityId);
    if (count === 0) throw new AppException('COMMON.NOT_FOUND');
    return { ok: true };
  }

  @AllowAuthenticated()
  @Get('favorite-items')
  listFavorites(@CurrentUser() user: AuthUser) {
    return this.repo.listFavorites(user.membershipId);
  }
}
