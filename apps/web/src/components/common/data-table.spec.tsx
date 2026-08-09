import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ColumnDef } from '@tanstack/react-table';
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/test/render';
import { PRESETS } from '@/design-system/registry';
import { DataTable, type DataTableState } from './data-table';

interface Row {
  id: string;
  code: string;
  customer: string;
  total: string;
}

const COLUMNS: ColumnDef<Row, unknown>[] = [
  { id: 'code', accessorKey: 'code', header: 'Mã' },
  { id: 'customer', accessorKey: 'customer', header: 'Khách hàng' },
  { id: 'total', accessorKey: 'total', header: 'Thành tiền' },
];

const ROWS: Row[] = [
  { id: '1', code: 'DH-001', customer: 'Công ty A', total: '1000' },
  { id: '2', code: 'DH-002', customer: 'Công ty B', total: '2000' },
];

const STATE: DataTableState = { page: 1, limit: 50 };

function renderTable(over: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  return renderWithProviders(
    <DataTable<Row>
      tableKey="test-orders"
      columns={COLUMNS}
      rows={ROWS}
      state={STATE}
      onStateChange={vi.fn()}
      status="success"
      getRowId={(r) => r.id}
      {...over}
    />,
  );
}

/**
 * Mở menu "Cột", bấm một mục, rồi CHỜ MENU ĐÓNG trước khi trả về.
 *
 * Hai lý do phải gói lại thay vì mở menu một lần rồi bấm nhiều mục:
 *  1. DropdownMenu của Radix là modal — khi mở, nó đặt aria-hidden lên phần
 *     còn lại của trang nên getAllByRole('columnheader') KHÔNG thấy gì.
 *  2. Menu tự đóng sau mỗi lần bấm, nên tham chiếu `menu` cũ thành rác.
 */
async function clickInColumnMenu(
  role: 'checkbox' | 'button' | 'menuitem',
  name: string | RegExp,
): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Cột/ }));
  const menu = within(await screen.findByRole('menu'));
  await user.click(menu.getByRole(role, { name }));
  if (screen.queryByRole('menu')) {
    await user.keyboard('{Escape}');
  }
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
}

beforeEach(() => {
  localStorage.clear();
});

