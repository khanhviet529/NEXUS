import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsIn, IsOptional } from 'class-validator';
import type { Response } from 'express';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/errors/app.exception';
import { AbilityService } from '../auth/ability.service';
import { ImportsRepository } from './imports.repository';
import { ExportStreamRepository } from '../exports/export-stream.repository';

class ImportProductsDto {
  @ApiProperty({
    type: [Object],
    example: [{ code: 'SP100', nameVi: 'Hàng nhập', baseUom: 'CAI', costPrice: '1000' }],
    description: 'GĐ6 nhận rows trực tiếp; GĐ7 thêm luồng file S3 presigned (§4.7 bước 1-2)',
  })
  @IsArray()
  @ArrayNotEmpty()
  rows!: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ enum: ['partial-success', 'all-or-nothing'], default: 'partial-success' })
  @IsOptional()
  @IsIn(['partial-success', 'all-or-nothing'])
  mode?: string;

  @ApiPropertyOptional({ enum: ['skip', 'replace', 'fill-empty-only'], default: 'skip' })
  @IsOptional()
  @IsIn(['skip', 'replace', 'fill-empty-only'])
  onDuplicate?: string;
}

@ApiTags('imports')
@Controller()
export class ImportsController {
  constructor(
    private readonly imports: ImportsRepository,
    private readonly exports: ExportStreamRepository,
    private readonly ability: AbilityService,
  ) {}

  @Post('products/import')
  @HttpCode(202)
  @RequirePermission('product:import')
  @ApiOperation({ summary: 'Tạo import job — xử lý theo batch + checkpoint (§4.7, #27)' })
  async importProducts(@CurrentUser() user: AuthUser, @Body() dto: ImportProductsDto) {
    const job = await this.imports.createJob({
      tenantId: user.tenantId,
      entity: 'Product',
      mode: dto.mode,
      onDuplicate: dto.onDuplicate,
      rows: dto.rows,
      createdById: user.sub,
    });
    // Prod: enqueue IMPORT_RUN; test gọi process() trực tiếp (at-least-once)
    return { jobId: job.id, totalRows: job.totalRows };
  }

  @Get('import-jobs/:id')
  @RequirePermission('product:import')
  async jobStatus(@CurrentUser() _user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const job = await this.imports.findJob(id);
    if (!job) throw new AppException('COMMON.NOT_FOUND');
    return {
      id: job.id,
      status: job.status,
      totalRows: job.totalRows,
      validRows: job.validRows,
      errorRows: job.errorRows,
      lastProcessedRow: job.lastProcessedRow,
    };
  }

  @Get('import-jobs/:id/errors')
  @RequirePermission('product:import')
  @ApiOperation({ summary: 'Lỗi TỪNG DÒNG (§4.7) — file lỗi che field theo quyền người tải' })
  async jobErrors(@CurrentUser() _user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    // Không kiểm job thì id của tenant khác trả `[]` với mã 200 — trong khi
    // `GET /import-jobs/:id` cùng id lại trả 404. Hai mã khác nhau cho cùng
    // một sự thật là chỗ để suy ra sự tồn tại (§3.6).
    const job = await this.imports.findJob(id);
    if (!job) throw new AppException('COMMON.NOT_FOUND');
    return this.imports.listErrors(id);
  }

  @Post('products/export')
  @RequirePermission('product:export')
  @ApiOperation({
    summary: 'Export CSV STREAMING (§5B.3/C1, #26) — cột nhạy cảm loại theo quyền (§4.4c)',
  })
  async exportProducts(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const ability = await this.ability.forUser(user);
    const includeCost = ability.grantedFieldGroups().has('cost'); // §4.4c nơi 2
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
    await this.exports.streamProductsCsv(user.tenantId, res, { includeCost });
    res.end();
  }
}
