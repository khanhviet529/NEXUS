import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import type { Request } from 'express';
import { AUDIT_ACTIONS } from '@nexus/shared';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/errors/app.exception';
import { buildMeta, PaginationMetaDto } from '../../common/dto/paginated.dto';
import { toDto } from '../../common/serialization/to-dto';
import { FilterParser, parseSort } from '../../common/query/filter-parser';
import type { QueryConfig } from '../../common/query/query-config';
import {
  resolveLocalizedValue,
  type Locale,
  type LocalizedText,
} from '../../common/query/localized';
import { RequestContextService } from '../../infra/cls/request-context';
import { AbilityService } from '../auth/ability.service';
import { AuditRepository } from '../audit/audit.repository';
import { ProductsRepository } from './products.repository';

/**
 * [REF] Module danh mục mẫu — khuôn cho generator GĐ9.
 * Whitelist khai TẬP TRUNG (§3.4/§3.5): chỉ cột ĐÃ CÓ INDEX.
 */
const PRODUCT_QUERY: QueryConfig = {
  filterable: {
    code: { kind: 'string' },
    name: { kind: 'localized' },
    baseUom: { kind: 'enum' },
    trackingType: { kind: 'enum' },
    createdAt: { kind: 'date' },
    costPrice: { kind: 'number' }, // bị LOẠI nếu thiếu field:cost (§4.4c)
  },
  sortable: ['code', 'name', 'createdAt', 'costPrice'],
  quickSearch: ['code', 'nameViSearch', 'nameEnSearch'],
  defaultSort: '-createdAt',
};

class ProductResponseDto {
  @ApiProperty() @Expose() id!: string;
  @ApiProperty() @Expose() code!: string;
  /** §3.10: response ĐÃ resolve theo locale, không trả cả object */
  @ApiProperty() @Expose() name!: string | null;
  @ApiProperty() @Expose() baseUom!: string;
  @ApiProperty() @Expose() trackingType!: string;
  /** §4.4c group cost — chuỗi decimal (§3.7) */
  @ApiPropertyOptional({ nullable: true, type: String })
  @Expose({ groups: ['cost'] })
  costPrice!: string | null;
  @ApiProperty() @Expose() version!: number;
  @ApiProperty() @Expose() createdAt!: Date;
}

class ProductListDto {
  @ApiProperty({ type: [ProductResponseDto] })
  @Expose()
  @Type(() => ProductResponseDto)
  data!: ProductResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  @Expose()
  @Type(() => PaginationMetaDto)
  meta!: PaginationMetaDto;
}

class ListProductsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ example: '-createdAt,name' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  /** filter[field][op]=value (§3.5) — FilterParser validate nội dung + whitelist */
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  filter?: Record<string, unknown>;
}

class UpsertProductDto {
  @ApiProperty({ example: 'SP001' })
  @IsString()
  @MinLength(1)
  code!: string;

  /** §3.10: nhập nhận TOÀN BỘ object đa ngôn ngữ — DTO tách khỏi response */
  @ApiProperty({ example: { vi: 'Áo thun cotton', en: 'Cotton T-shirt' } })
  @IsObject()
  @IsNotEmptyObject()
  name!: LocalizedText;

  @ApiProperty({ example: 'CAI' })
  @IsString()
  baseUom!: string;

  @ApiPropertyOptional({ enum: ['NONE', 'LOT', 'SERIAL'], default: 'NONE' })
  @IsOptional()
  @IsIn(['NONE', 'LOT', 'SERIAL'])
  trackingType?: string;

