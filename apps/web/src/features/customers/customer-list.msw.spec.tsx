import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { useQuery } from '@tanstack/react-query';
import { customersControllerList } from '@nexus/api-client';
import { server } from '@/mocks/server';
import { apiError } from '@/mocks/handlers';
import { renderWithProviders, screen, waitFor } from '@/test/render';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Thành phần tối giản dùng ĐÚNG hook sinh từ OpenAPI (§2.4) */
function CustomerCodes() {
  const q = useQuery({
    queryKey: ['customers'],
    queryFn: () =>
      customersControllerList({ page: 1, limit: 20 }) as unknown as Promise<{
        data: Array<{ id: string; code: string }>;
      }>,
  });
  if (q.isPending) return <p>Đang tải…</p>;
  if (q.isError) return <p role="alert">Lỗi tải danh sách</p>;
  return (
    <ul>
      {q.data.data.map((c) => (
        <li key={c.id}>{c.code}</li>
      ))}
    </ul>
  );
}

/**
 * TẦNG 3 (mẫu) — MSW chặn ở TẦNG NETWORK.
 * Đi qua axios thật + mutator + error mapping, nên đổi tên hàm sinh tự động
 * hay đổi baseURL đều làm test đỏ — đúng như mong muốn.
 */
describe('customers list — tầng 3: MSW network', () => {
  it('render dữ liệu từ response đúng contract §3.2', async () => {
    renderWithProviders(<CustomerCodes />);
    await waitFor(() => expect(screen.getByText('KH001')).toBeInTheDocument());
    expect(screen.getByText('KH002')).toBeInTheDocument();
  });

  it('BE trả lỗi §3.6 → nhánh lỗi chạy, không treo ở "Đang tải…"', async () => {
    server.use(
      http.get(`${API}/api/v1/customers`, () => apiError('COMMON.INTERNAL_ERROR', 500)),
    );
    renderWithProviders(<CustomerCodes />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('response RỖNG vẫn render được (không vỡ vì data undefined)', async () => {
    server.use(
      http.get(`${API}/api/v1/customers`, () =>
        HttpResponse.json({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1, hasNext: false } }),
      ),
    );
    const { container } = renderWithProviders(<CustomerCodes />);
    await waitFor(() => expect(container.querySelector('ul')).toBeInTheDocument());
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });
});
