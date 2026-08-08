import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/errors/app.exception';
import { AuditRepository } from '../audit/audit.repository';
import { ApprovalAuthoritiesRepository } from './approval-authorities.repository';
import { AUDIT_ACTIONS } from '@nexus/shared';

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

class CreateAuthorityDto {
  @ApiProperty({ example: 'ORDER' })
  @IsString()
  @MinLength(1)
  documentType!: string;

  @ApiPropertyOptional({ default: 'VND' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Cụ thể nhất — thắng role/orgUnit' })
  @IsOptional()
  @IsUUID()
  membershipId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orgUnitId?: string;

  @ApiPropertyOptional({ default: '0', description: 'Tiền là CHUỖI (§3.7)' })
  @IsOptional()
  @Matches(MONEY_RE)
  minAmount?: string;

  @ApiPropertyOptional({ description: 'Bỏ trống = không giới hạn' })
  @IsOptional()
  @Matches(MONEY_RE)
  maxAmount?: string;

  @ApiProperty({ example: '2026-01-01' })
  @Type(() => Date)
  @IsDate()
  effectiveFrom!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveTo?: Date;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;
}

class CheckDto {
  @ApiProperty({ example: 'ORDER' })
  @IsString()
  documentType!: string;

  @ApiProperty({ example: '150000000' })
  @Matches(MONEY_RE)
  amount!: string;

  @ApiPropertyOptional({ default: 'VND' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Mặc định hôm nay' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;
}

/**
 * [OPT] GĐ10 — hạn mức duyệt (§5C.12). Bảng RIÊNG, không trên memberships
 * (§12 #62). Endpoint check là bắt buộc theo spec — "cấu hình sai chỉ lộ
 * ra khi chứng từ bị kẹt không ai duyệt được".
 */
@ApiTags('approval-authorities')
@Controller('approval-authorities')
export class ApprovalAuthoritiesController {
  constructor(
    private readonly repo: ApprovalAuthoritiesRepository,
    private readonly audit: AuditRepository,
  ) {}

  @Get()
  @RequirePermission('approval_authority:read')
  @ApiOperation({ summary: 'Danh sách hạn mức của tenant' })
  list() {
    return this.repo.list();
  }

  @Get('check')
  @RequirePermission('approval_authority:read')
  @ApiOperation({ summary: 'docType + số tiền + ngày → AI đủ thẩm quyền (§5C.12)' })
  check(@Query() q: CheckDto) {
    return this.repo.whoCanApprove(
      q.documentType,
      q.currency ?? 'VND',
      q.amount,
      q.date ?? new Date(),
    );
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('approval_authority:manage')
  @ApiOperation({ summary: 'Thêm dòng hạn mức — phải trỏ ≥1 đối tượng (CHECK ở DB)' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateAuthorityDto) {
    if (!dto.membershipId && !dto.roleId && !dto.orgUnitId) {
      throw new AppException('COMMON.VALIDATION_FAILED', {
        details: { target: ['Phải chỉ định membershipId, roleId hoặc orgUnitId'] },
      });
    }
    const row = await this.repo.create({
      tenantId: user.tenantId,
      documentType: dto.documentType,
      currency: dto.currency ?? 'VND',
      membershipId: dto.membershipId,
      roleId: dto.roleId,
      orgUnitId: dto.orgUnitId,
      minAmount: dto.minAmount ?? '0',
      maxAmount: dto.maxAmount ?? null,
      effectiveFrom: dto.effectiveFrom,
      effectiveTo: dto.effectiveTo,
      priority: dto.priority ?? 0,
    });
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'ApprovalAuthority',
      entityId: row.id,
      action: AUDIT_ACTIONS.CREATE,
      after: { documentType: dto.documentType, maxAmount: dto.maxAmount ?? 'không giới hạn' },
    });
    return row;
  }

  @Delete(':id')
  @RequirePermission('approval_authority:manage')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const count = await this.repo.softDelete(id);
    if (count === 0) throw new AppException('COMMON.NOT_FOUND');
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'ApprovalAuthority',
      entityId: id,
      action: AUDIT_ACTIONS.DELETE,
    });
    return { ok: true };
  }
}
