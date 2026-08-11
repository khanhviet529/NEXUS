import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import ResetPasswordPage from './page';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/mocks/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// token đổi được theo từng test qua biến module
let search = 'token=tok-hop-le';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/reset-password',
  useSearchParams: () => new URLSearchParams(search),
}));

describe('ResetPasswordPage (Phase 3 — §4.3c)', () => {
  it('thiếu token → màn "liên kết không hợp lệ", có lối ra xin link mới', async () => {
    search = '';
    renderWithProviders(<ResetPasswordPage />);

    expect(await screen.findByText('Liên kết không hợp lệ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Yêu cầu liên kết mới/ })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('hai ô không khớp → chặn tại chỗ, KHÔNG gọi API', async () => {
    search = 'token=tok-hop-le';
    let called = false;
    server.use(
      http.post(`${API}/api/v1/auth/reset-password`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<ResetPasswordPage />);

    await userEvent.type(await screen.findByLabelText(/Mật khẩu mới/), 'matkhau-moi-1');
    await userEvent.type(screen.getByLabelText('Nhập lại mật khẩu'), 'khac-hoan-toan');
    await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(await screen.findByText('Hai ô mật khẩu không khớp')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('thành công → POST đúng {token, newPassword}; màn kết quả nói rõ MỌI phiên bị thu hồi', async () => {
    search = 'token=tok-hop-le';
    let posted: unknown = null;
    server.use(
      http.post(`${API}/api/v1/auth/reset-password`, async ({ request }) => {
        posted = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<ResetPasswordPage />);

    await userEvent.type(await screen.findByLabelText(/Mật khẩu mới/), 'matkhau-moi-1');
    await userEvent.type(screen.getByLabelText('Nhập lại mật khẩu'), 'matkhau-moi-1');
    await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    await waitFor(() =>
      expect(posted).toEqual({ token: 'tok-hop-le', newPassword: 'matkhau-moi-1' }),
    );
    expect(await screen.findByText('Đã đổi mật khẩu')).toBeInTheDocument();
    expect(screen.getByText(/tất cả thiết bị/)).toBeInTheDocument();
  });
});
