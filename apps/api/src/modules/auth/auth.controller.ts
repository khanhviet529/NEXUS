import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { ACCESS_TOKEN_COOKIE } from '../../common/guards/composite-auth.guard';
import { CSRF_COOKIE, REFRESH_COOKIE } from '../../common/guards/csrf.guard';
import { ErrorDto } from '../../common/dto/error.dto';
import { AppException } from '../../common/errors/app.exception';
import { AuthService, type TokenPair } from './auth.service';
import { PermissionResolverService } from './permission-resolver.service';
import { PasswordResetService } from './password-reset.service';
import { InvitationService } from './invitation.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { MeResponseDto } from './dto/me-response.dto';
import {
  AcceptInvitationDto,
  ForgotPasswordDto,
  RefreshDto,
  ResetPasswordDto,
  SessionDto,
  SwitchTenantDto,
  TokenPairDto,
} from './dto/auth-gd2.dto';

/**
 * Controller MỎNG (§4.2). Transport token là việc của TẦNG NÀY (§4.3b):
 *   web    → httpOnly cookie (access path /, refresh path giới hạn) + csrf cookie
 *   mobile → token trong body, không cookie
 */
@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly permissions: PermissionResolverService,
    private readonly passwordReset: PasswordResetService,
    private readonly invitations: InvitationService,
    private readonly config: ConfigService,
  ) {}

  private get isProd(): boolean {
    return this.config.get('NODE_ENV') === 'production';
  }

  /** Contract cookie CHỐT CỨNG — §4.3b, quyết định #53 */
  private setAuthCookies(res: Response, tokens: TokenPair): void {
    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure: this.isProd,
      sameSite: 'lax',
      maxAge: tokens.expiresIn * 1000,
      path: '/',
    });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: this.isProd,
      sameSite: 'lax',
      maxAge: 30 * 86_400_000,
      path: '/api/v1/auth/refresh', // path giới hạn (§4.3b)
    });
    // CSRF: cookie DUY NHẤT mà JS được đọc — cấp lại cùng login và MỖI lần refresh
    res.cookie(CSRF_COOKIE, randomBytes(32).toString('base64url'), {
      httpOnly: false,
      secure: this.isProd,
      sameSite: 'lax',
      path: '/',
    });
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth/refresh' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
  }

  // ==================== Login / chọn tenant ====================

  @Public()
  @Post('auth/login')
  @ApiOperation({
    summary: 'Đăng nhập. User nhiều tenant → trả danh sách, gọi lại kèm tenantId (= select-tenant)',
  })
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
    const mobile = dto.client === 'mobile';
    if (result.tokens && !mobile) this.setAuthCookies(res, result.tokens);
    return plainToInstance(LoginResponseDto, {
      accessToken: result.tokens?.accessToken ?? null,
      refreshToken: mobile ? (result.tokens?.refreshToken ?? null) : null,
      expiresIn: result.tokens?.expiresIn ?? 0,
      memberships: result.memberships,
    });
  }

  @Public()
  @Post('auth/refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Xoay vòng refresh token — dùng lại token cũ = huỷ mọi phiên (§4.3d)' })
  @ApiOkResponse({ type: TokenPairDto })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenPairDto> {
    const cookies = (req.cookies ?? {}) as Record<string, string>;
    const fromCookie = cookies[REFRESH_COOKIE];
    const token = fromCookie ?? dto.refreshToken;
    if (!token) throw new AppException('AUTH.UNAUTHENTICATED');

    const tokens = await this.auth.refresh(token, req.ip);
    if (fromCookie) {
      this.setAuthCookies(res, tokens);
      return plainToInstance(TokenPairDto, {
        accessToken: tokens.accessToken,
        refreshToken: null, // web không bao giờ thấy refresh token
        expiresIn: tokens.expiresIn,
      });
    }
    return plainToInstance(TokenPairDto, tokens);
  }

  @AllowAuthenticated()
  @Post('auth/logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Thu hồi phiên hiện tại' })
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(user, req.ip);
    this.clearAuthCookies(res);
  }

  @AllowAuthenticated()
  @Post('auth/switch-tenant')
  @HttpCode(200)
  @ApiOperation({ summary: 'Đổi tenant — cấp token MỚI sau khi kiểm membership (§3.1b)' })
  @ApiOkResponse({ type: TokenPairDto })
  async switchTenant(
    @CurrentUser() user: AuthUser,
    @Body() dto: SwitchTenantDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenPairDto> {
    const tokens = await this.auth.switchTenant(
      user,
      dto.tenantId,
      req.ip,
      req.headers['user-agent'],
    );
    const cookies = (req.cookies ?? {}) as Record<string, string>;
    const isWeb = Boolean(cookies[ACCESS_TOKEN_COOKIE]);
    if (isWeb) {
      this.setAuthCookies(res, tokens);
      return plainToInstance(TokenPairDto, {
        accessToken: tokens.accessToken,
        refreshToken: null,
        expiresIn: tokens.expiresIn,
      });
    }
    return plainToInstance(TokenPairDto, tokens);
  }

  // ==================== Quên mật khẩu (§4.3c) ====================

  @Public()
  @Post('auth/forgot-password')
  @HttpCode(202)
  @ApiOperation({ summary: 'LUÔN 202 cùng response, bất kể email tồn tại hay không' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request): Promise<void> {
    await this.passwordReset.request(dto.email, req.ip ?? 'unknown');
  }

  @Public()
  @Post('auth/reset-password')
  @HttpCode(204)
  @ApiOperation({ summary: 'Đặt mật khẩu mới — thu hồi TOÀN BỘ phiên (§4.3c)' })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request): Promise<void> {
    await this.passwordReset.reset(dto.token, dto.newPassword, req.ip);
  }

  // ==================== Invitation (§4.3c) ====================

  @Public()
  @Post('auth/accept-invitation')
  @HttpCode(201)
  @ApiOperation({ summary: 'Nhận lời mời — link một lần, có hạn; user tự đặt mật khẩu' })
  async acceptInvitation(@Body() dto: AcceptInvitationDto): Promise<{ tenantId: string }> {
    return this.invitations.accept(dto);
  }

  // ==================== Me & phiên ====================

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
      roles: membership.userRoles.map((ur) => ({ code: ur.role.code, name: ur.role.name })),
      permissions: [...permissionSet].sort(),
    });
  }

  @AllowAuthenticated()
  @Get('me/sessions')
  @ApiOperation({ summary: 'Thiết bị đang đăng nhập — metadata từ DB (§4.3d)' })
  @ApiOkResponse({ type: [SessionDto] })
  async mySessions(@CurrentUser() user: AuthUser): Promise<SessionDto[]> {
    const sessions = await this.auth.getMySessions(user);
    return plainToInstance(SessionDto, sessions);
  }

  @AllowAuthenticated()
  @Delete('me/sessions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Thu hồi một phiên của chính mình' })
  async revokeMySession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.auth.revokeMySession(user, id);
  }
}
