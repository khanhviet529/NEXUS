import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    // F10 (C1): validate TRƯỚC, rồi create + gán quyền + audit trong MỘT tx —
    // fail ở bất kỳ đâu cũng không để lại role mồ côi 0 quyền
    const entries = await this.prepareEntries(user, input.permissions);
    let role;
    try {
      role = await this.repo.createWithPermissions(
        user.tenantId,
        { code: input.code, name: input.name },
        entries,
        {
          actorId: user.sub,
          after: { code: input.code, name: input.name, permissions: input.permissions },
        },
      );
    } catch (e) {
      // (tenant_id, code) đụng unique → 409 đọc được, không phải 500
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new AppException('ROLE.CODE_EXISTS');
      }
      throw e;
    }
    await this.resolver.invalidate(user.tenantId);
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

  /** Validate scope + tồn tại + luật §2.3, trả entries sẵn ghi — dùng cho cả create lẫn update */
  private async prepareEntries(
    user: AuthUser,
    permissions: RolePermissionInput[],
  ): Promise<Array<{ permissionId: string; scope: string }>> {
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
    return permissions.map((p) => ({ permissionId: byCode.get(p.permissionCode)!, scope: p.scope }));
  }

  private async setPermissions(
    user: AuthUser,
    roleId: string,
    permissions: RolePermissionInput[],
  ): Promise<void> {
    const role = await this.repo.findById(roleId);
    if (role?.isSystem) throw new AppException('AUTH.FORBIDDEN');
    const entries = await this.prepareEntries(user, permissions);
    await this.repo.replacePermissions(user.tenantId, roleId, entries);
    // Quyền đổi NGAY cho mọi user giữ role (test #9)
    await this.resolver.invalidate(user.tenantId);
  }
}
