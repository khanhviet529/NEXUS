import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import InventoryPage from './page';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/mocks/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/inventory',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mePerms = (permissions: string[]) =>
  server.use(
    http.get(`${API}/api/v1/me`, () =>
      HttpResponse.json({
        id: 'user-1',
        email: 'thukho@tenant-a.local',
        fullName: 'Thủ kho A',
        membershipId: 'mem-1',
        tenant: { id: 'tenant-a', code: 'TENANT-A', name: 'Tenant A' },
        orgUnit: null,
        roles: [],
        permissions,
      }),
    ),
  );

describe('InventoryPage (Phase 4b — §5B.2/B4)', () => {
  it('bảng số dư: nhãn kho/sản phẩm ĐÃ resolve từ BE, đủ 4 cột số', async () => {
    mePerms(['stock:read']);
    renderWithProviders(<InventoryPage />);

    expect(await screen.findByText('KHO-A')).toBeInTheDocument();
    expect(screen.getByText('Sản phẩm A')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument(); // available = onHand - reserved
  });

  it('xuất kho: refId GIỮ NGUYÊN khi retry sau lỗi (dedup #23), STOCK.INSUFFICIENT hiện tử tế', async () => {
    mePerms(['stock:read', 'stock:issue']);
    const seenRefIds: string[] = [];
    let failFirst = true;
    server.use(
      http.post(`${API}/api/v1/inventory/issues`, async ({ request }) => {
        const body = (await request.json()) as { refId: string };
        seenRefIds.push(body.refId);
        if (failFirst) {
          failFirst = false;
          // Envelope lỗi PHẲNG — getApiError đọc response.data.code trực tiếp
          return HttpResponse.json(
            { code: 'STOCK.INSUFFICIENT', message: 'Không đủ tồn', traceId: 't' },
            { status: 422 },
          );
        }
        return HttpResponse.json({ movementId: 'mv-9', duplicate: false }, { status: 201 });
      }),
    );
    renderWithProviders(<InventoryPage />);

    await userEvent.selectOptions(await screen.findByLabelText('Loại phiếu'), 'ISSUE');
    await userEvent.selectOptions(screen.getByLabelText('Kho'), 'wh-1');
    await userEvent.selectOptions(screen.getByLabelText('Sản phẩm'), 'prd-1');
    await userEvent.type(screen.getByLabelText('Số lượng'), '99');
    await userEvent.click(screen.getByRole('button', { name: 'Xuất kho' }));

    // Lỗi nghiệp vụ → alert tại chỗ, KHÔNG phải toast hệ thống
    expect(await screen.findByRole('alert')).toHaveTextContent(/tồn KHẢ DỤNG/);

    // Retry cùng phiếu → CÙNG refId (dedup của BE mới có tác dụng)
    await userEvent.click(screen.getByRole('button', { name: 'Xuất kho' }));
    await waitFor(() => expect(seenRefIds).toHaveLength(2));
    expect(seenRefIds[0]).toBe(seenRefIds[1]);
  });

  it('thiếu cả stock:receive lẫn stock:issue → không render form phiếu', async () => {
    mePerms(['stock:read']);
    renderWithProviders(<InventoryPage />);

    expect(await screen.findByText('KHO-A')).toBeInTheDocument();
    expect(screen.queryByText('Ghi phiếu kho')).not.toBeInTheDocument();
  });
});
