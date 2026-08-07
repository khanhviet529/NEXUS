import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEmail, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { InvitationService } from '../auth/invitation.service';

export class InviteUserDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orgUnitId?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  roleIds!: string[];
}

/**
 * GĐ2: chỉ POST /users/invite (ma trận §2.2). CRUD đầy đủ + vòng đời
 * tài khoản vào GĐ3.
 */
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly invitations: InvitationService) {}

  @Post('invite')
  @HttpCode(201)
  @RequirePermission('user:invite')
  @ApiOperation({ summary: 'Mời tài khoản — gửi link kích hoạt một lần (§4.3c)' })
  @ApiCreatedResponse({ schema: { example: { invitationId: '...' } } })
  async invite(
    @CurrentUser() user: AuthUser,
    @Body() dto: InviteUserDto,
  ): Promise<{ invitationId: string }> {
    return this.invitations.invite({
      tenantId: user.tenantId,
      email: dto.email,
      orgUnitId: dto.orgUnitId,
      roleIds: dto.roleIds,
      invitedById: user.sub,
    });
  }
}
