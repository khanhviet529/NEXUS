import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import ForgotPasswordPage from './page';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/mocks/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/forgot-password',
  useSearchParams: () => new URLSearchParams(),
}));

describe('ForgotPasswordPage (Phase 3)', () => {
  it('gửi email → 202 → MỘT thông điệp trung tính (không tiết lộ email có tồn tại hay không)', async () => {
    let posted: unknown = null;
    server.use(
      http.post(`${API}/api/v1/auth/forgot-password`, async ({ request }) => {
        posted = await request.json();
        return new HttpResponse(null, { status: 202 });
      }),
    );
    renderWithProviders(<ForgotPasswordPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'ai-do@tenant-a.local');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi liên kết đặt lại' }));

    await waitFor(() => expect(posted).toEqual({ email: 'ai-do@tenant-a.local' }));
    expect(await screen.findByText('Kiểm tra hộp thư')).toBeInTheDocument();
    // Thông điệp phải là dạng "NẾU email có tài khoản" — không khẳng định tồn tại
    expect(screen.getByText(/Nếu/)).toBeInTheDocument();
  });
});
