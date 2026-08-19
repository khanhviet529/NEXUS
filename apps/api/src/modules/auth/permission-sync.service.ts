import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PERMISSIONS } from '@nexus/shared';
import { AuthRepository } from './auth.repository';
import { PermissionResolverService } from './permission-resolver.service';

/**
 * [CORE] Sync permission registry → DB lúc khởi động — spec §4.4 quy tắc 1.
 * Không seed tay, không sửa trực tiếp DB. Write đi qua repository (§4.9).
 *
 * Chỉ upsert, KHÔNG xoá code thừa tự động (xoá permission đang được
 * role_permissions tham chiếu là việc phải làm có chủ đích qua migration).
 *
 * F11 (C1): sau upsert, AUTO-GRANT quyền MỚI cho TENANT_ADMIN của MỌI tenant.
 * Không có bước này thì quyền của module mới rơi vào khoá chết: chưa ai có →
 * không ai cấp được qua UI (luật §2.3 "không cấp quyền mình không có") →
 * đường duy nhất là sửa seed + re-seed, thứ không làm được trên production.
 * TENANT_ADMIN về ý niệm là "mọi quyền TRONG tenant" nên auto-grant nhất quán
 * với ý định. CHỈ TENANT_ADMIN; và LOẠI quyền nhà-cung-cấp (resource system*)
 * — cấp system_tenant:* cho tenant admin là leo thang đặc quyền.
 */
@Injectable()
export class PermissionSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionSyncService.name);

  constructor(
    private readonly repo: AuthRepository,
    private readonly resolver: PermissionResolverService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.GEN_OPENAPI === '1') return; // codegen không cần DB
    for (const def of PERMISSIONS) {
      await this.repo.upsertPermission({
        code: def.code,
        resource: def.resource,
        action: def.action,
        description: def.description,
      });
    }
    this.logger.log(`Đã sync ${PERMISSIONS.length} permission từ registry`);
    await this.autoGrantTenantAdmins();
  }

  /** public để test gọi lại kiểm idempotency — chạy y hệt lúc boot */
  async autoGrantTenantAdmins(): Promise<void> {
    const grantable = PERMISSIONS.filter((p) => !p.resource.startsWith('system')).map(
      (p) => p.code,
    );
    const tenantIds = await this.repo.findAllTenantIds();
    for (const tenantId of tenantIds) {
      const granted = await this.repo.autoGrantMissingToTenantAdmin(tenantId, grantable);
      if (granted.length > 0) {
        // Cache permission theo tenant có thể sống qua restart (Redis) — xả ngay
        await this.resolver.invalidate(tenantId);
        this.logger.log(
          `AUTO-GRANT ${granted.length} quyền mới cho TENANT_ADMIN (tenant ${tenantId}): ${granted.join(', ')}`,
        );
      }
    }
  }
}
