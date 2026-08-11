import { describe, it, expect, vi } from 'vitest';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { http, HttpResponse } from 'msw';
import Page from './page';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/mocks/server';
import { CommandPaletteProvider } from '@/providers/command-palette';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/orders',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * V11 — FilterBar vào trang orders: chip bộ lọc NHÌN THẤY được, status đi
 * vào filter DSL, export theo ĐÚNG bộ lọc hiện tại (§5.5).
 */
function renderPage(searchParams = '') {
  return renderWithProviders(
    <NuqsTestingAdapter searchParams={searchParams}>
      <CommandPaletteProvider>
        <Page />
      </CommandPaletteProvider>
    </NuqsTestingAdapter>,
  );
}

describe('OrdersPage + FilterBar (V11)', () => {
  it('status trên URL → chip hiển thị + filter DSL đi vào request', async () => {
    let seenFilter: string | null = null;
    server.use(
      http.get(`${API}/api/v1/orders`, ({ request }) => {
        seenFilter = new URL(request.url).searchParams.get('filter[status][eq]');
        return HttpResponse.json({
          data: [],
          meta: { page: 1, limit: 20, total: 0, totalPages: 1, hasNext: false },
        });
      }),
    );
    renderPage('?status=PENDING');

    // Chip bộ lọc đang bật phải NHÌN THẤY được (luật 1 của FilterBar) —
    // chip có nút xoá riêng, phân biệt với <select> cũng chứa chữ "Trạng thái"
    await waitFor(() => expect(seenFilter).toBe('PENDING'));
    expect(
      await screen.findByRole('button', { name: /Bỏ lọc Trạng thái/ }),
    ).toBeInTheDocument();
  });

  it('gõ ô tìm kiếm + Enter → q vào request (không chờ debounce)', async () => {
    const seenQ: Array<string | null> = [];
    server.use(
      http.get(`${API}/api/v1/orders`, ({ request }) => {
        seenQ.push(new URL(request.url).searchParams.get('q'));
        return HttpResponse.json({
          data: [],
          meta: { page: 1, limit: 20, total: 0, totalPages: 1, hasNext: false },
        });
      }),
    );
    renderPage();
    const input = await screen.findByRole('searchbox');
    await userEvent.type(input, 'ORD-2026{Enter}');
    await waitFor(() => expect(seenQ).toContain('ORD-2026'));
  });

  it('nút Xuất CSV có mặt khi có quyền order:export (fixture /me có) — endpoint mang bộ lọc', async () => {
    server.use(
      http.get(`${API}/api/v1/me`, () =>
        HttpResponse.json({
          id: 'user-1',
          email: 'staff@tenant-a.local',
          fullName: 'Nhân viên A',
          membershipId: 'mem-1',
          tenant: { id: 'tenant-a', code: 'TENANT-A', name: 'Tenant A' },
          orgUnit: null,
          roles: [{ code: 'STAFF', name: 'STAFF' }],
          permissions: ['order:read', 'order:export'],
        }),
      ),
    );
    renderPage('?status=APPROVED');
    expect(await screen.findByRole('button', { name: /Xuất CSV/ })).toBeInTheDocument();
  });
});
