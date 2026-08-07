import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { PermissionResolverService } from './permission-resolver.service';
import { PermissionSyncService } from './permission-sync.service';
import { TokenService } from './token.service';
import { SessionService } from './session.service';
import { RateLimitService } from './rate-limit.service';
import { PasswordResetService } from './password-reset.service';
import { InvitationService } from './invitation.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    PermissionResolverService,
    PermissionSyncService,
    TokenService,
    SessionService,
    RateLimitService,
    PasswordResetService,
    InvitationService,
  ],
  exports: [PermissionResolverService, SessionService, InvitationService, PasswordResetService],
})
export class AuthModule {}
