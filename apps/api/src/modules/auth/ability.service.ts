import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PermissionResolverService, type Scope } from './permission-resolver.service';
import { OrgTreeRepository } from './org-tree.repository';

/**
 * [CORE] Ability — spec §4.4 quy tắc 3: row-level scope là điều kiện
 * NẰM TRONG CÂU QUERY. Tuyệt đối không fetch rồi lọc trong bộ nhớ —
 * phân trang sẽ sai ngay lập tức.
 *
 * | own         | bản ghi do mình tạo / được giao (users: chính mình)     |
 * | department  | org_unit_id = đơn vị của mình                            |
 * | descendants | đơn vị mình + toàn bộ con — ltree, MỘT truy vấn (§4.4.5) |
 * | all         | toàn tenant (extension đã lo tenant filter)              |
 */
export interface AbilityContext {
  user: AuthUser;
  scopeOf(permission: string): Scope | undefined;
  can(permission: string): boolean;
  /** where cho bảng có createdById/orgUnitId chuẩn (BusinessEntityBase) */
  scopeWhere(permission: string): Promise<Record<string, unknown>>;
  /** where áp lên TenantMembership (danh sách người dùng) */
  membershipScopeWhere(permission: string): Promise<Record<string, unknown>>;
  grantedFieldGroups(): Set<string>;
}

@Injectable()
export class AbilityService {
  constructor(
    private readonly resolver: PermissionResolverService,
    private readonly orgTree: OrgTreeRepository,
  ) {}

  async forUser(user: AuthUser): Promise<AbilityContext> {
    const { scopes } = await this.resolver.resolve(user.tenantId, user.sub);
    const orgTree = this.orgTree;

    const descendantIds = async (): Promise<string[]> => {
      if (!user.orgUnitId) return [];
      return orgTree.getDescendantIds(user.tenantId, user.orgUnitId);
    };

    const buildWhere = async (
      permission: string,
      shape: 'entity' | 'membership',
    ): Promise<Record<string, unknown>> => {
      const scope = scopes.get(permission);
      if (!scope) throw new AppException('AUTH.FORBIDDEN');
      switch (scope) {
        case 'all':
          return {};
        case 'own':
          return shape === 'membership'
            ? { userId: user.sub }
            : { createdById: user.sub };
        case 'department':
          if (!user.orgUnitId) return { orgUnitId: '__none__' }; // không đơn vị → rỗng, fail-closed
          return { orgUnitId: user.orgUnitId };
        case 'descendants': {
          const ids = await descendantIds();
          return { orgUnitId: { in: ids.length > 0 ? ids : ['__none__'] } };
        }
      }
    };

    return {
      user,
      scopeOf: (p) => scopes.get(p),
      can: (p) => scopes.has(p),
      scopeWhere: (p) => buildWhere(p, 'entity'),
      membershipScopeWhere: (p) => buildWhere(p, 'membership'),
      grantedFieldGroups: () => {
        const groups = new Set<string>();
        for (const code of scopes.keys()) {
          if (code.startsWith('field:')) groups.add(code.slice('field:'.length));
        }
        return groups;
      },
    };
  }
}
