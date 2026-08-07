import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { JOB_NAMES, type JobName } from '@nexus/shared';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditRepository } from '../audit/audit.repository';
import { QueueService } from '../../infra/queue/queue.service';
import { RedisService } from '../../infra/redis/redis.service';
import { S3Service } from '../../infra/s3/s3.service';
import { CrossTenantGuard } from './admin.controller';
import { OpsRepository } from './ops.repository';

class CreateAnnouncementDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiPropertyOptional({ enum: ['INFO', 'WARNING', 'CRITICAL'], default: 'INFO' })
  @IsOptional()
  @IsIn(['INFO', 'WARNING', 'CRITICAL'])
  severity?: string;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date;

  @ApiPropertyOptional({ type: [String], description: 'Rỗng = toàn hệ thống' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  targetTenantIds?: string[];
}

class CreateMaintenanceDto {
  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  message!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Mã vai trò vẫn được vào lúc bảo trì — là DATA client gửi, không hardcode',
  })
  @IsOptional()
  @IsArray()
  allowRoles?: string[];
}

/**
 * [CORE nhẹ] GĐ9 — system operations (§5C.8). KHÔNG thay Grafana/Sentry,
 * chỉ thao tác vận hành thiết yếu. /admin/* → CrossTenantGuard + audit
 * CROSS_TENANT_ACCESS (§3.1b).
 */
@ApiTags('admin-ops')
@UseGuards(CrossTenantGuard)
@Controller('admin/ops')
export class OpsController {
  constructor(
    private readonly ops: OpsRepository,
    private readonly queue: QueueService,
    private readonly redis: RedisService,
    private readonly s3: S3Service,
    private readonly audit: AuditRepository,
  ) {}

  @Get('health')
  @RequirePermission('system:maintenance')
  @ApiOperation({ summary: 'Health DB/Redis/S3 + build + migration version (§5C.8)' })
  async health() {
    const [db, redisOk, s3Ok] = await Promise.all([
      this.ops.dbHealth(),
      this.redis.client
        .ping()
        .then(() => true)
        .catch(() => false),
      this.s3.head('__healthcheck__').then(
        () => true, // head trả null khi thiếu object nhưng KHÔNG ném khi bucket sống
        () => false,
      ),
      // backup status đọc riêng bên dưới
    ]);
    const backup = await this.ops.backupStatus();
    return {
      db: db.ok,
      redis: redisOk,
      s3: s3Ok,
      migrationVersion: db.migrationVersion,
      buildVersion: process.env.BUILD_VERSION ?? 'dev',
      lastBackupAt: backup.lastBackupAt,
    };
  }

  @Get('queues')
  @RequirePermission('system_queue:read')
  @ApiOperation({ summary: 'Số job theo trạng thái từng queue — xem queue tắc (§5C.8)' })
  async queues() {
    const out: Record<string, { waiting: number; active: number; failed: number; delayed: number }> = {};
    for (const name of Object.keys(JOB_NAMES) as JobName[]) {
      const q = this.queue.queue(name);
      const counts = await q.getJobCounts('waiting', 'active', 'failed', 'delayed');
      out[JOB_NAMES[name].queue] = {
        waiting: counts['waiting'] ?? 0,
        active: counts['active'] ?? 0,
        failed: counts['failed'] ?? 0,
        delayed: counts['delayed'] ?? 0,
      };
    }
    return out;
  }

  @Post('queues/:name/retry-failed')
  @RequirePermission('system:maintenance')
  @ApiOperation({ summary: 'Retry toàn bộ dead-letter của một queue (§5C.8)' })
  async retryFailed(@CurrentUser() user: AuthUser, @Param('name') name: string) {
    const jobName = (Object.keys(JOB_NAMES) as JobName[]).find(
      (k) => JOB_NAMES[k].queue === name || k === name,
    );
    if (!jobName) return { retried: 0 };
    const q = this.queue.queue(jobName);
    const failed = await q.getFailed(0, 500);
    for (const job of failed) await job.retry();
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'SystemQueue',
      entityId: user.tenantId,
      action: 'QUEUE_RETRY_FAILED',
      after: { queue: name, retried: failed.length },
    });
    return { retried: failed.length };
  }

  @Post('announcements')
  @HttpCode(201)
  @RequirePermission('system:maintenance')
  @ApiOperation({ summary: 'Gửi thông báo toàn hệ thống / theo tenant (§5C.8)' })
  createAnnouncement(@Body() dto: CreateAnnouncementDto) {
    return this.ops.createAnnouncement({
      title: dto.title,
      body: dto.body,
      severity: dto.severity ?? 'INFO',
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      targetTenantIds: dto.targetTenantIds ?? [],
    });
  }

  @Post('maintenance-windows')
  @HttpCode(201)
  @RequirePermission('system:maintenance')
  @ApiOperation({ summary: 'Đặt lịch bảo trì (§5C.8)' })
  createMaintenance(@Body() dto: CreateMaintenanceDto) {
    return this.ops.createMaintenanceWindow({
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      message: dto.message,
      // Vai trò là DATA (§4.4 — check no-role-branching): không default mã
      // vai trò trong code; rỗng = không ai được miễn trừ
      allowRoles: dto.allowRoles ?? [],
    });
  }

  @Delete('cache/:tenantId')
  @RequirePermission('system:maintenance')
  @ApiOperation({ summary: 'Clear cache Redis theo tenant (§5C.8) — SCAN theo prefix' })
  async clearTenantCache(@CurrentUser() user: AuthUser, @Param('tenantId') tenantId: string) {
    let cleared = 0;
    // tenantKey() dựng key dạng <prefix>:<tenantId>:... — quét mọi prefix của tenant
    const stream = this.redis.client.scanStream({ match: `*:${tenantId}:*`, count: 200 });
    for await (const keys of stream) {
      const list = keys as string[];
      if (list.length > 0) {
        cleared += await this.redis.client.del(...list);
      }
    }
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'Tenant',
      entityId: tenantId,
      action: 'CACHE_CLEARED',
      after: { cleared },
    });
    return { cleared };
  }
}

/** Thông báo hệ thống ĐANG hiệu lực cho tenant hiện hành — mọi user xem được */
@ApiTags('announcements')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly ops: OpsRepository) {}

  @AllowAuthenticated()
  @Get('active')
  @ApiOperation({ summary: 'Banner thông báo đang hiệu lực (toàn hệ thống hoặc nhắm tenant)' })
  async active(@CurrentUser() user: AuthUser) {
    const [announcements, maintenance] = await Promise.all([
      this.ops.listActiveAnnouncements(user.tenantId),
      this.ops.currentMaintenance(),
    ]);
    return {
      announcements: announcements.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        severity: a.severity,
      })),
      maintenance: maintenance ? { message: maintenance.message, endsAt: maintenance.endsAt } : null,
    };
  }
}
