import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';

/**
 * [CORE] A1 endpoints — sinh tự động cho MỌI báo cáo trong registry.
 * Quyền kiểm THEO TỪNG report (def.permission) trong service —
 * controller dùng @AllowAuthenticated vì danh sách/quyền là động.
 */
@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @AllowAuthenticated()
  @Get()
  @ApiOperation({ summary: 'Báo cáo user CÓ QUYỀN xem — menu Báo cáo tự đăng ký (A1)' })
  list(@CurrentUser() user: AuthUser) {
    return this.reports.listForUser(user);
  }

  @AllowAuthenticated()
  @Get(':id/meta')
  @ApiOperation({ summary: 'Định nghĩa params + columns (đã lọc field-level) để FE sinh form' })
  meta(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reports.meta(user, id);
  }

  @AllowAuthenticated()
  @Post(':id/run')
  @ApiOperation({
    summary: 'Chạy báo cáo — scope nhúng trong query, cache theo (tenant, scope, params)',
  })
  run(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { params: Record<string, unknown> },
  ) {
    return this.reports.run(user, id, body.params ?? {});
  }

  @AllowAuthenticated()
  @Post(':id/export')
  @ApiOperation({ summary: 'Export CSV — cùng đường lọc cột với run (§4.4c nơi 2+3)' })
  async export(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { params: Record<string, unknown> },
    @Res() res: Response,
  ) {
    const csv = await this.reports.exportCsv(user, id, body.params ?? {});
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${id}.csv"`);
    res.send(csv);
  }
}