describe('DataTable — cấu hình cột (§5.5, GĐ A)', () => {
  it('đổi thứ tự cột bằng BÀN PHÍM, không chỉ kéo-thả', async () => {
    // Kéo-thả không tiếp cận được bằng bàn phím. Nếu chỉ có kéo-thả thì đổi
    // thứ tự cột là tính năng chỉ một phần người dùng chạm tới được (§8.4).
    renderTable();
    const headersBefore = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim());
    expect(headersBefore?.[0]).toContain('Mã');

    await clickInColumnMenu('button', 'Chuyển Mã sang phải');

    const headersAfter = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim());
    expect(headersAfter[0]).toContain('Khách hàng');
    expect(headersAfter[1]).toContain('Mã');
  });

  it('ẩn cột thì cột biến mất khỏi cả header lẫn body', async () => {
    renderTable();
    await clickInColumnMenu('checkbox', 'Khách hàng');

    expect(
      screen.getAllByRole('columnheader').map((h) => h.textContent?.trim()),
    ).not.toContain('Khách hàng');
    expect(screen.queryByText('Công ty A')).toBeNull();
  });

  it('ghim cột: header và ô đều sticky, có nền riêng', async () => {
    // Thiếu nền riêng thì nội dung cột bên dưới trượt qua và chồng chữ.
    renderTable();
    await clickInColumnMenu('button', 'Ghim Khách hàng');

    const pinnedHeader = screen
      .getAllByRole('columnheader')
      .find((h) => h.textContent?.includes('Khách hàng'))!;
    expect(pinnedHeader).toHaveAttribute('data-pinned', 'true');
    expect(pinnedHeader.className).toContain('sticky');
    expect(pinnedHeader.getAttribute('style')).toContain('background');
  });

  it('preset stickyFirstColumn quyết cột ghim mặc định', () => {
    expect(PRESETS.enterprise.behavior.table.stickyFirstColumn).toBe(true);
    renderTable();
    const first = screen.getAllByRole('columnheader')[0];
    expect(first).toHaveAttribute('data-pinned', 'true');
  });

  it('resize bằng mũi tên trái/phải — chuột không phải ai cũng dùng được', async () => {
    const user = userEvent.setup();
    renderTable();
    const handle = screen.getByRole('separator', { name: 'Đổi bề rộng cột Mã' });
    const before = Number(handle.getAttribute('aria-valuenow'));

    handle.focus();
    await user.keyboard('{ArrowRight}');

    const after = Number(
      screen.getByRole('separator', { name: 'Đổi bề rộng cột Mã' }).getAttribute('aria-valuenow'),
    );
    expect(after).toBeGreaterThan(before);
  });

  it('cấu hình cột sống qua lần mở lại — lưu localStorage theo tableKey', async () => {
    const { unmount } = renderTable();
    await clickInColumnMenu('checkbox', 'Thành tiền');
    unmount();

    renderTable();
    expect(
      screen.getAllByRole('columnheader').map((h) => h.textContent?.trim()),
    ).not.toContain('Thành tiền');
  });

  it('cấu hình bảng A KHÔNG dính sang bảng B', async () => {
    const { unmount } = renderTable();
    await clickInColumnMenu('checkbox', 'Thành tiền');
    unmount();

    renderTable({ tableKey: 'test-customers' });
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())).toContain(
      'Thành tiền',
    );
  });

  it('"Khôi phục mặc định" xoá sạch tuỳ biến', async () => {
    renderTable();
    await clickInColumnMenu('checkbox', 'Thành tiền');
    await clickInColumnMenu('menuitem', /Khôi phục mặc định/);

    expect(screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())).toContain(
      'Thành tiền',
    );
  });

  it('localStorage hỏng không làm chết bảng — mất tuỳ biến còn hơn màn trắng', () => {
    localStorage.setItem('dt-config:test-orders', '{ đây không phải JSON');
    renderTable();
    expect(screen.getByText('DH-001')).toBeInTheDocument();
  });
});

describe('DataTable — kích thước theo token, không phải số cứng', () => {
  it('dòng lấy chiều cao từ --table-row-h', () => {
    const { container } = renderTable();
    const row = container.querySelector('tbody tr')!;
    expect(row.getAttribute('style')).toContain('var(--table-row-h)');
  });

  it('cỡ chữ bảng lấy từ --table-font-size', () => {
    const { container } = renderTable();
    expect(container.querySelector('table')!.getAttribute('style')).toContain(
      'var(--table-font-size)',
    );
  });

  it('danh sách số bản ghi/trang chứa defaultPageSize của preset', () => {
    renderTable({ meta: { page: 1, totalPages: 1, total: 2, hasNext: false } });
    const select = screen.getByRole('combobox', { name: 'Số bản ghi mỗi trang' });
    const options = within(select).getAllByRole('option').map((o) => Number(o.getAttribute('value')));
    expect(options).toContain(PRESETS.enterprise.behavior.table.defaultPageSize);
  });
});

describe('DataTable — bốn trạng thái (§5.5)', () => {
  it('"không khớp bộ lọc" KHÁC "chưa có dữ liệu": có nút xoá lọc', () => {
    const onClear = vi.fn();
    renderTable({ rows: [], isFiltered: true, onClearFilters: onClear });
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeInTheDocument();
  });

  it('rỗng mà không lọc thì hiện CTA tạo mới, KHÔNG hiện nút xoá lọc', () => {
    renderTable({ rows: [], emptyCta: <button type="button">Tạo đơn</button> });
    expect(screen.getByRole('button', { name: 'Tạo đơn' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).toBeNull();
  });

  it('lỗi thì có nút thử lại và gọi đúng callback', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderTable({ status: 'error', onRetry });
    await user.click(screen.getByRole('button', { name: /Thử lại/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
