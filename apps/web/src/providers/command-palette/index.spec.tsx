import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { CommandPaletteProvider, useCommandPalette } from './index';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/mocks/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: (href: string) => pushMock(href) }),
  usePathname: () => '/orders',
  useSearchParams: () => new URLSearchParams(),
}));

function OpenButton() {
  const palette = useCommandPalette();
  return (
    <button type="button" onClick={palette.open}>
      Mở palette
    </button>
  );
}

function renderPalette() {
  return renderWithProviders(
    <CommandPaletteProvider>
      <OpenButton />
    </CommandPaletteProvider>,
  );
}

describe('CommandPalette — recent/favorites (V13 §5C.7)', () => {
  it('palette rỗng hiện nhóm Đã ghim + Vừa xem; mục trùng ghim không lặp ở vừa xem', async () => {
    server.use(
      http.get(`${API}/api/v1/favorite-items`, () =>
        HttpResponse.json([
          {
            entity: 'Order',
            entityId: 'ord-1',
            code: 'ORD-2026-00001',
            label: 'Đơn VIP tháng 8',
            href: '/orders/ord-1',
          },
        ]),
      ),
      http.get(`${API}/api/v1/recent-items`, () =>
        HttpResponse.json([
          // Trùng với mục đã ghim → phải bị loại khỏi "Vừa xem"
          {
            entity: 'Order',
            entityId: 'ord-1',
            code: 'ORD-2026-00001',
            label: 'ORD-2026-00001 · APPROVED',
            href: '/orders/ord-1',
          },
          {
            entity: 'Product',
            entityId: 'prd-1',
            code: 'SP-001',
            label: 'Sản phẩm A',
            href: '/products/prd-1',
          },
        ]),
      ),
    );
    renderPalette();
    await userEvent.click(screen.getByRole('button', { name: 'Mở palette' }));

    expect(await screen.findByText('Đã ghim')).toBeInTheDocument();
    expect(screen.getByText('Đơn VIP tháng 8')).toBeInTheDocument();
    expect(await screen.findByText('Vừa xem')).toBeInTheDocument();
    expect(screen.getByText('Sản phẩm A')).toBeInTheDocument();
    // ord-1 đã ở nhóm ghim — không xuất hiện lần hai
    expect(screen.getAllByText('ORD-2026-00001')).toHaveLength(1);
  });

  it('chọn mục vừa xem → điều hướng theo href BE trả về', async () => {
    server.use(
      http.get(`${API}/api/v1/recent-items`, () =>
        HttpResponse.json([
          {
            entity: 'Product',
            entityId: 'prd-1',
            code: 'SP-001',
            label: 'Sản phẩm A',
            href: '/products/prd-1',
          },
        ]),
      ),
    );
    renderPalette();
    await userEvent.click(screen.getByRole('button', { name: 'Mở palette' }));

    await userEvent.click(await screen.findByText('Sản phẩm A'));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/products/prd-1'));
  });

  it('gõ chữ → nhóm ghim/vừa xem NHƯỜNG chỗ cho kết quả tìm', async () => {
    server.use(
      http.get(`${API}/api/v1/recent-items`, () =>
        HttpResponse.json([
          {
            entity: 'Product',
            entityId: 'prd-1',
            code: 'SP-001',
            label: 'Sản phẩm A',
            href: '/products/prd-1',
          },
        ]),
      ),
    );
    renderPalette();
    await userEvent.click(screen.getByRole('button', { name: 'Mở palette' }));
    expect(await screen.findByText('Vừa xem')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('combobox'), 'khach');
    await waitFor(() => expect(screen.queryByText('Vừa xem')).not.toBeInTheDocument());
  });
});
