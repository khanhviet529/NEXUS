import { CheckCircle, Send, XCircle, FileDown, Ban } from 'lucide-react';
import {
  ordersControllerSubmit,
  ordersControllerApprove,
  ordersControllerReject,
  ordersControllerCancel,
  ordersControllerBulkApprove,
  exportsControllerExportProducts,
} from '@nexus/api-client';
import type { OrderResponseDto } from '@nexus/api-client';
import type { ActionDef, BulkActionDef, BulkResult } from '@/lib/actions';

/** Ctx cho Action Registry — record là DTO SINH TỪ OpenAPI (§2.4, không khai tay) */
export interface OrderActionCtx {
  record: OrderResponseDto;
  meId: string | undefined;
}

/**
 * [REF] features/orders/actions.ts — khuôn Action Registry (§5.9).
 * Khai MỘT LẦN — hiện ở 4 nơi: toolbar, menu ⋯, context menu, Cmd+K.
 * enabled() ánh xạ điều kiện nghiệp vụ matrix §3.1 — nút MỜ + lý do,
 * không biến mất (khác permission: thiếu quyền thì ẨN).
 */
export const orderActions: ActionDef<OrderActionCtx>[] = [
  {
    id: 'order.submit',
    label: 'Gửi duyệt',
    icon: Send,
    group: '1-workflow',
    order: 5,
    permission: 'order:submit',
    enabled: ({ record }) =>
      record.status === 'DRAFT' || record.status === 'REJECTED'
        ? true
        : 'Chỉ gửi duyệt được đơn nháp hoặc bị từ chối',
    run: ({ record }) => ordersControllerSubmit(record.id, { version: record.version }),
    success: 'Đã gửi duyệt',
    invalidates: () => [['orders']],
  },
  {
    id: 'order.approve',
    label: 'Duyệt đơn',
    icon: CheckCircle,
    group: '1-workflow',
    order: 10,
    shortcut: 'mod+shift+a',
    permission: 'order:approve',
    enabled: ({ record, meId }) =>
      record.status !== 'PENDING'
        ? 'Đơn không ở trạng thái chờ duyệt'
        : record.createdById === meId
          ? 'Không thể tự duyệt đơn mình tạo' // ORDER.SELF_APPROVAL (matrix §3.1)
          : true,
    confirm: ({ record }) => ({
      title: `Duyệt đơn ${record.code}?`,
      description: `Tổng giá trị ${record.total} ${record.currency}`,
    }),
    run: ({ record }) => ordersControllerApprove(record.id, { version: record.version }),
    success: 'Đã duyệt đơn',
    invalidates: () => [['orders']],
  },
  {
    id: 'order.reject',
    label: 'Từ chối',
    icon: XCircle,
    variant: 'danger',
    group: '1-workflow',
    order: 20,
    permission: 'order:approve',
    enabled: ({ record }) =>
      record.status === 'PENDING' || 'Đơn không ở trạng thái chờ duyệt',
    confirm: ({ record }) => ({
      title: `Từ chối đơn ${record.code}?`,
      variant: 'danger',
    }),
    run: ({ record }) => ordersControllerReject(record.id, { version: record.version }),
    success: 'Đã từ chối đơn',
    invalidates: () => [['orders']],
  },
  {
    id: 'order.export',
    label: 'Xuất CSV sản phẩm',
    icon: FileDown,
    group: '2-export',
    permission: 'product:export',
    inPalette: true,
    // Export qua QUEUE (§4.7, GĐ7f) — enqueue rồi nhận notification kèm file
    run: () => exportsControllerExportProducts(),
    success: 'Đã xếp hàng export — sẽ có thông báo khi xong',
  },
  {
    id: 'order.cancel',
    label: 'Huỷ đơn',
    icon: Ban,
    variant: 'danger',
    group: '9-danger',
    order: 90,
    permission: 'order:update',
    enabled: ({ record }) =>
      record.status === 'DRAFT' || 'Chỉ huỷ được đơn ở trạng thái nháp',
    confirm: ({ record }) => ({
      title: `Huỷ đơn ${record.code}?`,
      variant: 'danger',
      typeToConfirm: record.code, // hành động huỷ diệt — bắt gõ đúng mã
    }),
    run: ({ record }) => ordersControllerCancel(record.id, { version: record.version }),
    success: 'Đã huỷ đơn',
    invalidates: () => [['orders']],
  },
];

/** Bulk approve — BE partial success (§5C.3), lỗi TỪNG DÒNG */
export const bulkApproveOrders: BulkActionDef<OrderResponseDto> = {
  id: 'order.bulk-approve',
  label: 'Duyệt hàng loạt',
  icon: CheckCircle,
  permission: 'order:approve',
  eligible: (rows) => {
    const ok: OrderResponseDto[] = [];
    const skipped: Array<{ row: OrderResponseDto; reason: string }> = [];
    for (const row of rows) {
      if (row.status === 'PENDING') ok.push(row);
      else skipped.push({ row, reason: `Trạng thái ${row.status} — chỉ duyệt đơn PENDING` });
    }
    return { ok, skipped };
  },
  confirm: (rows) => ({
    title: `Duyệt ${rows.length} đơn?`,
    description: 'Đơn không hợp lệ sẽ được liệt kê trong kết quả.',
  }),
  run: async (rows) => {
    const res = (await ordersControllerBulkApprove({
      orderIds: rows.map((r) => r.id),
    })) as unknown as {
      results: Array<{ id: string; ok: boolean; code?: string; message?: string }>;
    };
    const byId = new Map(rows.map((r) => [r.id, r]));
    const failed = res.results
      .filter((r) => !r.ok)
      .map((r) => ({
        id: r.id,
        label: byId.get(r.id)?.code ?? r.id,
        reason: r.message ?? r.code ?? 'Lỗi không rõ',
      }));
    const result: BulkResult = {
      succeeded: res.results.filter((r) => r.ok).length,
      failed,
    };
    return result;
  },
  invalidates: () => [['orders']],
};
