import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PERMISSIONS } from '@nexus/shared';
import { AuthRepository } from './auth.repository';

/**
 * [CORE] Sync permission registry → DB lúc khởi động — spec §4.4 quy tắc 1.
 * Không seed tay, không sửa trực tiếp DB. Write đi qua repository (§4.9).
 *
 * Chỉ upsert, KHÔNG xoá code thừa tự động (xoá permission đang được
 * role_permissions tham chiếu là việc phải làm có chủ đích qua migration).
 */
@Injectable()
export class PermissionSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionSyncService.name);

  constructor(private readonly repo: AuthRepository) {}

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
  }
}
