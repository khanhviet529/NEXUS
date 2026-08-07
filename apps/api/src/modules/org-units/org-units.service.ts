import { Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS } from '@nexus/shared';
import { AppException } from '../../common/errors/app.exception';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditRepository } from '../audit/audit.repository';
import { PermissionResolverService } from '../auth/permission-resolver.service';
import { OrgTreeRepository } from '../auth/org-tree.repository';
import { OrgUnitsRepository } from './org-units.repository';

/**
 * Cây đơn vị — §4.4 (ltree), §5C.10 (kiểm tra vòng lặp).
 * SỬA CÂY → invalidate cache permission TOÀN TENANT (scope descendants
 * phụ thuộc path — permission-matrix §2.4).
 */
@Injectable()
export class OrgUnitsService {
  constructor(
    private readonly repo: OrgUnitsRepository,
    private readonly tree: OrgTreeRepository,
    private readonly audit: AuditRepository,
    private readonly resolver: PermissionResolverService,
  ) {}

  list(user: AuthUser) {
    return this.repo.list(user.tenantId);
  }

  async create(user: AuthUser, input: { code: string; name: string; parentId?: string }) {
    if (input.parentId) {
      const parent = await this.repo.findById(input.parentId);
      if (!parent) throw new AppException('COMMON.NOT_FOUND');
    }
    const unit = await this.repo.create(user.tenantId, input);
    await this.tree.setPathOnCreate(user.tenantId, unit.id, input.parentId ?? null);
    await this.resolver.invalidate(user.tenantId);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'OrgUnit',
      entityId: unit.id,
      action: AUDIT_ACTIONS.CREATE,
      after: { code: input.code, name: input.name, parentId: input.parentId },
    });
    return this.repo.findById(unit.id);
  }

  async update(
    user: AuthUser,
    id: string,
    input: { name?: string; parentId?: string | null; version: number },
  ) {
    const unit = await this.repo.findById(id);
    if (!unit) throw new AppException('COMMON.NOT_FOUND');

    const parentChanged =
      input.parentId !== undefined && input.parentId !== unit.parentId;
    if (parentChanged && input.parentId) {
      if (input.parentId === id) {
        throw new AppException('COMMON.VALIDATION_FAILED', {
          details: { parentId: ['Đơn vị không thể là cha của chính nó'] },
        });
      }
      // Chặn vòng lặp: cha mới không được là CON CHÁU của node (§5C.10)
      const wouldCycle = await this.tree.isDescendantOf(user.tenantId, input.parentId, id);
      if (wouldCycle) {
        throw new AppException('COMMON.VALIDATION_FAILED', {
          details: { parentId: ['Tạo vòng lặp trong cây đơn vị'] },
        });
      }
    }

    const affected = await this.repo.update(id, input);
    if (affected.count === 0) throw new AppException('COMMON.VERSION_CONFLICT');

    if (parentChanged) {
      await this.tree.moveSubtree(user.tenantId, id, input.parentId ?? null);
      await this.resolver.invalidate(user.tenantId); // descendants đổi cho CẢ tenant
    }
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'OrgUnit',
      entityId: id,
      action: AUDIT_ACTIONS.UPDATE,
      before: { name: unit.name, parentId: unit.parentId },
      after: { name: input.name, parentId: input.parentId },
    });
    return this.repo.findById(id);
  }

  async remove(user: AuthUser, id: string) {
    const unit = await this.repo.findById(id);
    if (!unit) throw new AppException('COMMON.NOT_FOUND');
    const [children, members] = await Promise.all([
      this.repo.countChildren(user.tenantId, id),
      this.repo.countMemberships(user.tenantId, id),
    ]);
    const references = [
      ...(children > 0 ? [{ label: 'Đơn vị con', count: children }] : []),
      ...(members > 0 ? [{ label: 'Thành viên đang thuộc đơn vị', count: members }] : []),
    ];
    if (references.length > 0) {
      throw new AppException('COMMON.HAS_REFERENCES', { details: { references } });
    }
    await this.repo.softDelete(id);
    await this.resolver.invalidate(user.tenantId);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'OrgUnit',
      entityId: id,
      action: AUDIT_ACTIONS.DELETE,
      before: { code: unit.code, name: unit.name },
    });
  }
}
