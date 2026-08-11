import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http } from 'msw';
import { OrderDetailScreen } from './page';
import { renderWithProviders } from '@/test/render';
import { server } from '@/mocks/server';
import { apiError } from '@/mocks/handlers';
import { CommandPaletteProvider } from '@/providers/command-palette';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Quy ước repo (saved-views-bar.spec): mock next/navigation ở tầng module —
// jsdom không có App Router thật
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/orders/ord-1',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * V9 — trang chi tiết đơn: 4 khối (thông tin · dòng hàng · lịch sử · tệp).
 * MSW chặn tầng network (mocks/handlers.ts) — test đi đúng đường axios thật.
 * Bọc CommandPaletteProvider vì useActionShortcuts đăng ký vào Cmd+K.
 */
function renderPage(id = 'ord-1') {
  return renderWithProviders(
    <CommandPaletteProvider>
      <OrderDetailScreen id={id} />
    </CommandPaletteProvider>,
  );
}

describe('OrderDetailPage (V9)', () => {
  it('render đủ 4 khối: thông tin, dòng hàng, lịch sử, tệp đính kèm', async () => {
    renderPage();

    // Thông tin — tiêu đề là mã đơn + khách hàng ĐÃ resolve locale (§3.10)
    expect(await screen.findByRole('heading', { name: 'ORD-2026-00001' })).toBeInTheDocument();
    expect(screen.getByText('KH001 — Công ty A')).toBeInTheDocument();

    // Dòng hàng — tên CHỐT lúc phát sinh, kể cả khi sản phẩm đã đổi tên (§3.10 luật 2)
    const items = screen.getByRole('heading', { name: /Dòng hàng \(2\)/ }).closest('section')!;
    expect(within(items).getByText('Sản phẩm A')).toBeInTheDocument();
    expect(
      within(items).getByText('Sản phẩm B (đã đổi tên sau khi tạo đơn)'),
    ).toBeInTheDocument();
    // Dòng tổng cộng ở footer (§5.5)
    expect(within(items).getByText('Tổng cộng')).toBeInTheDocument();

    // Lịch sử — AuditTimeline (§4.9): action ngữ nghĩa + actor + field đổi
    const audit = await screen.findByRole('list', { name: 'Lịch sử thay đổi' });
    expect(within(audit).getByText('Gửi duyệt')).toBeInTheDocument();
    expect(within(audit).getAllByText(/Nhân viên A/).length).toBeGreaterThanOrEqual(1);
    expect(within(audit).getByText(/status/)).toBeInTheDocument(); // key đổi

    // Tệp đính kèm — quyền kế thừa entity, BE quyết
    const files = await screen.findByRole('list', { name: 'Tệp đính kèm' });
    expect(within(files).getByText('bao-gia.pdf')).toBeInTheDocument();
    expect(within(files).getByText('240 KB')).toBeInTheDocument();
  });

  it('margin CHỈ hiện khi BE trả (field:cost §4.4c) — fixture có margin nên thấy Lãi gộp', async () => {
    renderPage();
    expect(await screen.findByText('Lãi gộp')).toBeInTheDocument();
    expect(screen.getByText('45.000')).toBeInTheDocument();
  });

  it('404 (gồm cả ngoài phạm vi §3.6) → hiện message lỗi, KHÔNG crash', async () => {
    server.use(
      http.get(`${API}/api/v1/orders/:id`, () => apiError('COMMON.NOT_FOUND', 404)),
    );
    renderPage('ord-la');
    expect(await screen.findByText('Lỗi kiểm thử')).toBeInTheDocument();
  });

  it('thiếu audit:read → timeline báo nhẹ nhàng, trang vẫn hiển thị đơn', async () => {
    server.use(
      http.get(`${API}/api/v1/audit-logs`, () => apiError('AUTH.FORBIDDEN', 403)),
    );
    renderPage();
    expect(await screen.findByRole('heading', { name: 'ORD-2026-00001' })).toBeInTheDocument();
    expect(
      await screen.findByText('Không xem được lịch sử thay đổi.'),
    ).toBeInTheDocument();
  });
});
