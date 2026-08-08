import { Injectable } from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  canTransition,
  ORDER_STATE_MACHINE,
  type AuditAction,
} from '@nexus/shared';
import { AppException } from '../../common/errors/app.exception';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AbilityService } from '../auth/ability.service';
import { AuditRepository } from '../audit/audit.repository';
import { ApprovalAuthoritiesRepository } from '../approval-authorities/approval-authorities.repository';
import { OrdersRepository, type OrderItemInput } from './orders.repository';

/**
 * [REF] Service orders — luật nghiệp vụ CHỒNG LÊN quyền (permission-matrix §3.1):
 *   update: DRAFT/REJECTED · delete: DRAFT · submit: DRAFT + ≥1 dòng
 *   approve: PENDING + KHÔNG TỰ DUYỆT (ORDER.SELF_APPROVAL)
 * Máy trạng thái khai ở packages/shared — không rải if(status) (§4.7).
 */
/** ADR-0004: transition nghiệp vụ → action audit ĐỌC ĐƯỢC trên timeline (§4.9) */
const TRANSITION_AUDIT_ACTION: Record<'submit' | 'approve' | 'reject' | 'cancel', AuditAction> = {
  submit: AUDIT_ACTIONS.SUBMIT,
  approve: AUDIT_ACTIONS.APPROVE,
  reject: AUDIT_ACTIONS.REJECT,
  cancel: AUDIT_ACTIONS.CANCEL,
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly repo: OrdersRepository,
    private readonly ability: AbilityService,
    private readonly audit: AuditRepository,
    private readonly authorities: ApprovalAuthoritiesRepository,
  ) {}

  private async getInScope(user: AuthUser, orderId: string, permission: string) {
    const ability = await this.ability.forUser(user);
    const scopeWhere = await ability.scopeWhere(permission);
    const order = await this.repo.findInScope(scopeWhere, orderId);
    if (!order) throw new AppException('COMMON.NOT_FOUND'); // §4.10 IDOR
    return order;
  }

  async list(
    user: AuthUser,
    query: {
      where: Record<string, unknown>;
      orderBy: Array<Record<string, 'asc' | 'desc'>>;
      page: number;
      limit: number;
    },
  ) {
    const ability = await this.ability.forUser(user);
    const scopeWhere = await ability.scopeWhere('order:read');
    return this.repo.list({ ...query, scopeWhere });
  }

  async detail(user: AuthUser, orderId: string) {
    return this.getInScope(user, orderId, 'order:read');
  }

  async create(user: AuthUser, input: { customerId: string; items: OrderItemInput[] }) {
    if (input.items.length === 0) throw new AppException('ORDER.EMPTY_ITEMS');
    const order = await this.repo.create({
      tenantId: user.tenantId,
      userId: user.sub,
      orgUnitId: user.orgUnitId,
      customerId: input.customerId,
      items: input.items,
    });
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'Order',
      entityId: order.id,
      action: AUDIT_ACTIONS.CREATE,
      after: { code: order.code, total: order.total.toString() },
    });
    return order;
  }

  async update(
    user: AuthUser,
    orderId: string,
    input: { version: number; items: OrderItemInput[] },
  ) {
    const order = await this.getInScope(user, orderId, 'order:update');
    if (!['DRAFT', 'REJECTED'].includes(order.status)) {
      throw new AppException(
        order.status === 'APPROVED' ? 'ORDER.ALREADY_APPROVED' : 'ORDER.NOT_EDITABLE',
      );
    }
    if (input.items.length === 0) throw new AppException('ORDER.EMPTY_ITEMS');
    const result = await this.repo.replaceItems({
      tenantId: user.tenantId,
      orderId,
      version: input.version,
      items: input.items,
    });
    if (result === 'conflict') throw new AppException('COMMON.VERSION_CONFLICT');
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'Order',
      entityId: orderId,
      action: AUDIT_ACTIONS.UPDATE,
      after: { itemCount: input.items.length },
    });
    return this.repo.findById(orderId);
  }

  async remove(user: AuthUser, orderId: string) {
    const order = await this.getInScope(user, orderId, 'order:delete');
    if (order.status !== 'DRAFT') throw new AppException('ORDER.NOT_DELETABLE');
    await this.repo.softDelete(orderId);
    await this.audit.write({
      tenantId: user.tenantId,
      entity: 'Order',
      entityId: orderId,
      action: AUDIT_ACTIONS.DELETE,
      before: { code: order.code },
    });
  }

  private async doTransition(
    user: AuthUser,
    orderId: string,
    action: 'submit' | 'approve' | 'reject' | 'cancel',
    permission: string,
    version: number,
    opts?: { failAfterOutboxForTest?: boolean; failAuditForTest?: boolean },
  ) {
    const order = await this.getInScope(user, orderId, permission);

    // Máy trạng thái tập trung (§4.7) — chuyển sai → 409
    const transition = canTransition(ORDER_STATE_MACHINE, order.status, action);
    if (!transition) throw new AppException('ORDER.INVALID_TRANSITION');

    if (action === 'submit' && order.items.length === 0) {
      throw new AppException('ORDER.EMPTY_ITEMS');
    }
    // KHÔNG TỰ DUYỆT — luật kiểm soát nội bộ cơ bản (permission-matrix §3.1)
    if ((action === 'approve' || action === 'reject') && order.createdById === user.sub) {
      throw new AppException('ORDER.SELF_APPROVAL');
    }

    // GĐ10 — HẠN MỨC DUYỆT (§5C.12, §12 #62): FAIL-CLOSED, resolve từ
    // approval_authorities theo NGÀY CHỨNG TỪ. Quyền order:approve chưa đủ.
    if (action === 'approve') {
      const authority = await this.authorities.resolveFor(
        user,
        'ORDER',
        order.currency,
        order.total,
        order.createdAt,
      );
      if (!authority.hasAnyRow) throw new AppException('ORDER.NO_APPROVAL_AUTHORITY');
      if (!authority.covered) throw new AppException('ORDER.EXCEEDS_LIMIT');
    }

    // ADR-0004: action mang NGỮ NGHĨA NGHIỆP VỤ (SUBMIT/APPROVE/REJECT/CANCEL)
    // — timeline §4.9 phải đọc được, không phải chuỗi UPDATE vô hồn; và audit
    // ghi TRONG CÙNG tx với write nghiệp vụ (đk2), nên truyền vào repository.
    const result = await this.repo.transition({
      tenantId: user.tenantId,
      orderId,
      version,
      fromStatus: transition.from,
      toStatus: transition.to,
      actorId: user.sub,
      audit: {
        tenantId: user.tenantId,
        entity: 'Order',
        entityId: orderId,
        action: TRANSITION_AUDIT_ACTION[action],
        before: { status: transition.from },
        after: { status: transition.to },
      },
      emitApprovedEvent: transition.to === 'APPROVED',
      orderCode: order.code,
      createdById: order.createdById,
      failAfterOutboxForTest: opts?.failAfterOutboxForTest,
      failAuditForTest: opts?.failAuditForTest,
    });
    if (result === 'conflict') throw new AppException('COMMON.VERSION_CONFLICT');

    return this.repo.findById(orderId);
  }

  /**
   * Bulk framework §5C.3 — tập nhỏ ĐỒNG BỘ: HTTP 200 kể cả khi có dòng
   * thất bại (thất bại từng dòng KHÔNG phải lỗi của request), lỗi theo
   * từng dòng kèm code (#28).
   */
  async bulkApprove(user: AuthUser, orderIds: string[]) {
    const results: Array<{
      id: string;
      success: boolean;
      code?: string;
      message?: string;
    }> = [];
    for (const orderId of orderIds) {
      try {
        const order = await this.getInScope(user, orderId, 'order:approve');
        await this.doTransition(user, orderId, 'approve', 'order:approve', order.version);
        results.push({ id: orderId, success: true });
      } catch (e) {
        if (e instanceof AppException) {
          results.push({ id: orderId, success: false, code: e.code, message: e.message });
        } else {
          results.push({
            id: orderId,
            success: false,
            code: 'COMMON.INTERNAL_ERROR',
            message: 'Lỗi hệ thống',
          });
        }
      }
    }
    const succeeded = results.filter((r) => r.success).length;
    return {
      total: orderIds.length,
      succeeded,
      failed: orderIds.length - succeeded,
      results,
    };
  }

  submit(user: AuthUser, orderId: string, version: number) {
    return this.doTransition(user, orderId, 'submit', 'order:submit', version);
  }

  approve(
    user: AuthUser,
    orderId: string,
    version: number,
    opts?: { failAfterOutboxForTest?: boolean; failAuditForTest?: boolean },
  ) {
    return this.doTransition(user, orderId, 'approve', 'order:approve', version, opts);
  }

  reject(user: AuthUser, orderId: string, version: number) {
    return this.doTransition(user, orderId, 'reject', 'order:approve', version);
  }

  /** GĐ8b — máy trạng thái đã khai DRAFT→CANCELLED từ GĐ1, bổ sung wrapper */
  cancel(user: AuthUser, orderId: string, version: number) {
    return this.doTransition(user, orderId, 'cancel', 'order:update', version);
  }
}
