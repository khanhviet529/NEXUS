'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { FormField } from '@/components/common/form-field';
import { OrderStatusBadge } from '@/components/common/status-badge';
import { DetailLayout, DetailField } from '@/design-system/patterns/list-detail/detail-layout';
import { GridEntry, type GridColumn } from '@/design-system/patterns/grid-entry/grid-entry';
import { formatMoney } from '@/lib/format/money';
import { PREVIEW_LINES, PREVIEW_ORDERS, type PreviewOrder } from './fixtures';
import type { PreviewScreen } from './screen-ids';

/** Sáu màn hình mẫu cho visual regression (fe-preset-system §8.1). */
export type { PreviewScreen } from './screen-ids';
export { PREVIEW_SCREENS, isPreviewScreen } from './screen-ids';

const noop = () => undefined;

type PreviewTableProps = React.ComponentProps<typeof DataTable<PreviewOrder>>;

const COLUMNS: ColumnDef<PreviewOrder, unknown>[] = [
  { id: 'code', accessorKey: 'code', header: 'Số chứng từ' },
  { id: 'customer', accessorKey: 'customer', header: 'Khách hàng' },
  { id: 'createdAt', accessorKey: 'createdAt', header: 'Ngày tạo' },
  {
    id: 'status',
    header: 'Trạng thái',
    cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
  },
  {
    id: 'quantity',
    header: 'SL',
    cell: ({ row }) => <span className="tnum block text-right">{row.original.quantity}</span>,
  },
  {
    id: 'total',
    header: 'Thành tiền',
    cell: ({ row }) => (
      <span className="tnum block text-right">{formatMoney(row.original.total)}</span>
    ),
  },
];

const GRID_COLUMNS: GridColumn[] = [
  { id: 'product', header: 'Sản phẩm' },
  { id: 'quantity', header: 'SL', className: 'w-20 text-right' },
  { id: 'unitPrice', header: 'Đơn giá', className: 'w-32 text-right' },
  { id: 'discountPercent', header: 'CK%', className: 'w-16 text-right' },
  { id: 'taxRate', header: 'VAT%', className: 'w-16 text-right' },
  { id: 'amount', header: 'Thành tiền', className: 'w-28 text-right', dataType: 'money' },
];

export function PreviewScreenView({ screen }: { screen: PreviewScreen }) {
  switch (screen) {
    case 'list':
      return <ListScreen />;
    case 'detail':
      return <DetailScreen />;
    case 'form':
      return <FormScreen />;
    case 'grid-entry':
      return <GridEntryScreen />;
    case 'login':
      return <LoginScreen />;
    case 'states':
      return <StatesScreen />;
  }
}

function ListScreen() {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">Đơn hàng</h1>
        <Button size="sm" className="ml-auto">
          Tạo đơn hàng
        </Button>
      </div>
      <FilterBar
        search="minh anh"
        onSearchChange={noop}
        searchPlaceholder="Tìm theo số chứng từ, khách hàng…"
        chips={[
          { id: 'status', label: 'Trạng thái', value: 'Chờ duyệt', onRemove: noop },
          { id: 'from', label: 'Từ ngày', value: '05/01/2026', onRemove: noop },
        ]}
        onClearAll={noop}
      />
      <DataTable<PreviewOrder>
        tableKey="preview-orders"
        columns={COLUMNS}
        rows={PREVIEW_ORDERS}
        status="success"
        getRowId={(r) => r.id}
        state={{ page: 1, limit: 50 }}
        onStateChange={noop}
        meta={{ page: 1, totalPages: 4, total: 187, hasNext: true }}
        summary={{
          customer: 'Tổng 187 đơn',
          quantity: '1.174',
          total: formatMoney('431760000'),
        }}
      />
    </div>
  );
}

function DetailScreen() {
  return (
    <DetailLayout
      backHref="/orders"
      title="DH-2026-0001"
      subtitle="Tạo ngày 05/01/2026 bởi Nguyễn Thị Minh"
      status={<OrderStatusBadge status="APPROVED" />}
      actions={
        <>
          <Button variant="outline" size="sm">
            In
          </Button>
          <Button size="sm">Sửa</Button>
        </>
      }
      aside={
        <section
          style={{
            border: 'var(--card-border)',
            borderRadius: 'var(--card-radius)',
            padding: 'var(--card-padding)',
            background: 'var(--surface-raised)',
          }}
        >
          <h2 className="mb-2 font-medium">Lịch sử</h2>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>05/01 09:12 · Nguyễn Thị Minh tạo nháp</li>
            <li>05/01 10:40 · Trần Văn Hải gửi duyệt</li>
            <li>05/01 14:02 · Lê Thu Hà duyệt</li>
          </ol>
        </section>
      }
      sections={[
        {
          id: 'general',
          title: 'Thông tin chung',
          children: (
            <dl>
              <DetailField label="Khách hàng">Công ty TNHH Minh Anh</DetailField>
              <DetailField label="Mã số thuế">0312345678</DetailField>
              <DetailField label="Kho xuất">Kho trung tâm — Bình Tân</DetailField>
              <DetailField label="Điều khoản">Thanh toán 30 ngày</DetailField>
            </dl>
          ),
        },
        {
          id: 'lines',
          title: 'Dòng hàng',
          description: '3 dòng · đã tính chiết khấu và VAT',
          children: <LinesTable />,
        },
      ]}
    />
  );
}

