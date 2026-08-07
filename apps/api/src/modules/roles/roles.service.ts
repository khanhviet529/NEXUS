import { Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS, PERMISSION_SCOPES } from '@nexus/shared';
import { AppException } from '../../common/errors/app.exception';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditRepository } from '../audit/audit.repository';
import { PermissionResolverService } from '../auth/permission-resolver.service';
import { RolesRepository } from './roles.repository';

export interface RolePermissionInput {
  permissionCode: string;
  scope: string;
}

/**
 * Vai trò là DỮ LIỆU (§4.4, quyết định #61): tenant tự tạo, ghép từ
 * permission + scope. Vai trò is_system không sửa/xoá.
 * Đổi quyền của role → invalidate cache CẢ TENANT (nhiều user dùng chung role).
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly repo: RolesRepository,
    private readonly audit: AuditRepository,
    private readonly resolver: PermissionResolverService,
  ) {}

  list(user: AuthUser) {
    return this.repo.list(user.tenantId);
  }

  listPermissions() {
    return this.repo.listPermissions();
  }

  async create(
    user: AuthUser,
    input: { code: string; name: string; permissions: RolePermissionInput[] },
  ) {
    const role = await this.repo.create(user.tenantId, {
      code: input.code,
      name: input.name,
    });
    await this.setPermissions(user, role.id, input.permissions, { skipSystemGuard: true });
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'Role',
      entityId: role.id,
      action: AUDIT_ACTIONS.CREATE,
      after: { code: input.code, name: input.name, permissions: input.permissions },
    });
    return this.repo.findById(role.id);
  }

  async update(
    user: AuthUser,
    roleId: string,
    input: { name?: string; permissions?: RolePermissionInput[] },
  ) {
    const role = await this.repo.findById(roleId);
    if (!role) throw new AppException('COMMON.NOT_FOUND');
    if (role.isSystem) {
      throw new AppException('AUTH.FORBIDDEN', {
        message: 'Vai trò hệ thống không cho sửa (permission-matrix §2.3)',
      });
    }
    if (input.name) await this.repo.update(roleId, { name: input.name });
    if (input.permissions) await this.setPermissions(user, roleId, input.permissions);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'Role',
      entityId: roleId,
      action: AUDIT_ACTIONS.UPDATE,
      before: { name: role.name },
      after: { name: input.name, permissions: input.permissions },
    });
    return this.repo.findById(roleId);
  }

  async remove(user: AuthUser, roleId: string) {
    const role = await this.repo.findById(roleId);
    if (!role) throw new AppException('COMMON.NOT_FOUND');
    if (role.isSystem) {
      throw new AppException('AUTH.FORBIDDEN', { message: 'Vai trò hệ thống không cho xoá' });
    }
    const inUse = await this.repo.countUserRoles(roleId);
    if (inUse > 0) {
      // Tiền thân của delete guard A2 (GĐ5): 409 kèm nguồn tham chiếu
      throw new AppException('COMMON.HAS_REFERENCES', {
        details: { references: [{ label: 'Thành viên đang giữ vai trò', count: inUse }] },
      });
    }
    await this.repo.softDelete(roleId);
    await this.resolver.invalidate(user.tenantId);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'Role',
      entityId: roleId,
      action: AUDIT_ACTIONS.DELETE,
      before: { code: role.code, name: role.name },
    });
  }

  private async setPermissions(
    user: AuthUser,
    roleId: string,
    permissions: RolePermissionInput[],
    opts?: { skipSystemGuard?: boolean },
  ): Promise<void> {
    if (!opts?.skipSystemGuard) {
      const role = await this.repo.findById(roleId);
      if (role?.isSystem) throw new AppException('AUTH.FORBIDDEN');
    }
    for (const p of permissions) {
      if (!(PERMISSION_SCOPES as readonly string[]).includes(p.scope)) {
        throw new AppException('COMMON.VALIDATION_FAILED', {
          details: { scope: [`Scope không hợp lệ: ${p.scope}`] },
        });
      }
    }
    const found = await this.repo.findPermissionsByCodes(
      permissions.map((p) => p.permissionCode),
    );
    const byCode = new Map(found.map((f) => [f.code, f.id]));
    const missing = permissions.filter((p) => !byCode.has(p.permissionCode));
    if (missing.length > 0) {
      throw new AppException('COMMON.VALIDATION_FAILED', {
        details: {
          permissions: missing.map((m) => `Permission không tồn tại: ${m.permissionCode}`),
        },
      });
    }
    // LUẬT §2.3: không cấp được quyền mình không có
    const mine = await this.resolver.getPermissionSet(user.tenantId, user.sub);
    const exceeding = permissions.filter((p) => !mine.has(p.permissionCode));
    if (exceeding.length > 0) {
      throw new AppException('AUTH.FORBIDDEN', {
        message: `Không thể cấp quyền bạn không có: ${exceeding.map((e) => e.permissionCode).join(', ')}`,
      });
    }
    await this.repo.replacePermissions(
      user.tenantId,
      roleId,
      permissions.map((p) => ({ permissionId: byCode.get(p.permissionCode)!, scope: p.scope })),
    );
    // Quyền đổi NGAY cho mọi user giữ role (test #9)
    await this.resolver.invalidate(user.tenantId);
  }
}
