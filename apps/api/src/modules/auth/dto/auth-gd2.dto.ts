import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiPropertyOptional({
    description: 'Chỉ mobile (Bearer) gửi qua body. Web dùng cookie refresh_token',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class SwitchTenantDto {
  @ApiProperty()
  @IsUUID()
  tenantId!: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class AcceptInvitationDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiPropertyOptional({ description: 'Bắt buộc nếu email chưa có tài khoản' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class SessionDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @Expose()
  device!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @Expose()
  ip!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @Expose()
  userAgent!: string | null;

  @ApiProperty()
  @Expose()
  createdAt!: Date;

  @ApiPropertyOptional({ nullable: true, type: Date })
  @Expose()
  lastSeenAt!: Date | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  @Expose()
  revokedAt!: Date | null;
}

export class TokenPairDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Web: đã set cookie, giá trị này để tương thích; Mobile: dùng làm Bearer',
  })
  @Expose()
  accessToken!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'CHỈ trả cho client=mobile. Web nhận qua httpOnly cookie',
  })
  @Expose()
  refreshToken!: string | null;

  @ApiProperty()
  @Expose()
  expiresIn!: number;
}
