import { Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS } from '@nexus/shared';
import { AppException } from '../../common/errors/app.exception';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditRepository } from '../audit/audit.repository';
import { SessionService } from '../auth/session.service';
import { AdminRepository } from './admin.repository';

/**
 * [CORE] Quản trị tenant — §5C.1, §3.1b, §4.4b hệ quả 3.
 *
 * Sysadmin truy cập chéo tenant là CƠ CHẾ TƯỜNG MINH:
 * - Không có "quyền xem mọi tenant" ngầm định (CrossTenantGuard + permission riêng)
 * - MỖI thao tác động tới một tenant → audit CROSS_TENANT_ACCESS
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly repo: AdminRepository,
    private readonly audit: AuditRepository,
    private readonly sessions: SessionService,
  ) {}

  private async auditCrossTenant(
    user: AuthUser,
    targetTenantId: string,
    detail: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.write({
      tenantId: targetTenantId,
      entity: 'Tenant',
      entityId: targetTenantId,
      action: AUDIT_ACTIONS.CROSS_TENANT_ACCESS, // BẮT BUỘC mỗi lần (§3.1b)
      actorId: user.sub,
      after: detail,
    });
  }

  listTenants() {
    return this.repo.listTenants();
  }

  async createTenant(
    user: AuthUser,
    input: { code: string; name: string; defaultLocale?: string; defaultTimezone?: string },
  ) {
    const tenant = await this.repo.provisionTenant(input);
    await this.auditCrossTenant(user, tenant.id, { action: AUDIT_ACTIONS.CREATE_TENANT, code: input.code });
    return tenant;
  }

  async suspendTenant(user: AuthUser, tenantId: string) {
    const tenant = await this.repo.findTenant(tenantId);
    if (!tenant) throw new AppException('TENANT.NOT_FOUND');
    await this.repo.updateTenantStatus(tenantId, 'SUSPENDED', new Date());
    // Hiệu lực NGAY: huỷ mọi phiên đang sống của tenant
    const sessions = await this.repo.findActiveSessionsOfTenant(tenantId);
    for (const s of sessions) await this.sessions.revoke(s.id, tenantId);
    await this.auditCrossTenant(user, tenantId, {
      action: AUDIT_ACTIONS.SUSPEND_TENANT,
      revokedSessions: sessions.length,
    });
  }

  async activateTenant(user: AuthUser, tenantId: string) {
    const tenant = await this.repo.findTenant(tenantId);
    if (!tenant) throw new AppException('TENANT.NOT_FOUND');
    await this.repo.updateTenantStatus(tenantId, 'ACTIVE', null);
    await this.auditCrossTenant(user, tenantId, { action: AUDIT_ACTIONS.ACTIVATE_TENANT });
  }

  async setFeatures(
    user: AuthUser,
    tenantId: string,
    features: Array<{ featureKey: string; enabled: boolean; quota?: Record<string, unknown> }>,
  ) {
    const tenant = await this.repo.findTenant(tenantId);
    if (!tenant) throw new AppException('TENANT.NOT_FOUND');
    await this.repo.upsertFeatures(tenantId, features);
    await this.auditCrossTenant(user, tenantId, { action: AUDIT_ACTIONS.SET_FEATURES, features });
  }

  // ---- Tenant tự quản (không cross-tenant, dùng tenant trong token) ----

  getCurrentTenant(user: AuthUser) {
    return this.repo.findTenantWithFeatures(user.tenantId);
  }

  async updateBranding(user: AuthUser, branding: Record<string, unknown>) {
    const updated = await this.repo.updateBranding(user.tenantId, branding);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'Tenant',
      entityId: user.tenantId,
      action: AUDIT_ACTIONS.UPDATE,
      after: { branding },
    });
    return updated;
  }
}
