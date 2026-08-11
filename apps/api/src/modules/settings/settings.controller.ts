import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { Allow, IsString, Matches, MaxLength } from 'class-validator';
import { AUDIT_ACTIONS } from '@nexus/shared';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditRepository } from '../audit/audit.repository';
import { SettingsRepository } from './settings.repository';

export class SettingDto {
  @ApiProperty() @Expose() key!: string;
  @ApiProperty({ type: Object }) @Expose() value!: unknown;
  @ApiProperty({ enum: ['tenant', 'global'], description: 'tenant = override; global = mặc định hệ thống' })
  @Expose()
  scope!: 'tenant' | 'global';
}

class UpdateSettingDto {
  @ApiProperty({ example: 'invoice.prefix' })
  @IsString()
  @MaxLength(128)
  @Matches(/^[a-z][a-z0-9._-]*$/i, { message: 'key: chữ/số/._- , bắt đầu bằng chữ' })
  key!: string;

  @ApiProperty({ type: Object, description: 'Giá trị JSON bất kỳ' })
  @Allow() // whitelist:true strip field không decorator — Allow = hợp lệ, không validate
  value!: unknown;
}

/**
 * V12 — lấp lỗ ma trận §2.5: GET/PATCH /settings có quyền seed từ GĐ3
 * nhưng CHƯA TỪNG có endpoint. Settings là bảng security-critical (§4.9):
 * trigger DB ghi audit độc lập + app-level audit ở đây.
 */
@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly repo: SettingsRepository,
    private readonly audit: AuditRepository,
  ) {}

  @Get()
  @RequirePermission('setting:read')
  @ApiOperation({ summary: 'Cấu hình đã MERGE: override tenant thắng mặc định global (§6.4)' })
  @ApiOkResponse({ type: [SettingDto] })
  list(@CurrentUser() user: AuthUser) {
    return this.repo.listResolved(user.tenantId);
  }

  @Patch()
  @RequirePermission('setting:update')
  @ApiOperation({
    summary: 'Upsert override CỦA TENANT — không đụng dòng global (TC-1 §3C đã siết)',
  })
  @ApiOkResponse({ type: SettingDto })
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingDto): Promise<SettingDto> {
    const row = await this.repo.upsertTenantValue(user.tenantId, dto.key, dto.value);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'Setting',
      entityId: row.id,
      action: AUDIT_ACTIONS.UPDATE,
      after: { key: dto.key, value: dto.value },
    });
    return { key: row.key, value: row.value, scope: 'tenant' };
  }
}
