import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/paginated.dto';
import { MeOrgUnitDto, MeRoleDto } from '../../auth/dto/me-response.dto';

export class UserResponseDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  membershipId!: string;

  @ApiProperty()
  @Expose()
  email!: string;

  @ApiProperty()
  @Expose()
  fullName!: string;

  @ApiProperty()
  @Expose()
  status!: string;

  @ApiProperty()
  @Expose()
  membershipStatus!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @Expose() // group contact — mọi vai trò seed đều xem (permission-matrix §4)
  phone!: string | null;

  /** §4.4c: CHỈ lộ khi có field:pii — SerializeInterceptor áp group */
  @ApiPropertyOptional({ nullable: true, type: String })
  @Expose({ groups: ['pii'] })
  nationalId!: string | null;

  /** §4.4c: CHỈ lộ khi có field:hr. Tiền là CHUỖI decimal (§3.7) */
  @ApiPropertyOptional({ nullable: true, type: String })
  @Expose({ groups: ['hr'] })
  salary!: string | null;

  @ApiPropertyOptional({ type: MeOrgUnitDto, nullable: true })
  @Expose()
  @Type(() => MeOrgUnitDto)
  orgUnit!: MeOrgUnitDto | null;

  @ApiProperty({ type: [MeRoleDto] })
  @Expose()
  @Type(() => MeRoleDto)
  roles!: MeRoleDto[];

  @ApiPropertyOptional({ nullable: true, type: Date })
  @Expose()
  lastLoginAt!: Date | null;

  @ApiProperty()
  @Expose()
  createdAt!: Date;
}

export class UserListResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  @Expose()
  @Type(() => UserResponseDto)
  data!: UserResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  @Expose()
  @Type(() => PaginationMetaDto)
  meta!: PaginationMetaDto;
}

export class ListUsersQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100) // cap cứng ở BE (§3.3)
  limit: number = 20;

  @ApiPropertyOptional({ example: '-createdAt,email', description: 'Whitelist §3.4' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ description: 'Tìm nhanh theo email / tên' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? undefined : value))
  q?: string;

  /** filter[field][op]=value (§3.5) — parser validate, GĐ4 users mới có q+sort */
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  filter?: Record<string, unknown>;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Cần field:pii' })
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Cần field:hr. Chuỗi decimal (§3.7)' })
  @IsOptional()
  @IsString()
  salary?: string;
}

export class TransferOrgDto {
  @ApiProperty()
  @IsUUID()
  orgUnitId!: string;
}

export class AssignRolesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  roleIds!: string[];
}
