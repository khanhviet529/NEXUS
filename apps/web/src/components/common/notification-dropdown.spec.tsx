import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { NotificationDropdown } from './notification-dropdown';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/mocks/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: (href: string) => pushMock(href) }),
  usePathname: () => '/orders',
  useSearchParams: () => new URLSearchParams(),
}));

const NOTI = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'noti-1',
  type: 'ORDER_APPROVED',
  title: 'Đơn ORD-2026-00001 đã duyệt',
  body: 'Người duyệt: Trưởng phòng B',
  data: { entity: 'Order', entityId: 'ord-1' },
  readAt: null,
  createdAt: '2026-08-11T07:00:00.000Z',
  ...over,
});

function mockList(rows: unknown[], count: number) {
  server.use(
    http.get(`${API}/api/v1/notifications/unread-count`, () => HttpResponse.json({ count })),
    http.get(`${API}/api/v1/notifications`, () =>
      HttpResponse.json({
        data: rows,
        meta: { page: 1, limit: 10, total: rows.length, totalPages: 1, hasNext: false },
      }),
    ),
  );
}

describe('NotificationDropdown (V13)', () => {
  it('badge số chưa đọc trên chuông; mở dropdown thấy tiêu đề thông báo', async () => {
    mockList([NOTI()], 3);
    renderWithProviders(<NotificationDropdown />);

    const bell = screen.getByRole('button', { name: 'Thông báo' });
    expect(await screen.findByText('3')).toBeInTheDocument();

    await userEvent.click(bell);
    expect(await screen.findByText('Đơn ORD-2026-00001 đã duyệt')).toBeInTheDocument();
    expect(screen.getByLabelText('Chưa đọc')).toBeInTheDocument();
  });

  it('bấm thông báo chưa đọc → POST :id/read + điều hướng theo data.entity', async () => {
    mockList([NOTI()], 1);
    let readId: string | null = null;
    server.use(
      http.post(`${API}/api/v1/notifications/:id/read`, ({ params }) => {
        readId = params.id as string;
        return HttpResponse.json({ ok: true });
      }),
    );
    renderWithProviders(<NotificationDropdown />);

    await userEvent.click(screen.getByRole('button', { name: 'Thông báo' }));
    await userEvent.click(await screen.findByText('Đơn ORD-2026-00001 đã duyệt'));

    await waitFor(() => expect(readId).toBe('noti-1'));
    expect(pushMock).toHaveBeenCalledWith('/orders/ord-1');
  });

  it('"Đánh dấu tất cả đã đọc" gọi read-all; đã đọc hết thì nút biến mất', async () => {
    mockList([NOTI({ readAt: null })], 2);
    let calledAll = false;
    server.use(
      http.post(`${API}/api/v1/notifications/read-all`, () => {
        calledAll = true;
        // Sau read-all: server trả không còn chưa đọc
        mockList([NOTI({ readAt: '2026-08-11T08:00:00.000Z' })], 0);
        return HttpResponse.json({ updated: 2 });
      }),
    );
    renderWithProviders(<NotificationDropdown />);

    await userEvent.click(screen.getByRole('button', { name: 'Thông báo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Đánh dấu tất cả đã đọc' }));

    await waitFor(() => expect(calledAll).toBe(true));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Đánh dấu tất cả đã đọc' })).not.toBeInTheDocument(),
    );
  });
});
