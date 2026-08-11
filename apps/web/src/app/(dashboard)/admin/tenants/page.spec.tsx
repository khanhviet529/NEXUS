import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import AdminTenantsPage from './page';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test/render';
import { server } from '@/mocks/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/tenants',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mePerms = (permissions: string[]) =>
  server.use(
    http.get(`${API}/api/v1/me`, () =>
      HttpResponse.json({
        id: 'user-1',
        email: 'sysadmin@nexus.local',
        fullName: 'System Admin',
        membershipId: 'mem-1',
        tenant: { id: 'tenant-a', code: 'TENANT-A', name: 'Tenant A' },
        orgUnit: null,
        roles: [],
        permissions,
      }),
    ),
  );

describe('AdminTenantsPage (Phase 2b — §5C.1)', () => {
  it('render danh sách: trạng thái Hoạt động/Đình chỉ, nút theo trạng thái', async () => {
    mePerms(['system_tenant:read', 'system_tenant:suspend']);
    renderWithProviders(<AdminTenantsPage />);

    expect(await screen.findByText('TENANT-A')).toBeInTheDocument();
    expect(screen.getByText('Hoạt động')).toBeInTheDocument();
    expect(screen.getByText('Đình chỉ', { selector: '[role="status"]' })).toBeInTheDocument();
    // A đang ACTIVE → nút Đình chỉ; B SUSPENDED → nút Kích hoạt
    expect(await screen.findByRole('button', { name: 'Đình chỉ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kích hoạt' })).toBeInTheDocument();
  });

  it('đình chỉ: typeToConfirm bắt gõ ĐÚNG MÃ tenant mới mở khoá nút; xong mới POST suspend', async () => {
    mePerms(['system_tenant:read', 'system_tenant:suspend']);
    let suspended: string | null = null;
    server.use(
      http.post(`${API}/api/v1/admin/tenants/:id/suspend`, ({ params }) => {
        suspended = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<AdminTenantsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Đình chỉ' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/huỷ NGAY LẬP TỨC/)).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole('button', { name: 'Đình chỉ' });
    expect(confirmBtn).toBeDisabled(); // chưa gõ mã — khoá

    await userEvent.type(within(dialog).getByRole('textbox'), 'TENANT-A');
    expect(confirmBtn).toBeEnabled();
    await userEvent.click(confirmBtn);

    await waitFor(() => expect(suspended).toBe('tenant-a'));
  });

  it('tính năng: form gửi PATCH features với đúng mảng một phần tử', async () => {
    mePerms(['system_tenant:read', 'system_tenant:features']);
    let patched: unknown = null;
    let patchedTenant: string | null = null;
    server.use(
      http.patch(`${API}/api/v1/admin/tenants/:id/features`, async ({ params, request }) => {
        patchedTenant = params.id as string;
        patched = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<AdminTenantsPage />);

    const row = (await screen.findByText('TENANT-B')).closest('tr')!;
    await userEvent.click(await within(row).findByRole('button', { name: 'Tính năng' }));
    await userEvent.type(within(row).getByLabelText('Feature key'), 'module.webhooks');
    await userEvent.click(within(row).getByRole('checkbox'));
    await userEvent.click(within(row).getByRole('button', { name: 'Áp dụng' }));

    await waitFor(() => expect(patchedTenant).toBe('tenant-b'));
    expect(patched).toEqual({
      features: [{ featureKey: 'module.webhooks', enabled: false }],
    });
  });

  it('không có system:cross_tenant → API 403 → thông báo khu vực sysadmin', async () => {
    mePerms([]);
    server.use(
      http.get(`${API}/api/v1/admin/tenants`, () =>
        HttpResponse.json(
          { error: { code: 'AUTH.FORBIDDEN', message: 'Forbidden', traceId: 't' } },
          { status: 403 },
        ),
      ),
    );
    renderWithProviders(<AdminTenantsPage />);

    expect(await screen.findByText(/system:cross_tenant/)).toBeInTheDocument();
  });
});
