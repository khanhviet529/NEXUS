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
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { PERMISSION_SCOPES } from '@nexus/shared';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RolesService } from './roles.service';

/** Một dòng gán quyền của vai trò — nguồn cho builder permission×scope (2a) */
export class RolePermissionDto {
  @ApiProperty({ example: 'order:approve' }) @Expose() permissionCode!: string;
  @ApiProperty({ enum: PERMISSION_SCOPES }) @Expose() scope!: string;
}

export class RoleDto {
  @ApiProperty() @Expose() id!: string;
  @ApiProperty() @Expose() code!: string;
  @ApiProperty() @Expose() name!: string;
  @ApiProperty({ description: 'Vai trò seed — không sửa/xoá được' })
  @Expose()
  isSystem!: boolean;

  @ApiProperty({ type: [RolePermissionDto] })
  @Expose()
  @Type(() => RolePermissionDto)
  permissions!: RolePermissionDto[];
}

export class PermissionDto {
  @ApiProperty({ example: 'order:approve' }) @Expose() code!: string;
  @ApiProperty({ example: 'order' }) @Expose() resource!: string;
  @ApiProperty({ example: 'approve' }) @Expose() action!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @Expose() description!: string | null;
}

/** Row Prisma (include permissions.permission) → DTO phẳng cho FE */
type RoleRow = {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  permissions: Array<{ scope: string; permission: { code: string } }>;
};
function toRoleDto(r: RoleRow): RoleDto {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    isSystem: r.isSystem,
    permissions: r.permissions.map((p) => ({
      permissionCode: p.permission.code,
      scope: p.scope,
    })),
  };
}

class RolePermissionInputDto {
  @ApiProperty({ example: 'user:read' })
  @IsString()
  permissionCode!: string;

  @ApiProperty({ enum: PERMISSION_SCOPES })
  @IsIn(PERMISSION_SCOPES as unknown as string[])
  scope!: string;
}

class CreateRoleDto {
  @ApiProperty({ example: 'KE_TOAN' })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'Mã vai trò: SCREAMING_SNAKE_CASE' })
  code!: string;

  @ApiProperty({ example: 'Kế toán' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ type: [RolePermissionInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionInputDto)
  permissions!: RolePermissionInputDto[];
}

class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ type: [RolePermissionInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionInputDto)
  permissions?: RolePermissionInputDto[];
}

@ApiTags('roles')
@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('roles')
  @RequirePermission('role:read')
  @ApiOperation({ summary: 'Danh sách vai trò của tenant' })
  @ApiOkResponse({ type: [RoleDto] })
  async list(@CurrentUser() user: AuthUser): Promise<RoleDto[]> {
    const rows = await this.roles.list(user);
    return rows.map(toRoleDto);
  }

  @Post('roles')
  @RequirePermission('role:create')
  @ApiOperation({ summary: 'Tenant tự tạo vai trò từ permission + scope (§4.4 #61)' })
  @ApiOkResponse({ type: RoleDto })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleDto): Promise<RoleDto> {
    const row = await this.roles.create(user, dto);
    return toRoleDto(row!);
  }

  @Patch('roles/:id')
  @RequirePermission('role:update')
  @ApiOperation({ summary: 'Sửa vai trò — is_system bị chặn; không cấp quyền mình không có' })
  @ApiOkResponse({ type: RoleDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleDto> {
    const row = await this.roles.update(user, id, dto);
    return toRoleDto(row!);
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermission('role:delete')
  @ApiOperation({ summary: 'Xoá vai trò — đang được dùng → 409 HAS_REFERENCES' })
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.roles.remove(user, id);
  }

  @Get('permissions')
  @RequirePermission('permission:read')
  @ApiOperation({ summary: 'Registry permission — sync từ code (§4.4)' })
  @ApiOkResponse({ type: [PermissionDto] })
  async listPermissions(): Promise<PermissionDto[]> {
    const rows = await this.roles.listPermissions();
    return rows.map((p) => ({
      code: p.code,
      resource: p.resource,
      action: p.action,
      description: p.description,
    }));
  }
}
