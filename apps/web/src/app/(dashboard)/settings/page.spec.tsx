import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import SettingsPage from './page';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/mocks/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/settings',
  useSearchParams: () => new URLSearchParams(),
}));

// Toaster (sonner) không được mount trong renderWithProviders → assert qua spy
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockSettings = (rows: unknown[]) =>
  server.use(http.get(`${API}/api/v1/settings`, () => HttpResponse.json(rows)));

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

describe('SettingsPage (V12)', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('hiển thị nguồn giá trị: override tenant vs mặc định hệ thống (§6.4 HYBRID)', async () => {
    mePerms(['setting:read', 'setting:update']);
    mockSettings([
      { key: 'invoice.prefix', value: 'HD', scope: 'tenant' },
      { key: 'theme.color', value: { color: 'blue' }, scope: 'global' },
    ]);
    renderWithProviders(<SettingsPage />);

    expect(await screen.findByText('invoice.prefix')).toBeInTheDocument();
    expect(screen.getByText('Override tenant')).toBeInTheDocument();
    expect(screen.getByText('Mặc định hệ thống')).toBeInTheDocument();
  });

  it('lưu: PATCH gửi JSON đã parse; JSON hỏng → toast lỗi, KHÔNG gửi request', async () => {
    mePerms(['setting:read', 'setting:update']);
    mockSettings([{ key: 'invoice.prefix', value: 'HD', scope: 'global' }]);
    let patched: unknown = null;
    server.use(
      http.patch(`${API}/api/v1/settings`, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({ key: 'invoice.prefix', value: 'INV', scope: 'tenant' });
      }),
    );
    renderWithProviders(<SettingsPage />);

    const input = await screen.findByLabelText('Giá trị invoice.prefix');
    // JSON hỏng trước — không được bắn request
    await userEvent.clear(input);
    await userEvent.type(input, 'khong-phai-json');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('JSON hợp lệ')),
    );
    expect(patched).toBeNull();

    // JSON đúng → PATCH mang value đã parse
    await userEvent.clear(input);
    await userEvent.type(input, '"INV"');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(patched).toEqual({ key: 'invoice.prefix', value: 'INV' }),
    );
  });

  it('thiếu setting:update → không có nút Lưu, input disabled (FE chỉ làm UI — §4.4)', async () => {
    mePerms(['setting:read']);
    mockSettings([{ key: 'invoice.prefix', value: 'HD', scope: 'global' }]);
    renderWithProviders(<SettingsPage />);

    const input = await screen.findByLabelText('Giá trị invoice.prefix');
    expect(input).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
  });
});
