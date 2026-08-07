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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { Type } from 'class-transformer';
import { PERMISSION_SCOPES } from '@nexus/shared';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RolesService } from './roles.service';

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
  list(@CurrentUser() user: AuthUser) {
    return this.roles.list(user);
  }

  @Post('roles')
  @RequirePermission('role:create')
  @ApiOperation({ summary: 'Tenant tự tạo vai trò từ permission + scope (§4.4 #61)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleDto) {
    return this.roles.create(user, dto);
  }

  @Patch('roles/:id')
  @RequirePermission('role:update')
  @ApiOperation({ summary: 'Sửa vai trò — is_system bị chặn; không cấp quyền mình không có' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.roles.update(user, id, dto);
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
  listPermissions() {
    return this.roles.listPermissions();
  }
}
