'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  inventoryControllerBalances,
  inventoryControllerReceive,
  inventoryControllerIssue,
  inventoryControllerListWarehouses,
  productsControllerList,
  getApiError,
} from '@nexus/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCan } from '@/lib/auth/use-can';

/**
 * Phase 4b — tồn kho (§5B.2/B4): bảng số dư + form nhập/xuất tay.
 *
 * - refId sinh MỘT LẦN cho mỗi phiếu (crypto.randomUUID) và giữ nguyên khi
 *   retry — dedup (refType, refId, movementType) của BE biến double-click /
 *   mạng chập thành no-op thay vì ghi kho hai lần (#23).
 * - STOCK.INSUFFICIENT là lỗi NGHIỆP VỤ chờ được: hiện tại chỗ, nói rõ
 *   "không đủ tồn khả dụng", không phải toast lỗi hệ thống chung.
 */
function MovementForm({ onDone }: { onDone: () => void }) {
  const can = useCan();
  const [type, setType] = React.useState<'RECEIPT' | 'ISSUE'>('RECEIPT');
  const [warehouseId, setWarehouseId] = React.useState('');
  const [productId, setProductId] = React.useState('');
  const [quantity, setQuantity] = React.useState('');
  const [businessError, setBusinessError] = React.useState<string | null>(null);
  // Mỗi phiếu MỘT refId — reset sau khi ghi thành công, GIỮ NGUYÊN khi lỗi/retry
  const refIdRef = React.useRef<string>(crypto.randomUUID());

  const warehouses = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => inventoryControllerListWarehouses(),
  });
  const products = useQuery({
    queryKey: ['products', { page: 1, limit: 100 }],
    queryFn: () => productsControllerList({ page: 1, limit: 100 }),
  });

  const submit = useMutation({
    mutationFn: () => {
      const body = {
        warehouseId,
        productId,
        quantity,
        refType: 'MANUAL',
        refId: refIdRef.current,
      };
      return type === 'RECEIPT'
        ? inventoryControllerReceive(body)
        : inventoryControllerIssue(body);
    },
    onSuccess: (r) => {
      toast.success(
        r.duplicate
          ? 'Phiếu này đã được ghi trước đó — không ghi trùng (retry an toàn)'
          : `Đã ${type === 'RECEIPT' ? 'nhập' : 'xuất'} kho`,
      );
      refIdRef.current = crypto.randomUUID(); // phiếu mới → khoá dedup mới
      setQuantity('');
      setBusinessError(null);
      onDone();
    },
    onError: (e) => {
      const err = getApiError(e);
      if (err.code === 'STOCK.INSUFFICIENT') {
        setBusinessError(
          'Không đủ tồn KHẢ DỤNG để xuất — tồn đã trừ phần đang giữ chỗ (reserved). Kiểm tra lại số lượng hoặc chọn kho khác.',
        );
      } else {
        setBusinessError(null);
        toast.error(err.message);
      }
    },
  });

  const canDo = type === 'RECEIPT' ? can('stock:receive') : can('stock:issue');
  if (!can('stock:receive') && !can('stock:issue')) return null;

  return (
    <section
      aria-labelledby="movement-form-title"
      className="space-y-3"
      style={{
        border: 'var(--card-border)',
        borderRadius: 'var(--card-radius)',
        padding: 'var(--card-padding)',
        background: 'var(--surface-raised)',
      }}
    >
      <h2 id="movement-form-title" className="font-medium">
        Ghi phiếu kho
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Loại
          <select
            aria-label="Loại phiếu"
            className="rounded-md border border-input bg-background px-2 text-sm"
            style={{ height: 'var(--input-h)' }}
            value={type}
            onChange={(e) => {
              setType(e.target.value as 'RECEIPT' | 'ISSUE');
              setBusinessError(null);
            }}
          >
            {can('stock:receive') && <option value="RECEIPT">Nhập kho</option>}
            {can('stock:issue') && <option value="ISSUE">Xuất kho</option>}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Kho
          <select
            aria-label="Kho"
            className="rounded-md border border-input bg-background px-2 text-sm"
            style={{ height: 'var(--input-h)' }}
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
          >
            <option value="">—</option>
            {(warehouses.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Sản phẩm
          <select
            aria-label="Sản phẩm"
            className="rounded-md border border-input bg-background px-2 text-sm"
            style={{ height: 'var(--input-h)' }}
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">—</option>
            {(products.data?.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {/* name BE đã resolve chuỗi theo locale; orval vẫn khai Json → ép chuỗi */}
                {p.code} — {String(p.name ?? '')}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Số lượng (đơn vị cơ sở)
          <Input
            aria-label="Số lượng"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="5"
            className="w-32 text-right"
          />
        </label>
        <Button
          disabled={!canDo || !warehouseId || !productId || !quantity || submit.isPending}
          onClick={() => submit.mutate()}
        >
          {submit.isPending ? 'Đang ghi…' : type === 'RECEIPT' ? 'Nhập kho' : 'Xuất kho'}
        </Button>
      </div>
      {businessError && (
        <p role="alert" className="text-sm" style={{ color: 'var(--tone-danger-fg)' }}>
          {businessError}
        </p>
      )}
    </section>
  );
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const balances = useQuery({
    queryKey: ['stock-balances'],
    queryFn: () => inventoryControllerBalances(),
  });

  if (balances.isError) {
    const err = getApiError(balances.error);
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-4 text-xl font-semibold">Tồn kho</h1>
        <p className="text-sm text-muted-foreground">
          {err.status === 403 ? 'Bạn không có quyền xem tồn kho (stock:read).' : err.message}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Tồn kho</h1>
      <MovementForm onDone={() => void qc.invalidateQueries({ queryKey: ['stock-balances'] })} />
      {balances.isPending ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : (balances.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có số dư tồn nào.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">Kho</th>
                <th className="py-2 pr-3">Sản phẩm</th>
                <th className="py-2 pr-3 text-right">Tồn</th>
                <th className="py-2 pr-3 text-right">Giữ chỗ</th>
                <th className="py-2 pr-3 text-right">Khả dụng</th>
                <th className="py-2 text-right">Đang chuyển</th>
              </tr>
            </thead>
            <tbody>
              {(balances.data ?? []).map((b) => (
                <tr
                  key={`${b.warehouseId}-${b.productId}-${b.lotId}`}
                  className="border-b last:border-0"
                >
                  <td className="py-1.5 pr-3 font-mono text-xs">{b.warehouseCode}</td>
                  <td className="py-1.5 pr-3">
                    <span className="font-mono text-xs text-muted-foreground">{b.productCode}</span>{' '}
                    {b.productName}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{b.onHand}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{b.reserved}</td>
                  <td className="py-1.5 pr-3 text-right font-medium tabular-nums">{b.available}</td>
                  <td className="py-1.5 text-right tabular-nums">{b.inTransit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
