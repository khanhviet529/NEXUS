'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CheckCircle, Command, Plus } from 'lucide-react';
import { ordersControllerList, getApiError } from '@nexus/api-client';
import type { OrderResponseDto } from '@nexus/api-client';
import type { OrderState } from '@nexus/shared';
import { Button } from '@/components/ui/button';
import { FilterBar } from '@/components/common/filter-bar';
import { ExportButton } from '@/features/exports/export-button';
import { ORDER_STATE_LABEL } from '@/design-system/state-tones';
import { OrderStatusBadge } from '@/components/common/status-badge';
import {
  ActionContextMenu,
  ActionMenu,
  ActionToolbar,
  useActions,
  useActionShortcuts,
  useBulkAction,
} from '@/lib/actions';
import { useCommandPalette } from '@/providers/command-palette';
import { useCan, useCurrentUser } from '@/lib/auth/use-can';
import { orderActions, bulkApproveOrders, type OrderActionCtx } from '@/features/orders/actions';
import { OrderFormDialog } from '@/features/orders/order-form';
import { SavedViewsBar } from '@/features/saved-views/saved-views-bar';

/**
 * GĐ8b — trang [REF] chứng minh tiêu chí §10: "một action khai báo một lần,
 * hiện đúng ở 4 nơi": (1) toolbar, (2) menu ⋯ từng dòng, (3) context menu
 * chuột phải + bulk bar khi chọn nhiều, (4) Cmd+K.
 * DataTable §5.5 đầy đủ thay bảng này ở lát FE tổng thể.
 */
const ORDER_STATES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

function RowActions({ record, meId }: OrderActionCtx) {
  const ctx = useMemo(() => ({ record, meId }), [record, meId]);
  const actions = useActions(orderActions, ctx);
  return <ActionMenu actions={actions} />;
}

function RowWithContextMenu({
  record,
  meId,
  children,
}: OrderActionCtx & { children: React.ReactNode }) {
  const ctx = useMemo(() => ({ record, meId }), [record, meId]);
  const actions = useActions(orderActions, ctx);
  return <ActionContextMenu actions={actions}>{children}</ActionContextMenu>;
}

