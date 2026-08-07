import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
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
import { AuditRepository } from '../audit/audit.repository';
import { InventoryRepository } from './inventory.repository';

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
  ) {}

  @Post('receipts')
  @HttpCode(201)
  @RequirePermission('stock:receive')
  @ApiOperation({ summary: 'Nhập kho — dedup theo (refType, refId, movementType)' })
  async receive(@CurrentUser() user: AuthUser, @Body() dto: MovementDto) {
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
  async issue(@CurrentUser() user: AuthUser, @Body() dto: MovementDto) {
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
  async balances(@CurrentUser() user: AuthUser) {
    const rows = await this.repo.listBalances(user.tenantId);
    return rows.map((r) => ({
      warehouseId: r.warehouseId,
      productId: r.productId,
      lotId: r.lotId,
      onHand: r.onHand.toString(), // §3.7 — chuỗi decimal
      reserved: r.reserved.toString(),
      available: r.available.toString(),
      inTransit: r.inTransit.toString(),
      version: r.version,
    }));
  }

  @Post('warehouses')
  @HttpCode(201)
  @RequirePermission('warehouse:create')
  createWarehouse(@CurrentUser() user: AuthUser, @Body() dto: CreateWarehouseDto) {
    return this.repo.createWarehouse(user.tenantId, dto.code, dto.name);
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
