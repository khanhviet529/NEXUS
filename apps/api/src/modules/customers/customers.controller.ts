import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { buildMeta } from '../../common/dto/paginated.dto';
import { RequestContextService } from '../../infra/cls/request-context';
import { resolveLocalizedValue, type Locale, type LocalizedText } from '../../common/query/localized';
import { AuditRepository } from '../audit/audit.repository';
import { CustomersRepository } from './customers.repository';

class CreateCustomerDto {
  @ApiProperty({ example: 'KH001' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ example: { vi: 'Công ty A' } })
  @IsObject()
  @IsNotEmptyObject()
  name!: LocalizedText;

  @ApiPropertyOptional({ example: '0312345678' })
  @IsOptional()
  @IsString()
  taxCode?: string;
}

class ListCustomersQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

/** [REF] tối thiểu GĐ5 — CRUD đầy đủ theo khuôn products khi generator GĐ9 chạy */
@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly repo: CustomersRepository,
    private readonly ctx: RequestContextService,
    private readonly audit: AuditRepository,
  ) {}

  @Get()
  @RequirePermission('customer:read')
  async list(@CurrentUser() _user: AuthUser, @Query() query: ListCustomersQueryDto) {
    const [data, total] = await this.repo.list(query.page, query.limit);
    const locale = this.ctx.locale as Locale;
    return {
      data: data.map((c) => ({
        id: c.id,
        code: c.code,
        name: resolveLocalizedValue(c.name, locale),
        taxCode: c.taxCode,
        version: c.version,
        createdAt: c.createdAt,
      })),
      meta: buildMeta(query.page, query.limit, total),
    };
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('customer:create')
  @ApiOperation({ summary: 'Tạo khách hàng — name JSONB đa ngôn ngữ (§3.10)' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    const row = await this.repo.create(user.tenantId, dto);
    // ADR-0004: audit tường minh mọi đường ghi (check-audit-coverage gác)
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'Customer',
      entityId: row.id,
      action: 'CREATE',
      after: { code: row.code },
    });
    return {
      id: row.id,
      code: row.code,
      name: resolveLocalizedValue(row.name, this.ctx.locale as Locale),
      version: row.version,
    };
  }
}