function OrdersPage() {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const router = useRouter();
  const me = useCurrentUser();
  const can = useCan();
  const palette = useCommandPalette();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [openCreate, setOpenCreate] = useState(false);

  const [params, setParams] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(20),
    q: parseAsString.withDefault(''),
    status: parseAsString.withDefault(''),
  });

  // Type sinh từ OpenAPI (§2.4) — hết cast `as unknown as` viết tay
  const orders = useQuery({
    queryKey: ['orders', params],
    queryFn: () =>
      ordersControllerList({
        page: params.page,
        limit: params.limit,
        q: params.q || undefined,
        filter: params.status ? { status: { eq: params.status } } : undefined,
      }),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (orders.isError && getApiError(orders.error).status === 401) router.replace('/login');
  }, [orders.isError, orders.error, router]);

  const rows = useMemo(() => orders.data?.data ?? [], [orders.data]);
  const selectedRows = rows.filter((r) => selected[r.id]);

  // Toolbar trang: action không gắn row cụ thể (export) — ctx record giả lập nhẹ
  const pageCtx = useMemo<OrderActionCtx>(
    () => ({
      record: rows[0] ?? ({ id: '', code: '', status: 'DRAFT', version: 0 } as OrderResponseDto),
      meId: me.data?.id,
    }),
    [rows, me.data?.id],
  );
  const pageActions = useActions(
    orderActions.filter((a) => a.group === '2-export'),
    pageCtx,
  );
  useActionShortcuts(pageActions); // nơi 4: đăng ký Cmd+K + phím tắt

  const runBulkApprove = useBulkAction(bulkApproveOrders);

  // Export theo ĐÚNG bộ lọc hiện tại (§5.5) — cùng cú pháp filter DSL với list
  const exportEndpoint = useMemo(() => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.status) qs.set('filter[status][eq]', params.status);
    const suffix = qs.toString();
    return '/api/v1/orders/export' + (suffix ? '?' + suffix : '');
  }, [params.q, params.status]);

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <div className="flex items-center gap-2">
          {can('order:create') && (
            <Button size="sm" onClick={() => setOpenCreate(true)}>
              <Plus /> Tạo đơn
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={palette.open}>
            <Command /> Ctrl+K
          </Button>
          {/* Nơi 1: toolbar */}
          <ActionToolbar actions={pageActions} ctx={pageCtx} />
        </div>
      </header>

      {/* V11 — FilterBar §5.5: bộ lọc đang bật NHÌN THẤY được (chip),
          search debounce, saved views cắm vào slot, export theo ĐÚNG bộ lọc */}
      <FilterBar
        search={params.q}
        onSearchChange={(q) => void setParams({ q, page: 1 })}
        searchPlaceholder={tc('search')}
        chips={
          params.status
            ? [
                {
                  id: 'status',
                  label: t('columns.status'),
                  value: params.status,
                  onRemove: () => void setParams({ status: '', page: 1 }),
                },
              ]
            : []
        }
        onClearAll={() => void setParams({ q: '', status: '', page: 1 })}
        savedViews={<SavedViewsBar entity="Order" membershipId={me.data?.membershipId} />}
      >
        <select
          aria-label={t('columns.status')}
          className="rounded-md border border-input bg-background px-2 text-sm"
          style={{ height: 'var(--input-h)' }}
          value={params.status}
          onChange={(e) => void setParams({ status: e.target.value, page: 1 })}
        >
          <option value="">{t('columns.status')}: —</option>
          {ORDER_STATES.map((st) => (
            <option key={st} value={st}>
              {ORDER_STATE_LABEL[st]}
            </option>
          ))}
        </select>
        {can('order:export') && (
          <ExportButton
            endpoint={exportEndpoint}
            label={t('export')}
            fallbackFilename="orders.csv"
          />
        )}
      </FilterBar>

      {/* Bulk bar — hiện khi chọn ≥1 dòng (nơi 3 cùng context menu) */}
      {selectedRows.length > 0 && (
        <div
          className="sticky top-2 flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 shadow-sm"
          style={{ zIndex: 'var(--z-sticky)' as never }}
        >
          <span className="text-sm text-muted-foreground">
            {tc('selected', { count: selectedRows.length })}
          </span>
          <Button size="sm" onClick={() => void runBulkApprove(selectedRows)}>
            <CheckCircle /> {t('bulkApprove')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected({})}>
            {tc('close')}
          </Button>
        </div>
      )}

      {orders.isPending ? (
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả"
                    checked={rows.length > 0 && selectedRows.length === rows.length}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? Object.fromEntries(rows.map((r) => [r.id, true]))
                          : {},
                      )
                    }
                  />
                </th>
                <th className="px-3 py-2">Mã đơn</th>
                <th className="px-3 py-2">Khách hàng</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2 text-right">Tổng tiền</th>
                <th className="w-12 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RowWithContextMenu key={r.id} record={r} meId={me.data?.id}>
                  <tr className="border-t border-border hover:bg-accent/50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Chọn ${r.code}`}
                        checked={!!selected[r.id]}
                        onChange={(e) =>
                          setSelected((s) => ({ ...s, [r.id]: e.target.checked }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2 font-mono">
                      <Link href={`/orders/${r.id}`} className="hover:underline">
                        {r.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{String(r.customer?.code ?? '—')}</td>
                    <td className="px-3 py-2">
                      <OrderStatusBadge status={r.status as OrderState} />
                    </td>
                    <td className="px-3 py-2 text-right tnum" data-type="money">
                      {r.total} {r.currency}
                    </td>
                    <td className="px-3 py-2">
                      {/* Nơi 2: menu ⋯ */}
                      <RowActions record={r} meId={me.data?.id} />
                    </td>
                  </tr>
                </RowWithContextMenu>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    {tc('noResults')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <footer className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Trang {orders.data?.meta.page ?? 1}/{orders.data?.meta.totalPages ?? 1} ·{' '}
          {orders.data?.meta.total ?? 0} đơn
        </span>
        <span className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={params.page <= 1}
            onClick={() => void setParams({ page: params.page - 1 })}
          >
            ←
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!orders.data?.meta.hasNext}
            onClick={() => void setParams({ page: params.page + 1 })}
          >
            →
          </Button>
        </span>
      </footer>

      {/* Form field array §5.8 — cùng bộ tính tiền với BE */}
      <OrderFormDialog open={openCreate} onOpenChange={setOpenCreate} />
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <OrdersPage />
    </Suspense>
  );
}
