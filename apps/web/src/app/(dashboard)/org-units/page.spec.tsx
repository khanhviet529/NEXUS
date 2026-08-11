import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import OrgUnitsPage from './page';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test/render';
import { server } from '@/mocks/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/org-units',
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

describe('OrgUnitsPage (Phase 2a)', () => {
  it('dựng cây từ parentId: 3 node, node lá thụt sâu nhất', async () => {
    mePerms(['org_unit:read']);
    renderWithProviders(<OrgUnitsPage />);

    expect(await screen.findByText('Công ty')).toBeInTheDocument();
    expect(screen.getByText('Phòng Kinh doanh')).toBeInTheDocument();
    const leaf = screen.getByText('Nhóm KD 1').closest('li')!;
    // depth 2 → padding-inline-start calc(2 * 1.5rem)
    expect(leaf.style.paddingInlineStart).toContain('2');
  });

  it('di chuyển: select cha mới KHÔNG chứa chính nó lẫn cây con; confirm cảnh báo huỷ cache quyền toàn tenant rồi mới PATCH kèm version', async () => {
    mePerms(['org_unit:read', 'org_unit:update']);
    let patched: unknown = null;
    let patchedId: string | null = null;
    server.use(
      http.patch(`${API}/api/v1/org-units/:id`, async ({ params, request }) => {
        patchedId = params.id as string;
        patched = await request.json();
        return HttpResponse.json({
          id: params.id,
          code: 'PB-KD',
          name: 'Phòng Kinh doanh',
          parentId: 'ou-kd-1',
          version: 2,
        });
      }),
    );
    renderWithProviders(<OrgUnitsPage />);

    // Mở move ở node PB-KD (con của ROOT, cha của KD-1)
    const row = (await screen.findByText('Phòng Kinh doanh')).closest('li')!;
    // findBy: nút chỉ hiện SAU khi /me (quyền) về — chậm hơn cây đơn vị
    await userEvent.click(await within(row).findByRole('button', { name: 'Di chuyển' }));
    const select = within(row).getByLabelText('Cha mới cho PB-KD');
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    // Cấm chính nó + cây con (KD-1); ROOT được phép
    expect(options.join('|')).toContain('ROOT');
    expect(options.join('|')).not.toContain('PB-KD —');
    expect(options.join('|')).not.toContain('KD-1');

    await userEvent.selectOptions(select, 'ou-root');
    // Confirm dialog phải NÓI RÕ hệ quả trước khi cho đi tiếp — click nút
    // TRONG dialog, vì các dòng khác cũng có nút "Di chuyển"
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/HUỶ CACHE QUYỀN CỦA TOÀN TENANT/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Di chuyển' }));

    await waitFor(() => expect(patchedId).toBe('ou-kd'));
    expect(patched).toEqual({ parentId: 'ou-root', version: 1 });
  });

  it('chỉ đọc (thiếu update/create/delete) → không có nút thao tác nào', async () => {
    mePerms(['org_unit:read']);
    renderWithProviders(<OrgUnitsPage />);

    expect(await screen.findByText('Công ty')).toBeInTheDocument();
    for (const name of ['Đổi tên', 'Di chuyển', 'Thêm con', 'Xoá']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });
});
