import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, IsUrl, MinLength } from 'class-validator';
import { AUDIT_ACTIONS } from '@nexus/shared';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/errors/app.exception';
import { AuditRepository } from '../audit/audit.repository';
import { WebhooksRepository } from './webhooks.repository';

class CreateEndpointDto {
  @ApiProperty({ example: 'https://example.com/hooks/nexus' })
  @IsUrl({ require_tld: false }) // dev/test dùng localhost
  url!: string;
}

class SubscribeDto {
  @ApiProperty({ example: 'ORDER_APPROVED' })
  @IsString()
  @MinLength(1)
  eventType!: string;
}

/**
 * [OPT ưu tiên cao] GĐ10 — webhook framework (§5C.5).
 * Secret: API trả plaintext DUY NHẤT lúc tạo/rotate (§4.11 — GET không bao giờ trả).
 */
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly repo: WebhooksRepository,
    private readonly audit: AuditRepository,
  ) {}

  @Get('endpoints')
  @RequirePermission('webhook:manage')
  @ApiOperation({ summary: 'Danh sách endpoint — KHÔNG chứa secret' })
  listEndpoints() {
    return this.repo.listEndpoints();
  }

  @Post('endpoints')
  @HttpCode(201)
  @RequirePermission('webhook:manage')
  @ApiOperation({ summary: 'Đăng ký endpoint — secret trả MỘT LẦN duy nhất' })
  async createEndpoint(@CurrentUser() user: AuthUser, @Body() dto: CreateEndpointDto) {
    const created = await this.repo.createEndpoint(user.tenantId, dto.url);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'WebhookEndpoint',
      entityId: created.id,
      action: AUDIT_ACTIONS.CREATE,
      after: { url: dto.url }, // KHÔNG log secret
    });
    return created;
  }

  @Post('endpoints/:id/subscriptions')
  @HttpCode(201)
  @RequirePermission('webhook:manage')
  @ApiOperation({ summary: 'Đăng ký loại sự kiện cho endpoint' })
  subscribe(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubscribeDto,
  ) {
    return this.repo.subscribe(user.tenantId, id, dto.eventType);
  }

  @Post('endpoints/:id/rotate-secret')
  @RequirePermission('webhook:manage')
  @ApiOperation({ summary: 'Rotate secret — secret cũ CÒN hiệu lực song song (§5C.5)' })
  async rotate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const rotated = await this.repo.rotateSecret(id);
    if (!rotated) throw new AppException('COMMON.NOT_FOUND');
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'WebhookEndpoint',
      entityId: id,
      action: AUDIT_ACTIONS.SECRET_ROTATED,
    });
    return rotated;
  }

  @Post('endpoints/:id/enable')
  @RequirePermission('webhook:manage')
  @ApiOperation({ summary: 'Bật lại endpoint đã tự tắt vì lỗi liên tiếp' })
  async enable(@Param('id', ParseUUIDPipe) id: string) {
    const count = await this.repo.reEnable(id);
    if (count === 0) throw new AppException('COMMON.NOT_FOUND');
    return { ok: true };
  }

  @Get('deliveries')
  @RequirePermission('webhook:manage')
  @ApiOperation({ summary: 'Delivery log đầy đủ (§5C.5)' })
  listDeliveries(@Query('endpointId') endpointId?: string) {
    return this.repo.listDeliveries(endpointId);
  }

  @Post('deliveries/:id/replay')
  @RequirePermission('webhook:manage')
  @ApiOperation({ summary: 'Replay thủ công một delivery (§5C.5)' })
  async replay(@Param('id', ParseUUIDPipe) id: string) {
    const count = await this.repo.replay(id);
    if (count === 0) throw new AppException('COMMON.NOT_FOUND');
    return { ok: true };
  }
}
