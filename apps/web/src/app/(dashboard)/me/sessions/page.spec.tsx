import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import MySessionsPage from './page';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test/render';
import { server } from '@/mocks/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/me/sessions',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe('MySessionsPage (Phase 2b — §4.3d)', () => {
  it('render các phiên đang hoạt động; phiên đã revoke bị ẩn', async () => {
    server.use(
      http.get(`${API}/api/v1/me/sessions`, () =>
        HttpResponse.json([
          {
            id: 'ses-1',
            device: 'Chrome trên Windows',
            ip: '203.0.113.10',
            userAgent: 'Mozilla/5.0',
            createdAt: '2026-08-10T08:00:00.000Z',
            lastSeenAt: '2026-08-11T07:00:00.000Z',
            revokedAt: null,
          },
          {
            id: 'ses-cu',
            device: 'Firefox cũ',
            ip: null,
            userAgent: null,
            createdAt: '2026-07-01T00:00:00.000Z',
            lastSeenAt: null,
            revokedAt: '2026-07-15T00:00:00.000Z', // đã thu hồi — không hiện
          },
        ]),
      ),
    );
    renderWithProviders(<MySessionsPage />);

    expect(await screen.findByText('Chrome trên Windows')).toBeInTheDocument();
    expect(screen.queryByText('Firefox cũ')).not.toBeInTheDocument();
  });

  it('thu hồi: confirm cảnh báo tự đăng xuất → DELETE đúng id', async () => {
    let revoked: string | null = null;
    server.use(
      http.delete(`${API}/api/v1/me/sessions/:id`, ({ params }) => {
        revoked = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<MySessionsPage />);

    const row = (await screen.findByText('Safari trên iPhone')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Thu hồi' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/đăng nhập lại/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thu hồi' }));

    await waitFor(() => expect(revoked).toBe('ses-2'));
  });
});
