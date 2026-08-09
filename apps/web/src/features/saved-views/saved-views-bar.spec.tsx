import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { SavedViewsBar } from './saved-views-bar';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/orders',
  useSearchParams: () => new URLSearchParams('status=PENDING&page=1'),
}));

const view = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'v1',
  entity: 'Order',
  name: 'Đơn chờ duyệt',
  config: { search: 'status=PENDING&page=1' },
  isDefault: false,
  isShared: false,
  membershipId: 'mem-1',
  ...over,
});

const mockList = (views: unknown[]) =>
  server.use(http.get(`${API}/api/v1/saved-views`, () => HttpResponse.json(views)));

describe('SavedViewsBar (§5.5 saved views)', () => {
  it('áp dụng view = GHI LẠI URL (§5.4 URL là nguồn sự thật)', async () => {
    mockList([view({ config: { search: 'status=APPROVED&page=2' }, name: 'Đã duyệt' })]);
    renderWithProviders(<SavedViewsBar entity="Order" membershipId="mem-1" />);

    const btn = await screen.findByRole('button', { name: 'Áp dụng view Đã duyệt' });
    await userEvent.click(btn);
    expect(replace).toHaveBeenCalledWith('/orders?status=APPROVED&page=2');
  });

  it('view TRÙNG bộ lọc hiện tại được đánh dấu đang áp dụng', async () => {
    mockList([view()]);
    renderWithProviders(<SavedViewsBar entity="Order" membershipId="mem-1" />);
    const btn = await screen.findByRole('button', { name: 'Áp dụng view Đơn chờ duyệt' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('view NGƯỜI KHÁC chia sẻ là CHỈ ĐỌC — không có menu sửa/xoá', async () => {
    mockList([
      view({ id: 'v-mine', name: 'Của tôi', membershipId: 'mem-1' }),
      view({ id: 'v-other', name: 'Của sếp', membershipId: 'mem-2', isShared: true }),
    ]);
    renderWithProviders(<SavedViewsBar entity="Order" membershipId="mem-1" />);

    await screen.findByRole('button', { name: 'Áp dụng view Của sếp' });
    expect(screen.getByLabelText('Tuỳ chọn view Của tôi')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tuỳ chọn view Của sếp')).not.toBeInTheDocument();
  });

  it('lưu view gửi ĐÚNG bộ lọc hiện tại + cột đang ẩn', async () => {
    mockList([]);
    let posted: Record<string, unknown> = {};
    server.use(
      http.post(`${API}/api/v1/saved-views`, async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'new' }, { status: 201 });
      }),
    );
    renderWithProviders(
      <SavedViewsBar entity="Order" membershipId="mem-1" hiddenColumns={['margin']} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Lưu bộ lọc hiện tại/ }));
    await userEvent.type(screen.getByLabelText('Tên view'), 'View mới');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(posted.name).toBe('View mới'));
    expect(posted.entity).toBe('Order');
    expect(posted.config).toEqual({ search: 'status=PENDING&page=1', hiddenColumns: ['margin'] });
    expect(posted.isShared).toBe(false);
  });

  it('không cho lưu khi chưa đặt tên', async () => {
    mockList([]);
    renderWithProviders(<SavedViewsBar entity="Order" membershipId="mem-1" />);
    await userEvent.click(screen.getByRole('button', { name: /Lưu bộ lọc hiện tại/ }));
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
  });

  it('xoá view PHẢI qua xác nhận (§5.7) — huỷ thì không gọi API', async () => {
    mockList([view()]);
    const onDelete = vi.fn();
    server.use(
      http.delete(`${API}/api/v1/saved-views/v1`, () => {
        onDelete();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<SavedViewsBar entity="Order" membershipId="mem-1" />);

    await userEvent.click(await screen.findByLabelText('Tuỳ chọn view Đơn chờ duyệt'));
    await userEvent.click(screen.getByText('Xoá view'));
    await waitFor(() => expect(screen.getByText(/Xoá view "Đơn chờ duyệt"/)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    await waitFor(() => expect(onDelete).not.toHaveBeenCalled());
  });
});
