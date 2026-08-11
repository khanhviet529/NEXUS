import { describe, it, expect } from 'vitest';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { http, HttpResponse } from 'msw';
import Page from './page';
import { renderWithProviders, screen } from '@/test/render';
import { server } from '@/mocks/server';
import { paginated } from '@/mocks/handlers';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * V10 — trang products sinh từ `gen:module-fe` rồi nâng theo checklist
 * generator. Spec đi kèm CÙNG PR (check #6).
 */
function renderPage(searchParams = '') {
  return renderWithProviders(
    <NuqsTestingAdapter searchParams={searchParams}>
      <Page />
    </NuqsTestingAdapter>,
  );
}

describe('ProductsPage (V10)', () => {
  it('render DataTable với dữ liệu từ hook sinh tự động', async () => {
    renderPage();
    expect(await screen.findByText('SP001')).toBeInTheDocument();
    expect(screen.getByText('Sản phẩm A')).toBeInTheDocument();
    expect(screen.getByText('CAI')).toBeInTheDocument();
    // fixture KHÔNG có costPrice → cột Giá vốn không xuất hiện (§4.4c: BE quyết)
    expect(screen.queryByText('Giá vốn')).not.toBeInTheDocument();
  });

  it('BE trả costPrice (user có field:cost) → cột Giá vốn xuất hiện', async () => {
    server.use(
      http.get(`${API}/api/v1/products`, () =>
        HttpResponse.json(
          paginated([
            {
              id: 'prd-1',
              code: 'SP001',
              name: 'Sản phẩm A',
              baseUom: 'CAI',
              trackingType: 'NONE',
              costPrice: '60000',
              version: 1,
              createdAt: '2026-08-01T00:00:00.000Z',
            },
          ]),
        ),
      ),
    );
    renderPage();
    expect(await screen.findByText('Giá vốn')).toBeInTheDocument();
    expect(screen.getByText('60000')).toBeInTheDocument();
  });

  it('đọc q từ URL — URL là nguồn sự thật (§5.4): F5/copy link giữ bộ lọc', async () => {
    let seenQ: string | null = null;
    server.use(
      http.get(`${API}/api/v1/products`, ({ request }) => {
        seenQ = new URL(request.url).searchParams.get('q');
        return HttpResponse.json(paginated([]));
      }),
    );
    renderPage('?q=ao thun');
    await screen.findByText(/không có dữ liệu|Không khớp|trống/i).catch(() => undefined);
    // Khẳng định cốt lõi: tham số q trên URL đi thẳng vào request
    expect(seenQ).toBe('ao thun');
  });
});
