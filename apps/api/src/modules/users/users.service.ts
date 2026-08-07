import { Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS, forbiddenQueryFields } from '@nexus/shared';
import { AppException } from '../../common/errors/app.exception';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditRepository } from '../audit/audit.repository';
import { AbilityService } from '../auth/ability.service';
import { PermissionResolverService } from '../auth/permission-resolver.service';
import { SessionService } from '../auth/session.service';
import { AuthRepository } from '../auth/auth.repository';
import { UsersRepository } from './users.repository';

const SORT_WHITELIST = ['email', 'fullName', 'createdAt', 'lastLoginAt', 'status'] as const;

/**
 * Vòng đời tài khoản — §4.3c. Mọi hành động lên "user trong tenant" đi qua
 * scope của MEMBERSHIP; ngoài phạm vi trả 404, không lộ tồn tại (§4.10).
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly ability: AbilityService,
    private readonly audit: AuditRepository,
    private readonly resolver: PermissionResolverService,
    private readonly sessions: SessionService,
    private readonly authRepo: AuthRepository,
  ) {}

  async list(
    user: AuthUser,
    query: { page: number; limit: number; sort?: string; q?: string },
  ) {
    const ability = await this.ability.forUser(user);
    const scopeWhere = await ability.membershipScopeWhere('user:read');

    // Whitelist sort + LOẠI field nhạy cảm không được xem (§4.4c, test #11)
    const forbidden = new Set(forbiddenQueryFields('User', ability.grantedFieldGroups()));
    const sort = (query.sort ?? 'createdAt')
      .split(',')
      .filter(Boolean)
      .map((raw) => {
        const dir = raw.startsWith('-') ? ('desc' as const) : ('asc' as const);
        const field = raw.replace(/^-/, '');
        if (forbidden.has(field) || !(SORT_WHITELIST as readonly string[]).includes(field)) {
          throw new AppException('COMMON.BAD_REQUEST', {
            message: `Trường sort không hợp lệ: ${field}`,
          });
        }
        return { field, dir };
      });

    const { data, total } = await this.repo.list({
      tenantId: user.tenantId,
      scopeWhere,
      page: query.page,
      limit: query.limit,
      sort,
      q: query.q,
    });
    return { data, total };
  }

  async getInScope(user: AuthUser, targetUserId: string, permission = 'user:read') {
    const ability = await this.ability.forUser(user);
    const scopeWhere = await ability.membershipScopeWhere(permission);
    const membership = await this.repo.findInScope(scopeWhere, targetUserId);
    if (!membership) throw new AppException('COMMON.NOT_FOUND'); // không tiết lộ (§4.10)
    return membership;
  }

  async update(
    user: AuthUser,
    targetUserId: string,
    input: {
      fullName?: string;
      phone?: string | null;
      nationalId?: string | null;
      salary?: string | null;
    },
  ) {
    const membership = await this.getInScope(user, targetUserId, 'user:update');
    // Không sửa được field mình không được XEM (§4.4c)
    const ability = await this.ability.forUser(user);
    const groups = ability.grantedFieldGroups();
    if (input.salary !== undefined && !groups.has('hr')) throw new AppException('AUTH.FORBIDDEN');
    if (input.nationalId !== undefined && !groups.has('pii')) {
      throw new AppException('AUTH.FORBIDDEN');
    }

    const before = {
      fullName: membership.user.fullName,
      phone: membership.user.phone,
      nationalId: membership.user.nationalId,
      salary: membership.user.salary?.toString() ?? null,
    };
    const updated = await this.repo.updateUser(targetUserId, input);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'User',
      entityId: targetUserId,
      action: AUDIT_ACTIONS.UPDATE,
      before, // AuditRepository tự che salary/nationalId (§4.4c nơi 4)
      after: {
        fullName: updated.fullName,
        phone: updated.phone,
        nationalId: updated.nationalId,
        salary: updated.salary?.toString() ?? null,
      },
    });
    return this.getInScope(user, targetUserId, 'user:update');
  }

  async disable(user: AuthUser, targetUserId: string) {
    await this.getInScope(user, targetUserId, 'user:disable');
    await this.repo.updateUser(targetUserId, { status: 'DISABLED' });
    await this.sessions.revokeAllOfUser(targetUserId); // vô hiệu = chết NGAY mọi phiên
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'User',
      entityId: targetUserId,
      action: AUDIT_ACTIONS.UPDATE,
      after: { status: 'DISABLED' },
    });
  }

  async unlock(user: AuthUser, targetUserId: string) {
    const membership = await this.getInScope(user, targetUserId, 'user:unlock');
    await this.repo.updateUser(targetUserId, { status: 'ACTIVE' });
    // Gỡ khoá rate-limit (§4.3) — khoá theo email
    await this.resolver.invalidate(user.tenantId, targetUserId);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'User',
      entityId: targetUserId,
      action: AUDIT_ACTIONS.UPDATE,
      after: { status: 'ACTIVE', unlocked: true, email: membership.user.email },
    });
  }

  /**
   * Chuyển phòng ban — §4.3 CẠM BẪY orgUnitId trong token: đổi org_unit
   * BẮT BUỘC huỷ toàn bộ session của user đó, nếu không 15 phút tiếp theo
   * user vẫn thấy dữ liệu phòng ban cũ.
   */
  async transferOrg(user: AuthUser, targetUserId: string, orgUnitId: string) {
    const membership = await this.getInScope(user, targetUserId, 'user:transfer');
    await this.repo.updateMembershipOrgUnit(user.tenantId, membership.id, orgUnitId);
    await this.sessions.revokeAllOfUser(targetUserId); // BẮT BUỘC (§4.3)
    await this.resolver.invalidate(user.tenantId, targetUserId);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'TenantMembership',
      entityId: membership.id,
      action: AUDIT_ACTIONS.UPDATE,
      before: { orgUnitId: membership.orgUnitId },
      after: { orgUnitId },
    });
  }

  /** Nghỉ việc: thu hồi quyền + huỷ mọi phiên. (Chuyển giao bản ghi phân công: A4, GĐ sau) */
  async offboard(user: AuthUser, targetUserId: string) {
    const membership = await this.getInScope(user, targetUserId, 'user:offboard');
    await this.repo.offboardMembership(user.tenantId, membership.id);
    await this.sessions.revokeAllOfUser(targetUserId);
    await this.resolver.invalidate(user.tenantId, targetUserId);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'TenantMembership',
      entityId: membership.id,
      action: AUDIT_ACTIONS.UPDATE,
      before: { status: membership.status },
      after: { status: 'LEFT' },
    });
  }

  /** Gán vai trò — HAI LUẬT CỨNG của permission-matrix §2.3 */
  async assignRoles(user: AuthUser, targetUserId: string, roleIds: string[]) {
    // Luật 1: không ai tự cấp quyền cho chính mình — kể cả TENANT_ADMIN
    if (targetUserId === user.sub) throw new AppException('AUTH.SELF_GRANT_FORBIDDEN');

    const membership = await this.getInScope(user, targetUserId, 'user:assign_role');

    const roles = await this.repo.findRolesWithPermissions(user.tenantId, roleIds);
    if (roles.length !== roleIds.length) throw new AppException('COMMON.NOT_FOUND');

    // Luật 2: không cấp được quyền mình không có
    const mine = await this.resolver.getPermissionSet(user.tenantId, user.sub);
    const granting = new Set(
      roles.flatMap((r) => r.permissions.map((p) => p.permission.code)),
    );
    const exceeding = [...granting].filter((code) => !mine.has(code));
    if (exceeding.length > 0) {
      throw new AppException('AUTH.FORBIDDEN', {
        message: `Không thể cấp quyền bạn không có: ${exceeding.join(', ')}`,
      });
    }

    await this.repo.replaceRoles(user.tenantId, membership.id, roleIds);
    await this.resolver.invalidate(user.tenantId, targetUserId); // hiệu lực NGAY (test #9)
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'UserRole',
      entityId: membership.id,
      action: AUDIT_ACTIONS.UPDATE,
      before: { roleIds: membership.userRoles.map((ur) => ur.role.id) },
      after: { roleIds },
    });
  }

  async getSessions(user: AuthUser, targetUserId: string) {
    const membership = await this.getInScope(user, targetUserId, 'user_session:read');
    return this.authRepo.findSessionsOfMembership(user.tenantId, membership.id);
  }

  async revokeSessions(user: AuthUser, targetUserId: string) {
    await this.getInScope(user, targetUserId, 'user_session:revoke');
    const n = await this.sessions.revokeAllOfUser(targetUserId);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'User',
      entityId: targetUserId,
      action: AUDIT_ACTIONS.SESSION_REVOKED,
      after: { revokedCount: n },
    });
  }
}
