import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { buildMeta, PaginationMetaDto } from '../../common/dto/paginated.dto';
import { AuditQueryRepository } from './audit-query.repository';

/** Một dòng audit — nguồn cho AuditTimeline FE (§4.9). before/after ĐÃ che từ lúc ghi */
export class AuditLogEntryDto {
  @ApiProperty() @Expose() id!: string;
  @ApiProperty() @Expose() entity!: string;
  @ApiProperty() @Expose() entityId!: string;
  @ApiProperty({ description: 'AuditAction registry hoặc DB_INSERT/DB_UPDATE/DB_DELETE (trigger)' })
  @Expose()
  action!: string;

  @ApiPropertyOptional({ nullable: true, type: String, description: "uuid | 'system:<job>' | 'db:direct'" })
  @Expose()
  actorId!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @Expose()
  actorName!: string | null;

  @ApiPropertyOptional({ nullable: true, type: Object })
  @Expose()
  before!: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true, type: Object })
  @Expose()
  after!: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @Expose()
  traceId!: string | null;

  @ApiProperty() @Expose() createdAt!: Date;
}

export class AuditListResponseDto {
  @ApiProperty({ type: [AuditLogEntryDto] })
  @Expose()
  @Type(() => AuditLogEntryDto)
  data!: AuditLogEntryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  @Expose()
  @Type(() => PaginationMetaDto)
  meta!: PaginationMetaDto;
}

class ListAuditDto {
  @ApiPropertyOptional({ description: 'Lọc theo entity (EntityType)' })
  @IsOptional()
  @IsString()
  entity?: string;

  @ApiPropertyOptional({ description: 'Timeline của MỘT bản ghi (§4.9)' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  action?: string;

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

/**
 * [CORE] GĐ7 — tra cứu audit + timeline trang chi tiết (§4.9).
 * before/after ĐÃ che field nhạy cảm từ lúc GHI (§4.4c nơi 4) — đọc trả thẳng.
 * Scope audit:read: desc/dept = audit do NGƯỜI TRONG CÂY đơn vị thao tác.
 */
@ApiTags('audit')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditQueryRepository) {}

  @Get()
  @RequirePermission('audit:read')
  @ApiOperation({ summary: 'Tra cứu audit — lọc entity/entityId/action, phân trang' })
  @ApiOkResponse({ type: AuditListResponseDto })
  async list(@CurrentUser() user: AuthUser, @Query() q: ListAuditDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const { rows, total } = await this.audit.list(user, {
      entity: q.entity,
      entityId: q.entityId,
      action: q.action,
      page,
      limit,
    });
    return { data: rows, meta: buildMeta(page, limit, total) };
  }
}
