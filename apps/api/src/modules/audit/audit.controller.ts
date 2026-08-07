import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { buildMeta } from '../../common/dto/paginated.dto';
import { AuditQueryRepository } from './audit-query.repository';

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
