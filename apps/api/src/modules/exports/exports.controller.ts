import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { v7 as uuidv7 } from 'uuid';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { QueueService } from '../../infra/queue/queue.service';
import { AbilityService } from '../auth/ability.service';
import type { ExportJobPayload } from './exports.service';

/**
 * [CORE] GĐ7f — export qua queue (§4.7). API CHỈ enqueue — worker chạy.
 * Field-level chốt tại thời điểm enqueue theo quyền NGƯỜI YÊU CẦU (§4.4c nơi 2).
 * (POST /products/export đồng bộ của GĐ6 giữ nguyên cho file nhỏ + test #26.)
 */
@ApiTags('exports')
@Controller('exports')
export class ExportsController {
  constructor(
    private readonly queue: QueueService,
    private readonly ability: AbilityService,
  ) {}

  @Post('products')
  @HttpCode(202)
  @RequirePermission('product:export')
  @ApiOperation({ summary: 'Enqueue export products → S3 → notification kèm fileId' })
  async exportProducts(@CurrentUser() user: AuthUser) {
    const ability = await this.ability.forUser(user);
    const payload: ExportJobPayload = {
      tenantId: user.tenantId,
      userId: user.sub,
      membershipId: user.membershipId,
      entity: 'products',
      includeCost: ability.grantedFieldGroups().has('cost'),
      jobId: uuidv7(),
    };
    await this.queue.add('EXPORT_RUN', payload);
    return { queued: true, jobId: payload.jobId };
  }
}