  @ApiPropertyOptional({ description: 'Chuỗi decimal — cần field:cost để xem lại' })
  @IsOptional()
  @IsString()
  costPrice?: string;
}

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly repo: ProductsRepository,
    private readonly ability: AbilityService,
    private readonly ctx: RequestContextService,
    private readonly audit: AuditRepository,
  ) {}

  private toResponse(row: Record<string, unknown>, locale: Locale) {
    return {
      ...row,
      name: resolveLocalizedValue(row['name'], locale), // nơi 1/4 của #51
      costPrice: (row['costPrice'] as { toString(): string } | null)?.toString() ?? null,
    };
  }

  @Get()
  @RequirePermission('product:read')
  @ApiOperation({ summary: '[REF] Danh sách — filter DSL §3.5, sort §3.4, locale §3.10' })
  @ApiOkResponse({ type: ProductListDto })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListProductsQueryDto,
    @Req() req: Request,
  ): Promise<ProductListDto> {
    const locale = this.ctx.locale as Locale;
    const ability = await this.ability.forUser(user);
    // §4.4c: field nhạy cảm bị LOẠI khỏi filter/sort khi thiếu quyền
    const forbidden = new Set(
      ability.grantedFieldGroups().has('cost') ? [] : ['costPrice'],
    );

    const where = new FilterParser(PRODUCT_QUERY, locale, forbidden).parse(
      req.query as Record<string, unknown>,
    );
    const orderBy = parseSort(query.sort, PRODUCT_QUERY, locale, forbidden);

    const { data, total } = await this.repo.list({
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
    });
    return toDto(ProductListDto, {
      data: data.map((r) => this.toResponse(r as Record<string, unknown>, locale)),
      meta: buildMeta(query.page, query.limit, total),
    });
  }

  @Get(':id')
  @RequirePermission('product:read')
  @ApiOkResponse({ type: ProductResponseDto })
  async detail(
    @CurrentUser() _user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductResponseDto> {
    const row = await this.repo.findById(id);
    if (!row) throw new AppException('COMMON.NOT_FOUND');
    return toDto(ProductResponseDto, this.toResponse(row as Record<string, unknown>, this.ctx.locale as Locale));
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('product:create')
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertProductDto,
  ): Promise<ProductResponseDto> {
    if (!dto.name.vi) {
      // §3.10: DB không ép được "phải có tiếng Việt" → validate ở đây
      throw new AppException('COMMON.VALIDATION_FAILED', {
        details: { 'name.vi': ['Bắt buộc có tên tiếng Việt (locale gốc)'] },
      });
    }
    const row = await this.repo.create(user.tenantId, dto);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'Product',
      entityId: row.id,
      action: AUDIT_ACTIONS.CREATE,
      after: { code: dto.code, name: dto.name },
    });
    return toDto(ProductResponseDto, this.toResponse(row as Record<string, unknown>, this.ctx.locale as Locale));
  }

  @Patch(':id')
  @RequirePermission('product:update')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<UpsertProductDto> & { version: number },
  ): Promise<ProductResponseDto> {
    // Kiểm tồn-tại-trong-phạm-vi TRƯỚC, đúng khuôn module [REF] orders
    // (`getInScope` rồi mới tới nghiệp vụ). Thiếu bước này thì id của tenant
    // khác cho ra 409 VERSION_CONFLICT — sai §3.6 (phải 404) và còn gây hiểu
    // nhầm: người dùng tưởng ai đó vừa sửa bản ghi.
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppException('COMMON.NOT_FOUND');

    const affected = await this.repo.update(id, dto.version, dto);
    if (affected.count === 0) throw new AppException('COMMON.VERSION_CONFLICT');
    const row = await this.repo.findById(id);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'Product',
      entityId: id,
      action: AUDIT_ACTIONS.UPDATE,
      after: { name: dto.name, costPrice: dto.costPrice },
    });
    return toDto(ProductResponseDto, this.toResponse(row as Record<string, unknown>, this.ctx.locale as Locale));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('product:delete')
  @ApiOperation({ summary: 'Xoá — delete guard A2: đang được tham chiếu → 409 kèm nguồn' })
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    // Tồn-tại-trong-phạm-vi kiểm TRƯỚC: `softDelete` gọi thẳng `update` nên id
    // của tenant khác làm Prisma ném P2025 → 500. §3.6 đòi 404, và 500 ở đây
    // còn đẩy một tình huống bình thường vào Sentry. Test U6 bắt được.
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppException('COMMON.NOT_FOUND');

    // A2 (§5B.1): đếm tham chiếu TRƯỚC, trả danh sách có link — không phải
    // thông báo chung chung, càng không phải 500 foreign key violation
    const references = await this.repo.countReferences(id);
    if (references.length > 0) {
      throw new AppException('COMMON.HAS_REFERENCES', { details: { references } });
    }
    await this.repo.softDelete(id);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'Product',
      entityId: id,
      action: AUDIT_ACTIONS.DELETE,
    });
  }
}
