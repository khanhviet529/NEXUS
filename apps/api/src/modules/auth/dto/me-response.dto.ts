import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class MeTenantDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  code!: string;

  @ApiProperty()
  @Expose()
  name!: string;
}

export class MeOrgUnitDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  code!: string;

  @ApiProperty()
  @Expose()
  name!: string;
}

export class MeRoleDto {
  @ApiProperty()
  @Expose()
  code!: string;

  @ApiProperty()
  @Expose()
  name!: string;
}

/** GET /me — tiêu chí hoàn thành GĐ1 (spec §10) */
export class MeResponseDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  email!: string;

  @ApiProperty()
  @Expose()
  fullName!: string;

  @ApiProperty()
  @Expose()
  membershipId!: string;

  @ApiProperty({ type: MeTenantDto })
  @Expose()
  @Type(() => MeTenantDto)
  tenant!: MeTenantDto;

  @ApiPropertyOptional({ type: MeOrgUnitDto, nullable: true })
  @Expose()
  @Type(() => MeOrgUnitDto)
  orgUnit!: MeOrgUnitDto | null;

  @ApiProperty({ type: [MeRoleDto], description: 'Vai trò seed/tenant tự tạo — CHỈ để hiển thị, FE kiểm quyền bằng permissions' })
  @Expose()
  @Type(() => MeRoleDto)
  roles!: MeRoleDto[];

  @ApiProperty({ type: [String], description: 'Tập permission — nguồn cho useCan() ở FE' })
  @Expose()
  permissions!: string[];

  @ApiProperty({
    type: [MeTenantDto],
    description:
      'MỌI tenant user là thành viên ACTIVE — nguồn cho switch-tenant ở header (Phase 3). >1 phần tử mới hiện nút chuyển',
  })
  @Expose()
  @Type(() => MeTenantDto)
  memberships!: MeTenantDto[];
}
