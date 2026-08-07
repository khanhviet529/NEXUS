import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { Request, Response } from 'express';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { buildMeta } from '../../common/dto/paginated.dto';
import { FilterParser, parseSort } from '../../common/query/filter-parser';
import type { QueryConfig } from '../../common/query/query-config';
import type { Locale } from '../../common/query/localized';
import { RequestContextService } from '../../infra/cls/request-context';
import { AbilityService } from '../auth/ability.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { OrdersService } from './orders.service';

const ORDER_QUERY: QueryConfig = {
  filterable: {
    code: { kind: 'string' },
    status: { kind: 'enum' },
    customerId: { kind: 'string' },
    total: { kind: 'number' },
    createdAt: { kind: 'date' },
  },
  sortable: ['code', 'status', 'total', 'createdAt'],
  quickSearch: ['code'],
  defaultSort: '-createdAt',
};

class OrderItemInputDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: '2' })
  @IsString()
  quantity!: string;

  @ApiProperty({ example: '100000.00', description: 'Chuỗi decimal (§3.7)' })
  @IsString()
  unitPrice!: string;

  @ApiPropertyOptional({ example: '10' })
  @IsOptional()
  @IsString()
  discountPercent?: string;

  @ApiPropertyOptional({ example: '8' })
  @IsOptional()
  @IsString()
  taxRate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  uom?: string;
}

class CreateOrderDto {
  @ApiProperty()
  @IsUUID()
  customerId!: string;

  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];
}

class UpdateOrderDto {
  @ApiProperty({ description: 'Optimistic locking (§4.5)' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];
}

class TransitionDto {
  @ApiProperty({ description: 'Optimistic locking (§4.5)' })
  @IsInt()
  @Min(1)
  version!: number;
}

class BulkApproveDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  orderIds!: string[];
}

class ListOrdersQueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  filter?: Record<string, unknown>;
}

/** Serialize order → response (tiền là CHUỖI §3.7; margin/costPrice cần field:cost) */
function toOrderResponse(order: Record<string, unknown>, showCost: boolean) {
  const items = (order['items'] as Array<Record<string, unknown>>).map((i) => ({
    id: i['id'],
    productId: i['productId'],
    productNameSnapshot: i['productNameSnapshot'],
    quantity: String(i['quantity']),
    uom: i['uom'],
    unitPrice: String(i['unitPrice']),
    discountPercent: String(i['discountPercent']),
    taxRate: String(i['taxRate']),
    amount: String(i['amount']),
    lineNo: i['lineNo'],
    ...(showCost ? { costPrice: i['costPrice'] ? String(i['costPrice']) : null } : {}),
  }));
  return {
    id: order['id'],
    code: order['code'],
    status: order['status'],
    currency: order['currency'],
    customer: order['customer'],
    subtotal: String(order['subtotal']),
    discountTotal: String(order['discountTotal']),
    taxTotal: String(order['taxTotal']),
    total: String(order['total']),
    ...(showCost ? { margin: order['margin'] ? String(order['margin']) : null } : {}),
    version: order['version'],
    approvedAt: order['approvedAt'],
    createdById: order['createdById'],
    createdAt: order['createdAt'],
    items,
  };
}

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly idempotency: IdempotencyService,
    private readonly ability: AbilityService,
    private readonly ctx: RequestContextService,
  ) {}

  private async showCost(user: AuthUser): Promise<boolean> {
    const ability = await this.ability.forUser(user);
    return ability.grantedFieldGroups().has('cost');
  }

  @Get()
  @RequirePermission('order:read')
  async list(@CurrentUser() user: AuthUser, @Query() query: ListOrdersQueryDto, @Req() req: Request) {
    const locale = this.ctx.locale as Locale;
    const where = new FilterParser(ORDER_QUERY, locale).parse(
      req.query as Record<string, unknown>,
    );
    const orderBy = parseSort(query.sort, ORDER_QUERY, locale);
    const { data, total } = await this.orders.list(user, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
    });
    const showCost = await this.showCost(user);
    return {
      data: data.map((o) => toOrderResponse(o as unknown as Record<string, unknown>, showCost)),
      meta: buildMeta(query.page, query.limit, total),
    };
  }

  @Get(':id')
  @RequirePermission('order:read')
  async detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const order = await this.orders.detail(user, id);
    return toOrderResponse(order as unknown as Record<string, unknown>, await this.showCost(user));
  }

  @Post()
  @RequirePermission('order:create')
  @ApiOperation({ summary: 'Tạo chứng từ — POST quan trọng NHẬN Idempotency-Key (§3.9)' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'UUID do client sinh' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const showCost = await this.showCost(user);
    const handler = async () => {
      const order = await this.orders.create(user, dto);
      return {
        status: 201,
        body: toOrderResponse(order as unknown as Record<string, unknown>, showCost),
      };
    };

    if (!idempotencyKey) {
      const result = await handler();
      res.status(result.status);
      return result.body;
    }
    const result = await this.idempotency.run({
      tenantId: user.tenantId,
      key: idempotencyKey,
      operation: 'order:create',
      requestBody: dto,
      handler,
    });
    res.status(result.status);
    return result.body;
  }

  @Patch(':id')
  @RequirePermission('order:update')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
  ) {
    const order = await this.orders.update(user, id, dto);
    return toOrderResponse(order as unknown as Record<string, unknown>, await this.showCost(user));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('order:delete')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.orders.remove(user, id);
  }

  @Post('bulk-approve')
  @HttpCode(200) // 200 kể cả khi có dòng lỗi — thất bại từng dòng ≠ lỗi request (§5C.3)
  @RequirePermission('order:approve')
  @ApiOperation({ summary: 'Duyệt hàng loạt — partial success, lỗi theo từng dòng (#28)' })
  async bulkApprove(@CurrentUser() user: AuthUser, @Body() dto: BulkApproveDto) {
    return this.orders.bulkApprove(user, dto.orderIds);
  }

  // Hành động nghiệp vụ: động từ ở SUB-RESOURCE (§3.1)
  @Post(':id/submit')
  @RequirePermission('order:submit')
  async submit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionDto,
  ) {
    const order = await this.orders.submit(user, id, dto.version);
    return toOrderResponse(order as unknown as Record<string, unknown>, await this.showCost(user));
  }

  @Post(':id/approve')
  @RequirePermission('order:approve')
  async approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionDto,
  ) {
    const order = await this.orders.approve(user, id, dto.version);
    return toOrderResponse(order as unknown as Record<string, unknown>, await this.showCost(user));
  }

  @Post(':id/reject')
  @RequirePermission('order:approve')
  async reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionDto,
  ) {
    const order = await this.orders.reject(user, id, dto.version);
    return toOrderResponse(order as unknown as Record<string, unknown>, await this.showCost(user));
  }
}