function LinesTable() {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full" style={{ fontSize: 'var(--table-font-size)' }}>
        <thead className="text-left" style={{ background: 'var(--table-header-bg)' }}>
          <tr>
            {GRID_COLUMNS.map((c) => (
              <th key={c.id} scope="col" className={`px-2 py-2 font-medium ${c.className ?? ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PREVIEW_LINES.map((l) => (
            <tr key={l.key} className="border-t border-border" style={{ height: 'var(--table-row-h)' }}>
              <td className="px-2">{l.product}</td>
              <td className="tnum px-2 text-right">{l.quantity}</td>
              <td className="tnum px-2 text-right">{formatMoney(l.unitPrice)}</td>
              <td className="tnum px-2 text-right">{l.discountPercent}</td>
              <td className="tnum px-2 text-right">{l.taxRate}</td>
              <td className="tnum px-2 text-right" data-type="money">
                {formatMoney(l.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormScreen() {
  return (
    <div className="max-w-2xl space-y-4 p-4">
      <h1 className="text-lg font-semibold">Thông tin khách hàng</h1>
      <FormField label="Mã khách hàng" required>
        <Input defaultValue="KH-00187" style={{ height: 'var(--input-h)' }} />
      </FormField>
      <FormField label="Tên khách hàng" required>
        <Input defaultValue="Công ty TNHH Minh Anh" style={{ height: 'var(--input-h)' }} />
      </FormField>
      <FormField label="Mã số thuế">
        <Input defaultValue="0312345678" style={{ height: 'var(--input-h)' }} />
      </FormField>
      <FormField label="Hạn mức công nợ" error="Hạn mức không được nhỏ hơn dư nợ hiện tại">
        <Input defaultValue="50.000.000" className="tnum" style={{ height: 'var(--input-h)' }} />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button variant="outline">Huỷ</Button>
        <Button>Lưu (Ctrl+S)</Button>
      </div>
    </div>
  );
}

function GridEntryScreen() {
  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">Tạo đơn hàng</h1>
      <GridEntry
        caption="Dòng hàng của đơn"
        columns={GRID_COLUMNS}
        onAddRow={noop}
        onRemoveRow={noop}
        rows={PREVIEW_LINES.map((l) => ({
          key: l.key,
          cells: [
            <Input key="p" readOnly aria-label={`Sản phẩm dòng ${l.key}`} defaultValue={l.product} style={{ height: 'var(--input-h)' }} />,
            <Input key="q" readOnly aria-label={`Số lượng dòng ${l.key}`} defaultValue={l.quantity} className="tnum text-right" style={{ height: 'var(--input-h)' }} />,
            <Input key="u" readOnly aria-label={`Đơn giá dòng ${l.key}`} defaultValue={formatMoney(l.unitPrice)} className="tnum text-right" style={{ height: 'var(--input-h)' }} />,
            <Input key="d" readOnly aria-label={`Chiết khấu % dòng ${l.key}`} defaultValue={l.discountPercent} className="tnum text-right" style={{ height: 'var(--input-h)' }} />,
            <Input key="t" readOnly aria-label={`VAT % dòng ${l.key}`} defaultValue={l.taxRate} className="tnum text-right" style={{ height: 'var(--input-h)' }} />,
            <span key="a" className="tnum block text-right">
              {formatMoney(l.amount)}
            </span>,
          ],
        }))}
        footer={
          <tfoot
            className="border-t border-border font-medium"
            style={{ background: 'var(--table-header-bg)' }}
          >
            <tr>
              <td className="px-2 py-2" colSpan={5}>
                Tổng · thuế {formatMoney('258000')} · chiết khấu {formatMoney('30000')}
              </td>
              <td className="tnum px-2 py-2 text-right" data-type="money">
                {formatMoney('2838000')}
              </td>
              <td />
            </tr>
          </tfoot>
        }
      />
    </div>
  );
}

function LoginScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div
        className="w-full max-w-sm space-y-4"
        style={{
          border: 'var(--card-border)',
          borderRadius: 'var(--card-radius)',
          boxShadow: 'var(--card-shadow)',
          padding: 'var(--card-padding)',
          background: 'var(--surface-raised)',
        }}
      >
        <h1 className="text-lg font-semibold">Đăng nhập Nexus</h1>
        <FormField label="Email" required>
          <Input defaultValue="minh.nguyen@congty.vn" style={{ height: 'var(--input-h)' }} />
        </FormField>
        <FormField label="Mật khẩu" required>
          <Input type="password" defaultValue="••••••••••" style={{ height: 'var(--input-h)' }} />
        </FormField>
        <Button className="w-full">Đăng nhập</Button>
      </div>
    </div>
  );
}

/** Bốn trạng thái §5.5. `status` là bắt buộc nên không dùng Partial toàn phần. */
const STATES: {
  label: string;
  props: Pick<PreviewTableProps, 'status'> & Partial<PreviewTableProps>;
}[] = [
  { label: 'Đang tải', props: { status: 'pending' } },
  { label: 'Chưa có dữ liệu', props: { status: 'success', rows: [] } },
  { label: 'Không khớp bộ lọc', props: { status: 'success', rows: [], isFiltered: true } },
  { label: 'Lỗi tải', props: { status: 'error' } },
];

function StatesScreen() {
  return (
    <div className="space-y-6 p-4">
      {STATES.map(({ label, props }) => (
        <section key={label}>
          <h2 className="mb-2 font-medium">{label}</h2>
          <DataTable<PreviewOrder>
            tableKey={`preview-state-${label}`}
            columns={COLUMNS}
            rows={PREVIEW_ORDERS}
            getRowId={(r) => r.id}
            state={{ page: 1, limit: 50 }}
            onStateChange={noop}
            onClearFilters={noop}
            onRetry={noop}
            emptyCta={<Button size="sm">Tạo đơn hàng đầu tiên</Button>}
            {...props}
          />
        </section>
      ))}
    </div>
  );
}
