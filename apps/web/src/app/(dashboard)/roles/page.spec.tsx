import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import RolesPage from './page';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/mocks/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/roles',
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

describe('RolesPage (Phase 2a — quyết định #61)', () => {
  it('vai trò hệ thống: badge "Hệ thống", KHÔNG có nút Sửa/Xoá; vai trò tự tạo thì có', async () => {
    mePerms(['role:read', 'role:update', 'role:delete']);
    renderWithProviders(<RolesPage />);

    expect(await screen.findByText('TENANT_ADMIN')).toBeInTheDocument();
    expect(screen.getByText('Hệ thống')).toBeInTheDocument();
    expect(screen.getByText('Tự tạo')).toBeInTheDocument();
    // Chỉ MỘT cặp Sửa/Xoá — của KE_TOAN; TENANT_ADMIN không có
    expect(screen.getAllByRole('button', { name: 'Sửa' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Xoá' })).toHaveLength(1);
  });

  it('tạo vai trò: builder permission×scope gửi ĐÚNG mảng đã cấp (bỏ dòng "Không cấp")', async () => {
    mePerms(['role:read', 'role:create']);
    let posted: unknown = null;
    server.use(
      http.post(`${API}/api/v1/roles`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({
          id: 'role-new',
          code: 'THU_KHO',
          name: 'Thủ kho',
          isSystem: false,
          permissions: [{ permissionCode: 'order:read', scope: 'own' }],
        });
      }),
    );
    renderWithProviders(<RolesPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Tạo vai trò' }));
    await userEvent.type(await screen.findByLabelText('Mã vai trò'), 'THU_KHO');
    await userEvent.type(screen.getByLabelText('Tên vai trò'), 'Thủ kho');
    await userEvent.selectOptions(screen.getByLabelText('Scope cho order:read'), 'own');
    // order:approve + user:read để nguyên "Không cấp" — không được xuất hiện trong payload
    await userEvent.click(screen.getByRole('button', { name: 'Tạo vai trò' }));

    await waitFor(() =>
      expect(posted).toEqual({
        code: 'THU_KHO',
        name: 'Thủ kho',
        permissions: [{ permissionCode: 'order:read', scope: 'own' }],
      }),
    );
  });

  it('thiếu role:create → không có nút Tạo vai trò', async () => {
    mePerms(['role:read']);
    renderWithProviders(<RolesPage />);

    expect(await screen.findByText('KE_TOAN')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tạo vai trò' })).not.toBeInTheDocument();
  });
});
