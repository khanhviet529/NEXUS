import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/errors/app.exception';
import { PermissionResolverService } from '../auth/permission-resolver.service';
import { AdminService } from './admin.service';

/**
 * [CORE] Guard cứng cho /admin/* — §3.1b: MỌI endpoint admin bắt buộc
 * system:cross_tenant, độc lập với permission riêng của từng endpoint.
 */
@Injectable()
export class CrossTenantGuard implements CanActivate {
  constructor(private readonly resolver: PermissionResolverService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) throw new AppException('AUTH.UNAUTHENTICATED');
    const permissions = await this.resolver.getPermissionSet(user.tenantId, user.sub);
    if (!permissions.has('system:cross_tenant')) throw new AppException('AUTH.FORBIDDEN');
    return true;
  }
}

class CreateTenantDto {
  @ApiProperty({ example: 'CTY-ABC' })
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9-]*$/, { message: 'Mã tenant: chữ hoa, số, gạch ngang' })
  code!: string;

  @ApiProperty({ example: 'Công ty ABC' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ default: 'vi' })
  @IsOptional()
  @IsString()
  defaultLocale?: string;

  @ApiPropertyOptional({ default: 'Asia/Ho_Chi_Minh' })
  @IsOptional()
  @IsString()
  defaultTimezone?: string;
}

class FeatureEntryDto {
  @ApiProperty({ example: 'module.approvals' })
  @IsString()
  featureKey!: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  quota?: Record<string, unknown>;
}

class SetFeaturesDto {
  @ApiProperty({ type: [FeatureEntryDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => FeatureEntryDto)
  features!: FeatureEntryDto[];
}

class UpdateBrandingDto {
  @ApiProperty({ type: Object, example: { logoUrl: '...', primaryColor: '#0ea5e9' } })
  @IsObject()
  branding!: Record<string, unknown>;
}

/** Một dòng tenant cho màn sysadmin (§5C.1) */
export class AdminTenantDto {
  @ApiProperty() @Expose() id!: string;
  @ApiProperty() @Expose() code!: string;
  @ApiProperty() @Expose() name!: string;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED'] }) @Expose() status!: string;
  @ApiProperty({ description: 'Số membership' }) @Expose() memberCount!: number;
  @ApiProperty() @Expose() createdAt!: Date;
}

export class TenantFeatureDto {
  @ApiProperty({ example: 'module.approvals' }) @Expose() featureKey!: string;
  @ApiProperty() @Expose() enabled!: boolean;
  @ApiPropertyOptional({ nullable: true, type: Object }) @Expose() quota!: Record<
    string,
    unknown
  > | null;
}

export class CurrentTenantDto {
  @ApiProperty() @Expose() id!: string;
  @ApiProperty() @Expose() code!: string;
  @ApiProperty() @Expose() name!: string;
  @ApiProperty() @Expose() status!: string;
  @ApiProperty() @Expose() defaultLocale!: string;
  @ApiProperty() @Expose() defaultTimezone!: string;
  @ApiPropertyOptional({ nullable: true, type: Object }) @Expose() branding!: Record<
    string,
    unknown
  > | null;

  @ApiProperty({ type: [TenantFeatureDto] })
  @Expose()
  @Type(() => TenantFeatureDto)
  features!: TenantFeatureDto[];
}

@ApiTags('admin')
@UseGuards(CrossTenantGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('tenants')
  @RequirePermission('system_tenant:read')
  @ApiOperation({ summary: 'Danh sách tenant — chỉ SYSADMIN (§5C.1)' })
  @ApiOkResponse({ type: [AdminTenantDto] })
  async listTenants(): Promise<AdminTenantDto[]> {
    const rows = await this.admin.listTenants();
    return rows.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      status: t.status,
      memberCount: t._count.memberships,
      createdAt: t.createdAt,
    }));
  }

  @Post('tenants')
  @HttpCode(201)
  @RequirePermission('system_tenant:create')
  @ApiOperation({ summary: 'Tạo tenant KÈM seed khởi tạo (ROOT org + 4 vai trò hệ thống)' })
  @ApiOkResponse({ type: AdminTenantDto })
  async createTenant(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTenantDto,
  ): Promise<AdminTenantDto> {
    const t = await this.admin.createTenant(user, dto);
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      status: t.status,
      memberCount: 0,
      createdAt: t.createdAt,
    };
  }

  @Post('tenants/:id/suspend')
  @HttpCode(204)
  @RequirePermission('system_tenant:suspend')
  @ApiOperation({ summary: 'Đình chỉ — huỷ NGAY mọi phiên của tenant' })
  async suspend(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.admin.suspendTenant(user, id);
  }

  @Post('tenants/:id/activate')
  @HttpCode(204)
  @RequirePermission('system_tenant:suspend')
  async activate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.admin.activateTenant(user, id);
  }

  @Patch('tenants/:id/features')
  @HttpCode(204)
  @RequirePermission('system_tenant:features')
  @ApiOperation({ summary: 'Bật/tắt tính năng + quota theo tenant (§5C.1)' })
  async setFeatures(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetFeaturesDto,
  ) {
    await this.admin.setFeatures(user, id, dto.features);
  }
}

type TenantWithFeatures = {
  id: string;
  code: string;
  name: string;
  status: string;
  defaultLocale: string;
  defaultTimezone: string;
  branding: unknown;
  features: Array<{ featureKey: string; enabled: boolean; quota: unknown }>;
};
function toCurrentTenantDto(t: TenantWithFeatures): CurrentTenantDto {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    status: t.status,
    defaultLocale: t.defaultLocale,
    defaultTimezone: t.defaultTimezone,
    branding: t.branding as Record<string, unknown> | null,
    features: t.features.map((f) => ({
      featureKey: f.featureKey,
      enabled: f.enabled,
      quota: f.quota as Record<string, unknown> | null,
    })),
  };
}

/** Tenant tự quản — trong phạm vi token, KHÔNG cross-tenant (ma trận §2.6) */
@ApiTags('tenants')
@Controller('tenants')
export class TenantSelfController {
  constructor(private readonly admin: AdminService) {}

  @Get('current')
  @RequirePermission('tenant:read')
  @ApiOkResponse({ type: CurrentTenantDto })
  async getCurrent(@CurrentUser() user: AuthUser): Promise<CurrentTenantDto> {
    const t = await this.admin.getCurrentTenant(user);
    return toCurrentTenantDto(t!);
  }

  @Patch('current/branding')
  @RequirePermission('tenant:update')
  @ApiOkResponse({ type: CurrentTenantDto })
  async updateBranding(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateBrandingDto,
  ): Promise<CurrentTenantDto> {
    await this.admin.updateBranding(user, dto.branding);
    // Đọc lại KÈM features — PATCH trả cùng shape với GET, FE không phải merge
    const t = await this.admin.getCurrentTenant(user);
    return toCurrentTenantDto(t!);
  }
}
