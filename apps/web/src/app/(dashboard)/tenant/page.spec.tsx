import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import TenantPage from './page';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/mocks/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/tenant',
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

describe('TenantPage (Phase 2b — ma trận §2.6)', () => {
  it('hiện thông tin + tính năng (bật/tắt phân biệt được), branding có sẵn trong editor', async () => {
    mePerms(['tenant:read', 'tenant:update']);
    renderWithProviders(<TenantPage />);

    expect(await screen.findByText('TENANT-A')).toBeInTheDocument();
    expect(screen.getByText('module.approvals')).toBeInTheDocument();
    expect(screen.getByText('module.webhooks (tắt)')).toBeInTheDocument();
    expect(screen.getByLabelText('Branding JSON')).toHaveValue(
      JSON.stringify({ primaryColor: '#0ea5e9' }, null, 2),
    );
  });

  it('lưu branding: JSON hỏng → toast, không PATCH; object hợp lệ → PATCH đúng body', async () => {
    mePerms(['tenant:read', 'tenant:update']);
    let patched: unknown = null;
    server.use(
      http.patch(`${API}/api/v1/tenants/current/branding`, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({
          id: 'tenant-a',
          code: 'TENANT-A',
          name: 'Tenant A',
          status: 'ACTIVE',
          defaultLocale: 'vi',
          defaultTimezone: 'Asia/Ho_Chi_Minh',
          branding: { primaryColor: '#16a34a' },
          features: [],
        });
      }),
    );
    renderWithProviders(<TenantPage />);

    const editor = await screen.findByLabelText('Branding JSON');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'hong-json');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu branding' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('JSON hợp lệ')),
    );
    expect(patched).toBeNull();

    await userEvent.clear(editor);
    // userEvent.type coi {} là cú pháp phím đặc biệt — dùng paste cho chuỗi JSON
    await userEvent.paste('{"primaryColor": "#16a34a"}');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu branding' }));
    await waitFor(() =>
      expect(patched).toEqual({ branding: { primaryColor: '#16a34a' } }),
    );
  });

  it('thiếu tenant:update → textarea disabled, không có nút Lưu', async () => {
    mePerms(['tenant:read']);
    renderWithProviders(<TenantPage />);

    expect(await screen.findByLabelText('Branding JSON')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Lưu branding' })).not.toBeInTheDocument();
  });
});
