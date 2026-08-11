import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { validateEnv } from './config/env';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { ContextModule } from './infra/cls/context.module';
import { QueueModule } from './infra/queue/queue.module';
import { MailModule } from './infra/mail/mail.module';
import { CompositeAuthGuard } from './common/guards/composite-auth.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { SerializeInterceptor } from './common/interceptors/serialize.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { OrgUnitsModule } from './modules/org-units/org-units.module';
import { AdminModule } from './modules/admin/admin.module';
import { ProductsModule } from './modules/products/products.module';
import { SavedViewsModule } from './modules/saved-views/saved-views.module';
import { IdempotencyModule } from './modules/idempotency/idempotency.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { OrdersModule } from './modules/orders/orders.module';
import { CustomersModule } from './modules/customers/customers.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ImportsModule } from './modules/imports/imports.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { SettingsModule } from './modules/settings/settings.module';
import { FilesModule } from './modules/files/files.module';
import { ExportsModule } from './modules/exports/exports.module';
import { SearchModule } from './modules/search/search.module';
import { ApprovalAuthoritiesModule } from './modules/approval-authorities/approval-authorities.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { PersonalizationModule } from './modules/personalization/personalization.module';
import { S3Module } from './infra/s3/s3.module';
import { CryptoModule } from './infra/crypto/crypto.module';
import { HealthController } from './modules/health/health.controller';
import { HealthRepository } from './modules/health/health.repository';

/**
 * Vòng đời request (§4.2):
 * ClsMiddleware (traceId, locale, timezone — chuỗi resolve §3.1c)
 *   → CompositeAuthGuard (token → CLS: tenantId, userId…)
 *   → PermissionGuard (@RequirePermission + nạp permissionSet)
 *   → ValidationPipe (main.ts)
 *   → Controller → Service
 *   → SerializeInterceptor (field-level §4.4c)
 *   → AllExceptionsFilter (hình dạng lỗi §3.6)
 */
@Module({
  imports: [
    // envFilePath: repo có ĐÚNG MỘT `.env`, ở gốc. Nest tìm theo cwd, mà cwd
    // của API là `apps/api` — không có `.env` ở đó và cũng không nên có (hai
    // bản lệch nhau là chuyện sớm muộn). Xem tools/with-env.mjs, F-15.
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['../../.env', '.env'],
    }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req: Request) => {
          // X-Request-Id: header → server tự sinh; LUÔN trả lại (§3.1c)
          const traceId = (req.headers['x-request-id'] as string) || randomUUID();
          cls.set('traceId', traceId);
          // Locale: header → Accept-Language → (user/tenant preference GĐ3) → vi
          const locale =
            (req.headers['x-locale'] as string) ||
            req.headers['accept-language']?.split(',')[0]?.split('-')[0] ||
            'vi';
          cls.set('locale', ['vi', 'en'].includes(locale) ? locale : 'vi');
          // Timezone: header → (preference GĐ3) → Asia/Ho_Chi_Minh
          cls.set(
            'timezone',
            (req.headers['x-timezone'] as string) || 'Asia/Ho_Chi_Minh',
          );
        },
      },
    }),
    ContextModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    MailModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RolesModule,
    OrgUnitsModule,
    AdminModule,
    ProductsModule,
    SavedViewsModule,
    IdempotencyModule,
    OutboxModule,
    OrdersModule,
    CustomersModule,
    InventoryModule,
    ImportsModule,
    ReportsModule,
    NotificationsModule,
    CalendarModule,
    SettingsModule,
    S3Module,
    CryptoModule,
    FilesModule,
    ExportsModule,
    SearchModule,
    ApprovalAuthoritiesModule,
    WebhooksModule,
    PersonalizationModule,
  ],
  controllers: [HealthController],
  providers: [
    HealthRepository,
    { provide: APP_GUARD, useClass: CompositeAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: SerializeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(_consumer: MiddlewareConsumer): void {
    // ClsModule mount middleware tự động (mount: true)
  }
}
