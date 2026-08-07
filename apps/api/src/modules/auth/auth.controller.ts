import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { ACCESS_TOKEN_COOKIE } from '../../common/guards/composite-auth.guard';
import { ErrorDto } from '../../common/dto/error.dto';
import { AuthService } from './auth.service';
import { PermissionResolverService } from './permission-resolver.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { MeResponseDto } from './dto/me-response.dto';

/**
 * Controller MỎNG (§4.2): nhận DTO, gọi service, trả kết quả.
 * GET /me dùng @AllowAuthenticated — ma trận §2.1: chỉ cần đăng nhập.
 */
@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly permissions: PermissionResolverService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('auth/login')
  @ApiOperation({ summary: 'Đăng nhập bằng email + mật khẩu' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const result = await this.auth.login({
      email: dto.email,
      password: dto.password,
      tenantId: dto.tenantId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Web: httpOnly cookie (§4.3b). Mobile đọc accessToken từ body.
    if (result.accessToken) {
      res.cookie(ACCESS_TOKEN_COOKIE, result.accessToken, {
        httpOnly: true,
        secure: this.config.get('NODE_ENV') === 'production',
        sameSite: 'lax',
        maxAge: result.expiresIn * 1000,
        path: '/',
      });
    }
    return plainToInstance(LoginResponseDto, result);
  }

  @AllowAuthenticated()
  @Get('me')
  @ApiOperation({ summary: 'Thông tin người dùng hiện tại trong tenant hiện hành' })
  @ApiOkResponse({ type: MeResponseDto })
  async me(@CurrentUser() user: AuthUser): Promise<MeResponseDto> {
    const { account, membership } = await this.auth.getMe(user);
    const permissionSet = await this.permissions.getPermissionSet(user.tenantId, user.sub);
    return plainToInstance(MeResponseDto, {
      id: account.id,
      email: account.email,
      fullName: account.fullName,
      membershipId: membership.id,
      tenant: membership.tenant,
      orgUnit: membership.orgUnit ?? null,
      roles: membership.userRoles.map((ur) => ({
        code: ur.role.code,
        name: ur.role.name,
      })),
      permissions: [...permissionSet].sort(),
    });
  }
}
