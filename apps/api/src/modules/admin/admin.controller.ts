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
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
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
import { Type } from 'class-transformer';
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

@ApiTags('admin')
@UseGuards(CrossTenantGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('tenants')
  @RequirePermission('system_tenant:read')
  @ApiOperation({ summary: 'Danh sách tenant — chỉ SYSADMIN (§5C.1)' })
  listTenants() {
    return this.admin.listTenants();
  }

  @Post('tenants')
  @HttpCode(201)
  @RequirePermission('system_tenant:create')
  @ApiOperation({ summary: 'Tạo tenant KÈM seed khởi tạo (ROOT org + 4 vai trò hệ thống)' })
  createTenant(@CurrentUser() user: AuthUser, @Body() dto: CreateTenantDto) {
    return this.admin.createTenant(user, dto);
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

/** Tenant tự quản — trong phạm vi token, KHÔNG cross-tenant (ma trận §2.6) */
@ApiTags('tenants')
@Controller('tenants')
export class TenantSelfController {
  constructor(private readonly admin: AdminService) {}

  @Get('current')
  @RequirePermission('tenant:read')
  getCurrent(@CurrentUser() user: AuthUser) {
    return this.admin.getCurrentTenant(user);
  }

  @Patch('current/branding')
  @RequirePermission('tenant:update')
  updateBranding(@CurrentUser() user: AuthUser, @Body() dto: UpdateBrandingDto) {
    return this.admin.updateBranding(user, dto.branding);
  }
}
