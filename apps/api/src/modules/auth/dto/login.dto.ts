import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@tenant-a.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Passw0rd!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ description: 'Bắt buộc khi user thuộc nhiều tenant' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({
    enum: ['web', 'mobile'],
    default: 'web',
    description: 'web → token qua httpOnly cookie; mobile → token trong body (§4.3b)',
  })
  @IsOptional()
  @IsIn(['web', 'mobile'])
  client?: 'web' | 'mobile';
}
