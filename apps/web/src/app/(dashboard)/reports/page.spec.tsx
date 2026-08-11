import { describe, it, expect, vi } from 'vitest';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { http, HttpResponse } from 'msw';
import ReportsPage from './page';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/mocks/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/reports',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderPage(searchParams = '') {
  return renderWithProviders(
    <NuqsTestingAdapter searchParams={searchParams}>
      <ReportsPage />
    </NuqsTestingAdapter>,
  );
}

describe('ReportsPage (Phase 4a — A1)', () => {
  it('form sinh ĐỘNG từ meta: dateRange bắt buộc → nút Chạy khoá tới khi đủ from/to', async () => {
    renderPage('?id=sales-by-customer');

    // Form dựng từ meta — hai ô ngày của param dateRange
    const from = await screen.findByLabelText('Khoảng ngày từ');
    const runBtn = screen.getByRole('button', { name: 'Chạy báo cáo' });
    expect(runBtn).toBeDisabled(); // required chưa có giá trị

    await userEvent.type(from, '2026-08-01');
    await userEvent.type(screen.getByLabelText('Khoảng ngày đến'), '2026-08-11');
    expect(runBtn).toBeEnabled();
  });

  it('chạy → POST params ĐÚNG shape {from,to} ISO; bảng + dòng tổng + drill-down là LINK thật', async () => {
    let posted: { params?: { period?: { from?: string; to?: string } } } | null = null;
    server.use(
      http.post(`${API}/api/v1/reports/:id/run`, async ({ request }) => {
        posted = (await request.json()) as typeof posted;
        return HttpResponse.json({
          columns: [
            { key: 'customerCode', label: 'Mã KH' },
            { key: 'revenue', label: 'Doanh thu', type: 'money', summary: 'sum' },
          ],
          rows: [{ customerCode: 'KH-01', revenue: '1200000' }],
          summary: { revenue: '1200000' },
          drilldowns: ['/orders?filter[customerId][eq]=c-1'],
          cached: false,
        });
      }),
    );
    renderPage('?id=sales-by-customer');

    await userEvent.type(await screen.findByLabelText('Khoảng ngày từ'), '2026-08-01');
    await userEvent.type(screen.getByLabelText('Khoảng ngày đến'), '2026-08-11');
    await userEvent.click(screen.getByRole('button', { name: 'Chạy báo cáo' }));

    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.params!.period!.from).toBe('2026-08-01T00:00:00.000Z');
    expect(posted!.params!.period!.to).toBe('2026-08-11T23:59:59.999Z'); // HẾT ngày cuối

    // Drill-down: cột đầu là link thật tới màn danh sách đã filter
    const link = await screen.findByRole('link', { name: 'KH-01' });
    expect(link).toHaveAttribute('href', '/orders?filter[customerId][eq]=c-1');
    // Dòng tổng theo summary
    expect(screen.getAllByText(/1[.,]200[.,]000/).length).toBeGreaterThanOrEqual(2);
  });

  it('cột field-level bị BE loại khỏi meta → bảng không bao giờ render nó (§4.4c nơi 3)', async () => {
    // meta mặc định (MSW) KHÔNG có cột margin — như user thiếu field:cost
    renderPage('?id=sales-by-customer');

    await userEvent.type(await screen.findByLabelText('Khoảng ngày từ'), '2026-08-01');
    await userEvent.type(screen.getByLabelText('Khoảng ngày đến'), '2026-08-11');
    await userEvent.click(screen.getByRole('button', { name: 'Chạy báo cáo' }));

    expect(await screen.findByText('Khách A')).toBeInTheDocument();
    expect(screen.queryByText('Lãi gộp')).not.toBeInTheDocument();
  });
});
