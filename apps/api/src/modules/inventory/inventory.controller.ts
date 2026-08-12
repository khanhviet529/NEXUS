import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { AUDIT_ACTIONS } from '@nexus/shared';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequestContextService } from '../../infra/cls/request-context';
import { SUPPORTED_LOCALES, resolveLocalizedValue, type Locale } from '../../common/query/localized';
import { AuditRepository } from '../audit/audit.repository';
import { InventoryRepository } from './inventory.repository';

export class MovementResultDto {
  @ApiProperty() @Expose() movementId!: string;
  @ApiProperty({ description: 'true = retry của chứng từ đã ghi — không tạo dòng mới (#23)' })
  @Expose()
  duplicate!: boolean;
}

export class WarehouseDto {
  @ApiProperty() @Expose() id!: string;
  @ApiProperty() @Expose() code!: string;
  @ApiProperty() @Expose() name!: string;
}

export class StockBalanceDto {
  @ApiProperty() @Expose() warehouseId!: string;
  @ApiProperty() @Expose() warehouseCode!: string;
  @ApiProperty() @Expose() productId!: string;
  @ApiProperty() @Expose() productCode!: string;
  @ApiProperty({ description: 'ĐÃ resolve theo locale (§3.10)' }) @Expose() productName!: string;
  @ApiProperty() @Expose() lotId!: string;
  @ApiProperty({ description: 'Chuỗi decimal (§3.7)' }) @Expose() onHand!: string;
  @ApiProperty() @Expose() reserved!: string;
  @ApiProperty() @Expose() available!: string;
  @ApiProperty() @Expose() inTransit!: string;
  @ApiProperty() @Expose() version!: number;
}

class MovementDto {
  @ApiProperty()
  @IsUUID()
  warehouseId!: string;

  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({ description: 'Bỏ trống với hàng tracking NONE (sentinel #59)' })
  @IsOptional()
  @IsUUID()
  lotId?: string;

  @ApiProperty({ example: '5', description: 'Chuỗi decimal, đơn vị CƠ SỞ (ADR-0003)' })
  @IsString()
  quantity!: string;

  @ApiProperty({ description: 'Loại chứng từ nguồn (POLY)' })
  @IsString()
  @MinLength(1)
  refType!: string;

  @ApiProperty({ description: 'Id chứng từ nguồn — cùng (refType, refId, movementType) không tạo trùng (#23)' })
  @IsUUID()
  refId!: string;

  @ApiPropertyOptional({ type: [String], description: 'SERIAL: danh sách serial id (#58)' })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  serialIds?: string[];
}

class CreateWarehouseDto {
  @ApiProperty({ example: 'KHO-A' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ example: 'Kho trung tâm' })
  @IsString()
  @MinLength(1)
  name!: string;
}

class CreateLotDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 'LOT-2026-01' })
  @IsString()
  @MinLength(1)
  lotNo!: string;
}

class CreateSerialsDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty()
  @IsUUID()
  warehouseId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  lotId?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  serialNos!: string[];
}

/**
 * [CORE nếu có kho] Tồn kho — §5B.2/B4. Movement là RAW SQL không qua
 * extension → audit ghi TƯỜNG MINH tại đây (§4.9).
 */
