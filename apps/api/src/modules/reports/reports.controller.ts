import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { Allow } from 'class-validator';
import type { Response } from 'express';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';

export class ReportSummaryDto {
  @ApiProperty({ example: 'sales-by-customer' }) @Expose() id!: string;
  @ApiProperty({ example: 'Doanh thu theo khách hàng' }) @Expose() name!: string;
}

export class ReportParamOptionDto {
  @ApiProperty() @Expose() value!: string;
  @ApiProperty() @Expose() label!: string;
}

/**
 * Union ĐÓNG 4 loại (A1) — thêm loại mới phải sửa `ReportParamType` ở BE
 * trước, orval sinh lại, switch của FE đỏ compile. Đó là ranh giới
 * chống form-builder: FE KHÔNG render loại nó không biết.
 */
export class ReportParamDefDto {
  @ApiProperty() @Expose() key!: string;
  @ApiProperty({ enum: ['dateRange', 'select', 'orgUnit', 'text'] })
  @Expose()
  type!: 'dateRange' | 'select' | 'orgUnit' | 'text';

  @ApiProperty() @Expose() label!: string;
  @ApiPropertyOptional() @Expose() required?: boolean;
  @ApiPropertyOptional({ type: [ReportParamOptionDto] })
  @Expose()
  @Type(() => ReportParamOptionDto)
  options?: ReportParamOptionDto[];
}

export class ReportColumnDefDto {
  @ApiProperty() @Expose() key!: string;
  @ApiProperty() @Expose() label!: string;
  @ApiPropertyOptional({ enum: ['text', 'money', 'number', 'date'] })
  @Expose()
  type?: 'text' | 'money' | 'number' | 'date';

  @ApiPropertyOptional({ enum: ['sum', 'count', 'avg'] })
  @Expose()
  summary?: 'sum' | 'count' | 'avg';
}

export class ReportMetaDto {
  @ApiProperty() @Expose() id!: string;
  @ApiProperty() @Expose() name!: string;
  @ApiProperty({ type: [ReportParamDefDto] })
  @Expose()
  @Type(() => ReportParamDefDto)
  params!: ReportParamDefDto[];

  @ApiProperty({ type: [ReportColumnDefDto], description: 'ĐÃ lọc field-level (§4.4c nơi 3)' })
  @Expose()
  @Type(() => ReportColumnDefDto)
  columns!: ReportColumnDefDto[];
}

export class ReportRunResultDto {
  @ApiProperty({ type: [ReportColumnDefDto] })
  @Expose()
  @Type(() => ReportColumnDefDto)
  columns!: ReportColumnDefDto[];

  @ApiProperty({ type: [Object] }) @Expose() rows!: Array<Record<string, unknown>>;
  @ApiProperty({ type: Object, description: 'Dòng tổng theo cột có summary (§5.5)' })
  @Expose()
  summary!: Record<string, string>;

  @ApiProperty({
    type: [String],
    nullable: true,
    description: 'Song song với rows — href drill-down hoặc null',
  })
  @Expose()
  drilldowns!: Array<string | null>;

  @ApiProperty() @Expose() cached!: boolean;
}

class RunReportDto {
  @ApiProperty({ type: Object, description: 'key → giá trị theo ReportParamDefDto' })
  @Allow() // whitelist:true strip field không decorator (bài học V12)
  params!: Record<string, unknown>;
}

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
  @ApiOkResponse({ type: [ReportSummaryDto] })
  list(@CurrentUser() user: AuthUser): Promise<ReportSummaryDto[]> {
    return this.reports.listForUser(user);
  }

  @AllowAuthenticated()
  @Get(':id/meta')
  @ApiOperation({ summary: 'Định nghĩa params + columns (đã lọc field-level) để FE sinh form' })
  @ApiOkResponse({ type: ReportMetaDto })
  meta(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ReportMetaDto> {
    return this.reports.meta(user, id);
  }

  @AllowAuthenticated()
  @Post(':id/run')
  @ApiOperation({
    summary: 'Chạy báo cáo — scope nhúng trong query, cache theo (tenant, scope, params)',
  })
  @ApiOkResponse({ type: ReportRunResultDto })
  run(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: RunReportDto,
  ): Promise<ReportRunResultDto> {
    return this.reports.run(user, id, body.params ?? {});
  }

  @AllowAuthenticated()
  @Post(':id/export')
  @ApiOperation({ summary: 'Export CSV — cùng đường lọc cột với run (§4.4c nơi 2+3)' })
  async export(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: RunReportDto,
    @Res() res: Response,
  ) {
    const csv = await this.reports.exportCsv(user, id, body.params ?? {});
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${id}.csv"`);
    res.send(csv);
  }
}
