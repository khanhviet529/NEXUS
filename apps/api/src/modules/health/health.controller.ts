import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { HealthRepository } from './health.repository';

/**
 * [CORE] Health check — §9: CD dựa vào endpoint này để quyết ROLLBACK.
 *
 * Vì vậy nó phải kiểm THẬT phụ thuộc, không chỉ chứng minh tiến trình còn
 * sống. Trả 200 trong khi mất DB là kiểu "xanh giả" nguy hiểm nhất: rollback
 * không kích hoạt và hệ thống đứng im với bản lỗi.
 *
 * Trả 503 khi có thành phần hỏng để load balancer rút instance khỏi vòng quay.
 */
@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly health: HealthRepository) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Liveness + readiness — CD dùng để quyết rollback (§9)' })
  @ApiOkResponse({
    schema: { example: { status: 'ok', db: true, redis: true, version: 'abc123' } },
  })
  async check() {
    const { db, redis } = await this.health.check();
    const body = {
      status: db && redis ? 'ok' : 'degraded',
      db,
      redis,
      version: process.env.BUILD_VERSION ?? 'dev',
    };
    // 503 để LB rút instance; CD thấy health fail → rollback
    if (!db || !redis) throw new ServiceUnavailableException(body);
    return body;
  }
}
