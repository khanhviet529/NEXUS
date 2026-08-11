import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ALL_ENTITY_TYPES } from '@nexus/shared';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/errors/app.exception';
import { RequestContextService } from '../../infra/cls/request-context';
import { SUPPORTED_LOCALES, type Locale } from '../../common/query/localized';
import { PersonalizationRepository } from './personalization.repository';
import { ItemRefRepository } from './item-ref.repository';

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

/** Một mục "vừa xem"/"đã ghim" ĐÃ resolve nhãn — nguồn cho Cmd+K (V13, §5C.7) */
export class PersonalItemDto {
  @ApiProperty() @Expose() entity!: string;
  @ApiProperty() @Expose() entityId!: string;
  @ApiProperty({ description: 'Mã định danh người đọc được (code/email)' })
  @Expose()
  code!: string;

  @ApiProperty({ description: 'Nhãn hiển thị — favorites ưu tiên label tự đặt' })
  @Expose()
  label!: string;

  @ApiProperty({ example: '/orders/uuid' }) @Expose() href!: string;
}

export class OkDto {
  @ApiProperty() @Expose() ok!: boolean;
}

/**
 * [OPT ưu tiên cao] GĐ10 — vừa xem + yêu thích (§5C.2/§5C.7).
 * "Own" tuyệt đối theo membership — @AllowAuthenticated, không quyền riêng.
 *
 * V13: GET trả nhãn ĐÃ resolve qua ItemRefRepository — bản ghi đã xoá
 * hoặc user HẾT quyền xem thì loại khỏi danh sách (không lộ nhãn bản ghi cấm).
 */
@ApiTags('personalization')
@Controller()
export class PersonalizationController {
  constructor(
    private readonly repo: PersonalizationRepository,
    private readonly resolver: ItemRefRepository,
    private readonly ctx: RequestContextService,
  ) {}

  /** Locale request (CLS §3.1c) — kẹp về union hỗ trợ, lạ thì rơi về vi */
  private get locale(): Locale {
    const raw = this.ctx.locale;
    return (SUPPORTED_LOCALES as readonly string[]).includes(raw) ? (raw as Locale) : 'vi';
  }

  @AllowAuthenticated()
  @Put('recent-items')
  @ApiOperation({ summary: 'Chạm "vừa xem" — trang chi tiết gọi khi mở (§5C.7)' })
  @ApiOkResponse({ type: OkDto })
  async touch(@CurrentUser() user: AuthUser, @Body() dto: TouchItemDto): Promise<OkDto> {
    await this.repo.touchRecent(user.tenantId, user.membershipId, dto.entity, dto.entityId);
    return { ok: true };
  }

  @AllowAuthenticated()
  @Get('recent-items')
  @ApiOperation({ summary: '20 bản ghi vừa xem gần nhất của TÔI — nhãn đã resolve' })
  @ApiOkResponse({ type: [PersonalItemDto] })
  async listRecent(@CurrentUser() user: AuthUser): Promise<PersonalItemDto[]> {
    const rows = await this.repo.listRecent(user.membershipId);
    const resolved = await this.resolver.resolve(user, this.locale, rows);
    return rows.flatMap((r) => {
      const ref = resolved.get(`${r.entity}:${r.entityId}`);
      return ref ? [{ entity: r.entity, entityId: r.entityId, ...ref }] : [];
    });
  }

  @AllowAuthenticated()
  @Put('favorite-items')
  @ApiOperation({ summary: 'Ghim yêu thích (upsert theo entity+entityId)' })
  @ApiOkResponse({ type: OkDto })
  async addFavorite(@CurrentUser() user: AuthUser, @Body() dto: FavoriteDto): Promise<OkDto> {
    await this.repo.addFavorite(user.tenantId, user.membershipId, dto.entity, dto.entityId, dto.label);
    return { ok: true };
  }

  @AllowAuthenticated()
  @Delete('favorite-items/:entity/:entityId')
  @HttpCode(200)
  @ApiOkResponse({ type: OkDto })
  async removeFavorite(
    @CurrentUser() user: AuthUser,
    @Param('entity') entity: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ): Promise<OkDto> {
    const count = await this.repo.removeFavorite(user.membershipId, entity, entityId);
    if (count === 0) throw new AppException('COMMON.NOT_FOUND');
    return { ok: true };
  }

  @AllowAuthenticated()
  @Get('favorite-items')
  @ApiOperation({ summary: 'Danh sách đã ghim — label tự đặt thắng nhãn resolve' })
  @ApiOkResponse({ type: [PersonalItemDto] })
  async listFavorites(@CurrentUser() user: AuthUser): Promise<PersonalItemDto[]> {
    const rows = await this.repo.listFavorites(user.membershipId);
    const resolved = await this.resolver.resolve(user, this.locale, rows);
    return rows.flatMap((r) => {
      const ref = resolved.get(`${r.entity}:${r.entityId}`);
      return ref
        ? [{ entity: r.entity, entityId: r.entityId, ...ref, label: r.label ?? ref.label }]
        : [];
    });
  }
}
