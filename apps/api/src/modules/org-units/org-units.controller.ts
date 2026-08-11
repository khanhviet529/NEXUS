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
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { OrgUnitsService } from './org-units.service';

export class OrgUnitDto {
  @ApiProperty() @Expose() id!: string;
  @ApiProperty() @Expose() code!: string;
  @ApiProperty() @Expose() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @Expose() parentId!: string | null;
  @ApiProperty({ description: 'Optimistic locking (§4.5) — PATCH cần gửi lại' })
  @Expose()
  version!: number;
}

type OrgUnitRow = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  version: number;
};
const toOrgUnitDto = (r: OrgUnitRow): OrgUnitDto => ({
  id: r.id,
  code: r.code,
  name: r.name,
  parentId: r.parentId,
  version: r.version,
});

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
  @ApiOkResponse({ type: [OrgUnitDto] })
  async list(@CurrentUser() user: AuthUser): Promise<OrgUnitDto[]> {
    const rows = await this.orgUnits.list(user);
    return rows.map(toOrgUnitDto);
  }

  @Post()
  @RequirePermission('org_unit:create')
  @ApiOkResponse({ type: OrgUnitDto })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrgUnitDto): Promise<OrgUnitDto> {
    const row = await this.orgUnits.create(user, dto);
    return toOrgUnitDto(row!);
  }

  @Patch(':id')
  @RequirePermission('org_unit:update')
  @ApiOperation({ summary: 'Sửa/di chuyển đơn vị — đổi cây invalidate quyền TOÀN tenant' })
  @ApiOkResponse({ type: OrgUnitDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgUnitDto,
  ): Promise<OrgUnitDto> {
    const row = await this.orgUnits.update(user, id, dto);
    return toOrgUnitDto(row!);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('org_unit:delete')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.orgUnits.remove(user, id);
  }
}
