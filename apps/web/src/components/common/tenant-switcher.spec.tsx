import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { TenantSwitcher } from './tenant-switcher';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/mocks/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/me',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const assign = vi.fn();
Object.defineProperty(window, 'location', {
  value: { ...window.location, assign },
  writable: true,
});

const meWithMemberships = (memberships: Array<{ id: string; code: string; name: string }>) =>
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
        permissions: [],
        memberships,
      }),
    ),
  );

describe('TenantSwitcher (Phase 3)', () => {
  beforeEach(() => assign.mockClear());

  it('1 membership → không render gì (không có gì để chuyển)', async () => {
    meWithMemberships([{ id: 'tenant-a', code: 'TENANT-A', name: 'Tenant A' }]);
    const { container } = renderWithProviders(<TenantSwitcher />);

    // chờ /me về rồi khẳng định vẫn rỗng
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('>1 membership → select; đổi lựa chọn → POST switch-tenant + reload CỨNG', async () => {
    meWithMemberships([
      { id: 'tenant-a', code: 'TENANT-A', name: 'Tenant A' },
      { id: 'tenant-b', code: 'TENANT-B', name: 'Tenant B' },
    ]);
    let switched: unknown = null;
    server.use(
      http.post(`${API}/api/v1/auth/switch-tenant`, async ({ request }) => {
        switched = await request.json();
        return HttpResponse.json({ accessToken: null, expiresIn: 900 });
      }),
    );
    renderWithProviders(<TenantSwitcher />);

    const select = await screen.findByLabelText('Đổi tenant');
    await userEvent.selectOptions(select, 'tenant-b');

    await waitFor(() => expect(switched).toEqual({ tenantId: 'tenant-b' }));
    // reload cứng — cache tenant cũ không được sống sót
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/me'));
  });
});
