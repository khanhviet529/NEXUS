import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES } from '@nexus/shared';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/errors/app.exception';
import { buildMeta, PaginationMetaDto } from '../../common/dto/paginated.dto';
import { NotificationsRepository } from './notifications.repository';

/** Một thông báo — nguồn cho dropdown chuông (V13). `data.entity/entityId` để FE dựng link */
export class NotificationDto {
  @ApiProperty() @Expose() id!: string;
  @ApiProperty() @Expose() type!: string;
  @ApiProperty() @Expose() title!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @Expose() body!: string | null;
  @ApiPropertyOptional({ nullable: true, type: Object }) @Expose() data!: Record<
    string,
    unknown
  > | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @Expose() readAt!: Date | null;
  @ApiProperty() @Expose() createdAt!: Date;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: [NotificationDto] })
  @Expose()
  @Type(() => NotificationDto)
  data!: NotificationDto[];

  @ApiProperty({ type: PaginationMetaDto })
  @Expose()
  @Type(() => PaginationMetaDto)
  meta!: PaginationMetaDto;
}

export class UnreadCountDto {
  @ApiProperty() @Expose() count!: number;
}

export class MarkReadResultDto {
  @ApiProperty() @Expose() ok!: boolean;
}

export class MarkAllReadResultDto {
  @ApiProperty({ description: 'Số thông báo vừa chuyển sang đã đọc' })
  @Expose()
  updated!: number;
}

class ListNotificationsDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  // Boolean('false') === true — phải so chuỗi tường minh
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

class UpsertPreferenceDto {
  @ApiProperty({ enum: Object.keys(NOTIFICATION_TYPES) })
  @IsIn(Object.keys(NOTIFICATION_TYPES))
  type!: string;

  @ApiProperty({ isArray: true, enum: NOTIFICATION_CHANNELS })
  @IsArray()
  @ArrayUnique()
  @IsIn(NOTIFICATION_CHANNELS, { each: true })
  channels!: string[];
}

/**
 * [CORE nhẹ] GĐ7 — thông báo trong app. LUÔN "own" theo membership trong token
 * (@AllowAuthenticated — không có quyền notification riêng trong matrix).
 */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly repo: NotificationsRepository) {}

  @AllowAuthenticated()
  @Get()
  @ApiOperation({ summary: 'Thông báo của TÔI — phân trang, lọc chưa đọc' })
  @ApiOkResponse({ type: NotificationListResponseDto })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() q: ListNotificationsDto,
  ): Promise<NotificationListResponseDto> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const { rows, total } = await this.repo.list(user.membershipId, {
      unreadOnly: q.unreadOnly,
      page,
      limit,
    });
    // Chọn field tường minh — KHÔNG trả thẳng row Prisma (tenantId/membershipId thừa)
    return {
      data: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        data: r.data as Record<string, unknown> | null,
        readAt: r.readAt,
        createdAt: r.createdAt,
      })),
      meta: buildMeta(page, limit, total),
    };
  }

  @AllowAuthenticated()
  @Get('unread-count')
  @ApiOperation({ summary: 'Số chưa đọc — badge chuông header' })
  @ApiOkResponse({ type: UnreadCountDto })
  async unreadCount(@CurrentUser() user: AuthUser): Promise<UnreadCountDto> {
    return { count: await this.repo.unreadCount(user.membershipId) };
  }

  @AllowAuthenticated()
  @Post(':id/read')
  @ApiOperation({ summary: 'Đánh dấu đã đọc — chỉ thông báo CỦA MÌNH' })
  @ApiOkResponse({ type: MarkReadResultDto })
  async markRead(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const count = await this.repo.markRead(user.membershipId, id);
    if (count === 0) throw new AppException('COMMON.NOT_FOUND');
    return { ok: true };
  }

  @AllowAuthenticated()
  @Post('read-all')
  @ApiOperation({ summary: 'Đánh dấu đã đọc tất cả' })
  @ApiOkResponse({ type: MarkAllReadResultDto })
  async markAllRead(@CurrentUser() user: AuthUser): Promise<MarkAllReadResultDto> {
    return { updated: await this.repo.markAllRead(user.membershipId) };
  }

  @AllowAuthenticated()
  @Get('preferences')
  @ApiOperation({ summary: 'Sở thích kênh nhận theo loại (§6.1, erd.md #1: theo membership)' })
  listPreferences(@CurrentUser() user: AuthUser) {
    return this.repo.listPreferences(user.membershipId);
  }

  @AllowAuthenticated()
  @Put('preferences')
  @ApiOperation({ summary: 'Đặt kênh nhận cho một loại thông báo' })
  upsertPreference(@CurrentUser() user: AuthUser, @Body() dto: UpsertPreferenceDto) {
    return this.repo.upsertPreference(user.tenantId, user.membershipId, dto.type, dto.channels);
  }
}
