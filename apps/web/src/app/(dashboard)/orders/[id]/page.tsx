'use client';

import { use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useOrdersControllerDetail, getApiError } from '@nexus/api-client';
import type { OrderResponseDto } from '@nexus/api-client';
import { DetailLayout, DetailField } from '@/design-system/patterns/list-detail/detail-layout';
import { OrderStatusBadge } from '@/components/common/status-badge';
import { AuditTimeline } from '@/components/common/audit-timeline';
import { AttachmentList } from '@/components/common/attachment-list';
import { ActionToolbar, useActions, useActionShortcuts } from '@/lib/actions';
import { useCurrentUser } from '@/lib/auth/use-can';
import { orderActions } from '@/features/orders/actions';
import { formatMoney } from '@/lib/format/money';
import type { OrderState } from '@nexus/shared';

/**
 * V9 — trang chi tiết chứng từ [REF] (checklist Phase 1).
 *
 * Bốn khối nội dung: thông tin · dòng hàng · lịch sử (AuditTimeline §4.9) ·
 * tệp đính kèm. Dùng SECTIONS của DetailLayout thay vì tab — bố cục trang
 * chi tiết là kiến trúc thông tin thuộc PRESET (fe-preset-system §6), không
 * phải lựa chọn của từng module; tab/section do preset quyết, module chỉ
 * khai nội dung.
 *
 * Action dùng CHUNG registry với trang danh sách (§5.9 — khai một lần).
 */
export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Wrapper Next-specific MỎNG — test đi qua OrderDetailScreen (use(promise)
  // không resolve được trong act() của RTL, React 19)
  const { id } = use(params);
  return <OrderDetailScreen id={id} />;
}

export function OrderDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const order = useOrdersControllerDetail(id);

  if (order.isPending) return <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>;
  if (order.isError) {
    const err = getApiError(order.error);
    if (err.status === 401) {
      router.replace('/login');
      return null;
    }
    // 404 gồm cả "ngoài phạm vi dữ liệu" (§3.6) — không phân biệt
    return <p className="p-4 text-sm text-destructive">{err.message}</p>;
  }
  // View con mount KHI CÓ dữ liệu — hooks (useActions) không chạy với record rỗng
  return <OrderDetailView o={order.data} />;
}

function OrderDetailView({ o }: { o: OrderResponseDto }) {
  const me = useCurrentUser();
  const ctx = useMemo(() => ({ record: o, meId: me.data?.id }), [o, me.data?.id]);
  const actions = useActions(orderActions, ctx);
  useActionShortcuts(actions);

  return (
    <DetailLayout
      backHref="/orders"
      title={o.code}
      subtitle={o.customer ? `${o.customer.code} — ${o.customer.name}` : undefined}
      status={<OrderStatusBadge status={o.status as OrderState} />}
      actions={<ActionToolbar actions={actions} ctx={ctx} />}
      sections={[
        {
          id: 'info',
          title: 'Thông tin',
          children: (
            <dl>
              <DetailField label="Mã đơn">{o.code}</DetailField>
              <DetailField label="Khách hàng">
                {o.customer ? `${o.customer.name} (${o.customer.code})` : '—'}
              </DetailField>
              <DetailField label="Tạm tính">{formatMoney(o.subtotal)}</DetailField>
              <DetailField label="Chiết khấu">
                {formatMoney(o.discountTotal)}
              </DetailField>
              <DetailField label="Thuế">{formatMoney(o.taxTotal)}</DetailField>
              <DetailField label="Tổng cộng">
                <span className="font-medium">{formatMoney(o.total)}</span>
              </DetailField>
              {/* margin CHỈ có mặt khi user có field:cost — BE đã lọc (§4.4c) */}
              {o.margin != null && (
                <DetailField label="Lãi gộp">{formatMoney(o.margin)}</DetailField>
              )}
              <DetailField label="Ngày tạo">
                {new Date(o.createdAt).toLocaleString('vi')}
              </DetailField>
              {o.approvedAt && (
                <DetailField label="Duyệt lúc">
                  {new Date(String(o.approvedAt)).toLocaleString('vi')}
                </DetailField>
              )}
            </dl>
          ),
        },
        {
          id: 'items',
          title: `Dòng hàng (${o.items.length})`,
          children: (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1 pr-2">#</th>
                    <th className="py-1 pr-2">Sản phẩm</th>
                    <th className="py-1 pr-2 text-right">SL</th>
                    <th className="py-1 pr-2">ĐVT</th>
                    <th className="py-1 pr-2 text-right">Đơn giá</th>
                    <th className="py-1 pr-2 text-right">CK %</th>
                    <th className="py-1 pr-2 text-right">VAT %</th>
                    <th className="py-1 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {o.items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-1 pr-2 text-muted-foreground">{item.lineNo}</td>
                      {/* Tên CHỐT lúc phát sinh (§3.10 luật 2) — không join products */}
                      <td className="py-1 pr-2">{item.productNameSnapshot}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{item.quantity}</td>
                      <td className="py-1 pr-2">{item.uom}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {formatMoney(item.unitPrice)}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {item.discountPercent}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">{item.taxRate}</td>
                      <td className="py-1 text-right font-medium tabular-nums">
                        {formatMoney(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {/* Dòng tổng cộng ở footer (§5.5) */}
                  <tr>
                    <td colSpan={7} className="py-1 pr-2 text-right text-muted-foreground">
                      Tổng cộng
                    </td>
                    <td className="py-1 text-right font-semibold tabular-nums">
                      {formatMoney(o.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ),
        },
      ]}
      aside={
        <>
          <section
            aria-labelledby="order-audit"
            style={{
              border: 'var(--card-border)',
              borderRadius: 'var(--card-radius)',
              padding: 'var(--card-padding)',
              background: 'var(--surface-raised)',
            }}
          >
            <h2 id="order-audit" className="mb-3 font-medium">
              Lịch sử thay đổi
            </h2>
            <AuditTimeline entity="Order" entityId={o.id} />
          </section>
          <section
            aria-labelledby="order-files"
            style={{
              border: 'var(--card-border)',
              borderRadius: 'var(--card-radius)',
              padding: 'var(--card-padding)',
              background: 'var(--surface-raised)',
            }}
          >
            <h2 id="order-files" className="mb-3 font-medium">
              Tệp đính kèm
            </h2>
            <AttachmentList entity="Order" entityId={o.id} />
          </section>
        </>
      }
    />
  );
}
