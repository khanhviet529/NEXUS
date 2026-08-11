import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import AcceptInvitationPage from './page';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/mocks/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/accept-invitation',
  useSearchParams: () => new URLSearchParams('token=loi-moi-1'),
}));

describe('AcceptInvitationPage (Phase 3)', () => {
  it('có mật khẩu → POST đủ {token, fullName, password}', async () => {
    let posted: unknown = null;
    server.use(
      http.post(`${API}/api/v1/auth/accept-invitation`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ tenantId: 'tenant-a' }, { status: 201 });
      }),
    );
    renderWithProviders(<AcceptInvitationPage />);

    await userEvent.type(await screen.findByLabelText(/Họ tên/), 'Người Mới');
    await userEvent.type(screen.getByLabelText(/Mật khẩu/), 'matkhau-dau-1');
    await userEvent.click(screen.getByRole('button', { name: 'Tham gia' }));

    await waitFor(() =>
      expect(posted).toEqual({
        token: 'loi-moi-1',
        fullName: 'Người Mới',
        password: 'matkhau-dau-1',
      }),
    );
    expect(await screen.findByText('Đã tham gia')).toBeInTheDocument();
  });

  it('email đã có tài khoản: bỏ trống mật khẩu → payload KHÔNG chứa password', async () => {
    let posted: unknown = null;
    server.use(
      http.post(`${API}/api/v1/auth/accept-invitation`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ tenantId: 'tenant-a' }, { status: 201 });
      }),
    );
    renderWithProviders(<AcceptInvitationPage />);

    await userEvent.type(await screen.findByLabelText(/Họ tên/), 'Người Cũ');
    await userEvent.click(screen.getByRole('button', { name: 'Tham gia' }));

    await waitFor(() =>
      expect(posted).toEqual({ token: 'loi-moi-1', fullName: 'Người Cũ' }),
    );
  });
});
