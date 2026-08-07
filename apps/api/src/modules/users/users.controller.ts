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
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { toDto } from '../../common/serialization/to-dto';
import { ArrayNotEmpty, IsArray, IsEmail, IsOptional, IsUUID } from 'class-validator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { buildMeta } from '../../common/dto/paginated.dto';
import { InvitationService } from '../auth/invitation.service';
import { UsersService } from './users.service';
import {
  AssignRolesDto,
  ListUsersQueryDto,
  TransferOrgDto,
  UpdateUserDto,
  UserListResponseDto,
  UserResponseDto,
} from './dto/user.dto';
import { SessionDto } from '../auth/dto/auth-gd2.dto';

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

type MembershipRow = Awaited<ReturnType<UsersService['getInScope']>>;

function toUserResponse(m: MembershipRow): Record<string, unknown> {
  return {
    id: m.user.id,
    membershipId: m.id,
    email: m.user.email,
    fullName: m.user.fullName,
    status: m.user.status,
    membershipStatus: m.status,
    phone: m.user.phone,
    nationalId: m.user.nationalId,
    salary: m.user.salary?.toString() ?? null, // decimal → CHUỖI (§3.7)
    orgUnit: m.orgUnit ?? null,
    roles: m.userRoles.map((ur) => ({ code: ur.role.code, name: ur.role.name })),
    lastLoginAt: m.user.lastLoginAt,
    createdAt: m.createdAt,
  };
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly invitations: InvitationService,
  ) {}

  @Get()
  @RequirePermission('user:read')
  @ApiOperation({ summary: 'Danh sách thành viên — scope trong WHERE, phân trang §3.2/§3.3' })
  @ApiOkResponse({ type: UserListResponseDto })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListUsersQueryDto,
  ): Promise<UserListResponseDto> {
    const { data, total } = await this.users.list(user, query);
    return toDto(UserListResponseDto, {
      data: data.map(toUserResponse),
      meta: buildMeta(query.page, query.limit, total),
    });
  }

  @Get(':id')
  @RequirePermission('user:read')
  @ApiOkResponse({ type: UserResponseDto })
  async detail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResponseDto> {
    const m = await this.users.getInScope(user, id);
    return toDto(UserResponseDto, toUserResponse(m));
  }

  @Post('invite')
  @HttpCode(201)
  @RequirePermission('user:invite')
  @ApiOperation({ summary: 'Mời tài khoản — link kích hoạt một lần (§4.3c)' })
  @ApiCreatedResponse({ schema: { example: { invitationId: '...' } } })
  invite(@CurrentUser() user: AuthUser, @Body() dto: InviteUserDto) {
    return this.invitations.invite({
      tenantId: user.tenantId,
      email: dto.email,
      orgUnitId: dto.orgUnitId,
      roleIds: dto.roleIds,
      invitedById: user.sub,
    });
  }

  @Patch(':id')
  @RequirePermission('user:update')
  @ApiOperation({ summary: 'Sửa hồ sơ — field nhạy cảm đòi field:hr / field:pii (§4.4c)' })
  @ApiOkResponse({ type: UserResponseDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const m = await this.users.update(user, id, dto);
    return toDto(UserResponseDto, toUserResponse(m));
  }

  @Post(':id/disable')
  @HttpCode(204)
  @RequirePermission('user:disable')
  @ApiOperation({ summary: 'Vô hiệu hoá — huỷ NGAY mọi phiên' })
  async disable(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.users.disable(user, id);
  }

  @Post(':id/unlock')
  @HttpCode(204)
  @RequirePermission('user:unlock')
  async unlock(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.users.unlock(user, id);
  }

  @Post(':id/transfer-org')
  @HttpCode(204)
  @RequirePermission('user:transfer')
  @ApiOperation({ summary: 'Chuyển phòng ban — BẮT BUỘC huỷ mọi phiên (§4.3 cạm bẫy orgUnitId)' })
  async transferOrg(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferOrgDto,
  ) {
    await this.users.transferOrg(user, id, dto.orgUnitId);
  }

  @Post(':id/offboard')
  @HttpCode(204)
  @RequirePermission('user:offboard')
  @ApiOperation({ summary: 'Nghỉ việc — thu hồi quyền + huỷ mọi phiên (§4.3c)' })
  async offboard(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.users.offboard(user, id);
  }

  @Post(':id/roles')
  @HttpCode(204)
  @RequirePermission('user:assign_role')
  @ApiOperation({
    summary: 'Gán vai trò — cấm tự cấp (AUTH.SELF_GRANT_FORBIDDEN), cấm cấp quyền mình không có',
  })
  async assignRoles(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRolesDto,
  ) {
    await this.users.assignRoles(user, id, dto.roleIds);
  }

  @Get(':id/sessions')
  @RequirePermission('user_session:read')
  @ApiOkResponse({ type: [SessionDto] })
  async sessions(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SessionDto[]> {
    const sessions = await this.users.getSessions(user, id);
    return toDto(SessionDto, sessions);
  }

  @Delete(':id/sessions')
  @HttpCode(204)
  @RequirePermission('user_session:revoke')
  @ApiOperation({ summary: 'Thu hồi toàn bộ phiên của user' })
  async revokeSessions(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.users.revokeSessions(user, id);
  }
}
