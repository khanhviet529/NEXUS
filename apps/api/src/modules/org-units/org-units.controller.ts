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
import { ApiOperation, ApiTags, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { OrgUnitsService } from './org-units.service';

class CreateOrgUnitDto {
  @ApiProperty({ example: 'PB-KD' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ example: 'Phòng Kinh doanh' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

class UpdateOrgUnitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Đổi cha — kiểm tra vòng lặp' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ description: 'Optimistic locking (§4.5)' })
  @IsInt()
  @Min(1)
  version!: number;
}

/** Ma trận §2.4: ai cũng đọc được (dropdown); chỉ admin sửa */
@ApiTags('org-units')
@Controller('org-units')
export class OrgUnitsController {
  constructor(private readonly orgUnits: OrgUnitsService) {}

  @Get()
  @RequirePermission('org_unit:read')
  @ApiOperation({ summary: 'Cây đơn vị của tenant' })
  list(@CurrentUser() user: AuthUser) {
    return this.orgUnits.list(user);
  }

  @Post()
  @RequirePermission('org_unit:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrgUnitDto) {
    return this.orgUnits.create(user, dto);
  }

  @Patch(':id')
  @RequirePermission('org_unit:update')
  @ApiOperation({ summary: 'Sửa/di chuyển đơn vị — đổi cây invalidate quyền TOÀN tenant' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgUnitDto,
  ) {
    return this.orgUnits.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('org_unit:delete')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.orgUnits.remove(user, id);
  }
}