@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly repo: InventoryRepository,
    private readonly audit: AuditRepository,
    private readonly ctx: RequestContextService,
  ) {}

  /** Locale request (CLS §3.1c) — kẹp về union hỗ trợ, lạ thì rơi về vi */
  private get locale(): Locale {
    const raw = this.ctx.locale;
    return (SUPPORTED_LOCALES as readonly string[]).includes(raw) ? (raw as Locale) : 'vi';
  }

  @Post('receipts')
  @HttpCode(201)
  @RequirePermission('stock:receive')
  @ApiOperation({ summary: 'Nhập kho — dedup theo (refType, refId, movementType)' })
  @ApiOkResponse({ type: MovementResultDto })
  async receive(
    @CurrentUser() user: AuthUser,
    @Body() dto: MovementDto,
  ): Promise<MovementResultDto> {
    const result = await this.repo.receive({
      tenantId: user.tenantId,
      ...dto,
      movementType: 'RECEIPT',
      actorId: user.sub,
    });
    if (!result.duplicate) {
      await this.audit.write({
        tenantId: user.tenantId,
        entity: 'Movement',
        entityId: result.movementId,
        action: AUDIT_ACTIONS.CREATE,
        after: { type: 'RECEIPT', ...dto },
      });
    }
    return result;
  }

  @Post('issues')
  @HttpCode(201)
  @RequirePermission('stock:issue')
  @ApiOperation({
    summary: 'Xuất kho — thuật toán 4 bước: không âm tồn, retry không trùng (§5B.2/B4)',
  })
  @ApiOkResponse({ type: MovementResultDto })
  async issue(
    @CurrentUser() user: AuthUser,
    @Body() dto: MovementDto,
  ): Promise<MovementResultDto> {
    const result = await this.repo.issue({
      tenantId: user.tenantId,
      ...dto,
      movementType: 'ISSUE',
      actorId: user.sub,
    });
    if (!result.duplicate) {
      await this.audit.write({
        tenantId: user.tenantId,
        entity: 'Movement',
        entityId: result.movementId,
        action: AUDIT_ACTIONS.CREATE,
        after: { type: 'ISSUE', ...dto },
      });
    }
    return result;
  }

  @Get('balances')
  @RequirePermission('stock:read')
  @ApiOperation({ summary: 'Số dư tồn — nhãn kho/sản phẩm ĐÃ resolve để FE hiển thị (4b)' })
  @ApiOkResponse({ type: [StockBalanceDto] })
  async balances(@CurrentUser() user: AuthUser): Promise<StockBalanceDto[]> {
    const rows = await this.repo.listBalances(user.tenantId);
    // StockBalance là bảng raw-SQL không relation Prisma → tra nhãn theo lô id
    const [warehouses, products] = await Promise.all([
      this.repo.listWarehouses(user.tenantId),
      this.repo.findProductRefs([...new Set(rows.map((r) => r.productId))]),
    ]);
    const whById = new Map(warehouses.map((w) => [w.id, w]));
    const prodById = new Map(products.map((p) => [p.id, p]));
    return rows.map((r) => {
      const product = prodById.get(r.productId);
      return {
        warehouseId: r.warehouseId,
        warehouseCode: whById.get(r.warehouseId)?.code ?? r.warehouseId.slice(0, 8),
        productId: r.productId,
        productCode: product?.code ?? r.productId.slice(0, 8),
        productName: resolveLocalizedValue(product?.name, this.locale) ?? product?.code ?? '',
        lotId: r.lotId,
        onHand: r.onHand.toString(), // §3.7 — chuỗi decimal
        reserved: r.reserved.toString(),
        available: r.available.toString(),
        inTransit: r.inTransit.toString(),
        version: r.version,
      };
    });
  }

  @Get('warehouses')
  @RequirePermission('stock:read')
  @ApiOperation({ summary: 'Danh sách kho — select của form nhập/xuất (4b)' })
  @ApiOkResponse({ type: [WarehouseDto] })
  listWarehouses(@CurrentUser() user: AuthUser): Promise<WarehouseDto[]> {
    return this.repo.listWarehouses(user.tenantId);
  }

  @Post('warehouses')
  @HttpCode(201)
  @RequirePermission('warehouse:create')
  @ApiOkResponse({ type: WarehouseDto })
  async createWarehouse(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWarehouseDto,
  ): Promise<WarehouseDto> {
    const w = await this.repo.createWarehouse(user.tenantId, dto.code, dto.name);
    return { id: w.id, code: w.code, name: w.name };
  }

  @Post('lots')
  @HttpCode(201)
  @RequirePermission('stock:receive')
  createLot(@CurrentUser() user: AuthUser, @Body() dto: CreateLotDto) {
    return this.repo.createLot(user.tenantId, dto.productId, dto.lotNo);
  }

  @Post('serials')
  @HttpCode(201)
  @RequirePermission('stock:receive')
  createSerials(@CurrentUser() user: AuthUser, @Body() dto: CreateSerialsDto) {
    return this.repo.createSerials(user.tenantId, dto);
  }
}
