'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  rolesControllerList,
  rolesControllerListPermissions,
  rolesControllerCreate,
  rolesControllerUpdate,
  rolesControllerRemove,
  getApiError,
} from '@nexus/api-client';
import type { RoleDto, PermissionDto, RolePermissionInputDto } from '@nexus/api-client';
import { PERMISSION_SCOPES } from '@nexus/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/common/status-badge';
import { useConfirm } from '@/providers/overlay';
import { useCan } from '@/lib/auth/use-can';

/**
 * Phase 2a — UI cho quyết định #61: vai trò là DỮ LIỆU, tenant tự ghép từ
 * permission × scope (§4.4). Vai trò is_system chỉ xem, không sửa/xoá — BE
 * chặn, FE ẩn nút (FE chỉ làm UI, không phải hàng rào).
 */
const SCOPE_LABEL: Record<string, string> = {
  '': '— Không cấp —',
  own: 'Của mình (own)',
  department: 'Phòng ban (department)',
  descendants: 'Cả cây dưới (descendants)',
  all: 'Toàn tenant (all)',
};

/** Bản nháp trong editor: permissionCode → scope ('' = không cấp) */
type DraftGrants = Record<string, string>;

function RoleEditor({
  role,
  permissions,
  onClose,
}: {
  role: RoleDto | null; // null = tạo mới
  permissions: PermissionDto[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [code, setCode] = React.useState(role?.code ?? '');
  const [name, setName] = React.useState(role?.name ?? '');
  const [grants, setGrants] = React.useState<DraftGrants>(() =>
    Object.fromEntries((role?.permissions ?? []).map((p) => [p.permissionCode, p.scope])),
  );

  // Nhóm theo resource — builder đọc theo module, không phải danh sách phẳng 60 dòng
  const byResource = React.useMemo(() => {
    const groups = new Map<string, PermissionDto[]>();
    for (const p of permissions) {
      groups.set(p.resource, [...(groups.get(p.resource) ?? []), p]);
    }
    return [...groups.entries()];
  }, [permissions]);

  const save = useMutation({
    mutationFn: () => {
      const granted = Object.entries(grants)
        .filter(([, scope]) => scope !== '')
        .map(([permissionCode, scope]) => ({ permissionCode, scope })) as RolePermissionInputDto[];
      return role
        ? rolesControllerUpdate(role.id, { name, permissions: granted })
        : rolesControllerCreate({ code, name, permissions: granted });
    },
    onSuccess: () => {
      toast.success(role ? `Đã cập nhật ${role.code}` : `Đã tạo vai trò ${code}`);
      void qc.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
    onError: (e) => toast.error(getApiError(e).message),
  });

  const grantedCount = Object.values(grants).filter((s) => s !== '').length;

  return (
    <section
      aria-labelledby="role-editor-title"
      className="space-y-4"
      style={{
        border: 'var(--card-border)',
        borderRadius: 'var(--card-radius)',
        padding: 'var(--card-padding)',
        background: 'var(--surface-raised)',
      }}
    >
      <h2 id="role-editor-title" className="font-medium">
        {role ? `Sửa vai trò ${role.code}` : 'Tạo vai trò mới'}
      </h2>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Mã (SCREAMING_SNAKE_CASE)
          <Input
            aria-label="Mã vai trò"
            value={code}
            disabled={!!role} // mã là định danh — không đổi sau khi tạo
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="KE_TOAN"
            className="w-56 font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tên hiển thị
          <Input
            aria-label="Tên vai trò"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kế toán"
            className="w-64"
          />
        </label>
      </div>

      <div className="space-y-3">
        {byResource.map(([resource, perms]) => (
          <fieldset key={resource}>
            <legend className="mb-1 text-sm font-medium capitalize">{resource}</legend>
            <div className="space-y-1">
              {perms.map((p) => (
                <div key={p.code} className="flex items-center gap-2 text-sm">
                  <span className="w-56 shrink-0 font-mono text-xs">{p.code}</span>
                  <select
                    aria-label={`Scope cho ${p.code}`}
                    className="rounded-md border border-input bg-background px-2 text-sm"
                    style={{ height: 'var(--input-h)' }}
                    value={grants[p.code] ?? ''}
                    onChange={(e) =>
                      setGrants((g) => ({ ...g, [p.code]: e.target.value }))
                    }
                  >
                    {['', ...PERMISSION_SCOPES].map((s) => (
                      <option key={s} value={s}>
                        {SCOPE_LABEL[s] ?? s}
                      </option>
                    ))}
                  </select>
                  {p.description && (
                    <span className="text-xs text-muted-foreground">{p.description}</span>
                  )}
                </div>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || !name || (!role && !code) || grantedCount === 0}
        >
          {role ? 'Lưu thay đổi' : 'Tạo vai trò'}
        </Button>
        <Button variant="outline" onClick={onClose} disabled={save.isPending}>
          Huỷ
        </Button>
        <span className="text-xs text-muted-foreground">{grantedCount} quyền được cấp</span>
      </div>
    </section>
  );
}

export default function RolesPage() {
  const can = useCan();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState<RoleDto | null | 'new'>(null);

  const roles = useQuery({ queryKey: ['roles'], queryFn: () => rolesControllerList() });
  const permissions = useQuery({
    queryKey: ['permissions-registry'],
    queryFn: () => rolesControllerListPermissions(),
    enabled: editing !== null, // registry chỉ cần khi mở editor
    staleTime: Infinity, // sync từ code — không đổi trong phiên
  });

  const remove = useMutation({
    mutationFn: (id: string) => rolesControllerRemove(id),
    onSuccess: () => {
      toast.success('Đã xoá vai trò');
      void qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e) => {
      const err = getApiError(e);
      // 409 HAS_REFERENCES: BE trả danh sách nguồn tham chiếu
      toast.error(
        err.code === 'COMMON.HAS_REFERENCES'
          ? 'Không xoá được: còn thành viên đang giữ vai trò này'
          : err.message,
      );
    },
  });

  if (roles.isError) {
    const err = getApiError(roles.error);
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-4 text-xl font-semibold">Vai trò</h1>
        <p className="text-sm text-muted-foreground">
          {err.status === 403 ? 'Bạn không có quyền xem vai trò (role:read).' : err.message}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Vai trò</h1>
        {can('role:create') && editing === null && (
          <Button onClick={() => setEditing('new')}>Tạo vai trò</Button>
        )}
      </div>

      {editing !== null && permissions.data && (
        <RoleEditor
          role={editing === 'new' ? null : editing}
          permissions={permissions.data}
          onClose={() => setEditing(null)}
        />
      )}
      {editing !== null && permissions.isPending && (
        <p className="text-sm text-muted-foreground">Đang tải registry quyền…</p>
      )}

      {roles.isPending ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3">Mã</th>
              <th className="py-2 pr-3">Tên</th>
              <th className="py-2 pr-3">Loại</th>
              <th className="py-2 pr-3">Số quyền</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {(roles.data ?? []).map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 pr-3 font-mono text-xs">{r.code}</td>
                <td className="py-2 pr-3">{r.name}</td>
                <td className="py-2 pr-3">
                  <StatusBadge
                    tone={r.isSystem ? 'muted' : 'info'}
                    label={r.isSystem ? 'Hệ thống' : 'Tự tạo'}
                  />
                </td>
                <td className="py-2 pr-3 tabular-nums">{r.permissions.length}</td>
                <td className="py-2">
                  {!r.isSystem && (
                    <span className="flex gap-1">
                      {can('role:update') && (
                        <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                          Sửa
                        </Button>
                      )}
                      {can('role:delete') && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={remove.isPending}
                          onClick={() => {
                            void confirm({
                              title: `Xoá vai trò ${r.code}?`,
                              description:
                                'Chỉ xoá được khi không còn thành viên nào giữ vai trò này.',
                              variant: 'danger',
                              confirmLabel: 'Xoá',
                            }).then((o) => {
                              if (o.ok) remove.mutate(r.id);
                            });
                          }}
                        >
                          Xoá
                        </Button>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
