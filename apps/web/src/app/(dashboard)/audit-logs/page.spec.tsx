import { describe, it, expect, vi } from 'vitest';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { http, HttpResponse } from 'msw';
import Page from './page';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { server } from '@/mocks/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/audit-logs',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * V12 — trang tra cứu audit (§4.9): dữ liệu từ MSW handler audit-logs,
 * bộ lọc entity/action từ URL đi thẳng vào request, 403 hiển thị tử tế.
 */
function renderPage(searchParams = '') {
  return renderWithProviders(
    <NuqsTestingAdapter searchParams={searchParams}>
      <Page />
    </NuqsTestingAdapter>,
  );
}

describe('AuditLogsPage (V12)', () => {
  it('render dòng audit từ API: hành động + người thao tác + field đổi', async () => {
    renderPage();

    // KHÔNG chờ bằng 'SUBMIT' — nó khớp ngay <option> của select lọc
    expect((await screen.findAllByText('Nhân viên A')).length).toBeGreaterThanOrEqual(2);
    // changedKeys từ before/after của aud-2: { status } → cột "Field đổi"
    expect(screen.getAllByText('status').length).toBeGreaterThanOrEqual(1);
  });

  it('entity + action trên URL → vào query string của request + chip hiện', async () => {
    let seenEntity: string | null = null;
    let seenAction: string | null = null;
    server.use(
      http.get(`${API}/api/v1/audit-logs`, ({ request }) => {
        const sp = new URL(request.url).searchParams;
        seenEntity = sp.get('entity');
        seenAction = sp.get('action');
        return HttpResponse.json({
          data: [],
          meta: { page: 1, limit: 20, total: 0, totalPages: 1, hasNext: false },
        });
      }),
    );
    renderPage('?entity=Order&action=APPROVE');

    await waitFor(() => {
      expect(seenEntity).toBe('Order');
      expect(seenAction).toBe('APPROVE');
    });
    expect(screen.getByRole('button', { name: /Bỏ lọc Đối tượng/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bỏ lọc Hành động/ })).toBeInTheDocument();
  });

  it('403 → thông báo thiếu quyền audit:read, không hiện bảng', async () => {
    server.use(
      http.get(`${API}/api/v1/audit-logs`, () =>
        HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Không có quyền', traceId: 't' } },
          { status: 403 },
        ),
      ),
    );
    renderPage();

    expect(await screen.findByText(/audit:read/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
