import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import ProductImportPage from './page';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/mocks/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/products/import',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mePerms = (permissions: string[]) =>
  server.use(
    http.get(`${API}/api/v1/me`, () =>
      HttpResponse.json({
        id: 'user-1',
        email: 'admin@tenant-a.local',
        fullName: 'Quản trị A',
        membershipId: 'mem-1',
        tenant: { id: 'tenant-a', code: 'TENANT-A', name: 'Tenant A' },
        orgUnit: null,
        roles: [],
        permissions,
      }),
    ),
  );

const CSV = 'code,nameVi,baseUom\nSP100,Hàng A,CAI\nSP101,,CAI';

describe('ProductImportPage (Phase 4b — §4.7)', () => {
  it('dán CSV → POST rows đã parse → poll job tới COMPLETED, hiện đếm hợp lệ/lỗi', async () => {
    mePerms(['product:import']);
    let postedRows: unknown = null;
    server.use(
      http.post(`${API}/api/v1/products/import`, async ({ request }) => {
        postedRows = ((await request.json()) as { rows: unknown }).rows;
        return HttpResponse.json({ jobId: 'job-9', totalRows: 2 }, { status: 202 });
      }),
    );
    renderWithProviders(<ProductImportPage />);

    await userEvent.click(await screen.findByLabelText(/Dán CSV/));
    await userEvent.paste(CSV);
    await userEvent.click(screen.getByRole('button', { name: 'Import 2 dòng' }));

    await waitFor(() =>
      expect(postedRows).toEqual([
        { code: 'SP100', nameVi: 'Hàng A', baseUom: 'CAI' },
        { code: 'SP101', nameVi: '', baseUom: 'CAI' },
      ]),
    );
    // Poll handler mặc định trả COMPLETED — màn kết quả
    expect(await screen.findByText('Hoàn tất')).toBeInTheDocument();
    expect(screen.getByText(/hợp lệ 2/)).toBeInTheDocument();
  });

  it('job có dòng lỗi → bảng lỗi TỪNG DÒNG; "Sửa & tải lại" đưa đúng dòng lỗi về textarea', async () => {
    mePerms(['product:import']);
    server.use(
      http.get(`${API}/api/v1/import-jobs/:id`, () =>
        HttpResponse.json({
          id: 'job-9',
          status: 'COMPLETED',
          totalRows: 2,
          validRows: 1,
          errorRows: 1,
          lastProcessedRow: 2,
        }),
      ),
      http.get(`${API}/api/v1/import-jobs/:id/errors`, () =>
        HttpResponse.json([
          {
            rowNumber: 2,
            raw: { code: 'SP101', nameVi: '', baseUom: 'CAI' },
            errors: { nameVi: ['Thiếu tên'] },
          },
        ]),
      ),
    );
    renderWithProviders(<ProductImportPage />);

    await userEvent.click(await screen.findByLabelText(/Dán CSV/));
    await userEvent.paste(CSV);
    await userEvent.click(screen.getByRole('button', { name: 'Import 2 dòng' }));

    expect(await screen.findByText(/nameVi: Thiếu tên/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Sửa & tải lại 1 dòng lỗi/ }));

    // Quay lại bước dán với CHỈ dòng lỗi, giữ nguyên header
    const textarea = await screen.findByLabelText(/Dán CSV/);
    expect(textarea).toHaveValue('code,nameVi,baseUom\nSP101,,CAI');
  });

  it('thiếu product:import → thông báo quyền, không có wizard', async () => {
    mePerms([]);
    renderWithProviders(<ProductImportPage />);

    expect(await screen.findByText(/product:import/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Dán CSV/)).not.toBeInTheDocument();
  });
});
