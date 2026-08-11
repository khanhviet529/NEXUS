'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  adminControllerListTenants,
  adminControllerCreateTenant,
  adminControllerSuspend,
  adminControllerActivate,
  adminControllerSetFeatures,
  getApiError,
} from '@nexus/api-client';
import type { AdminTenantDto } from '@nexus/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/common/status-badge';
import { useConfirm } from '@/providers/overlay';
import { useCan } from '@/lib/auth/use-can';

/**
 * Phase 2b — màn sysadmin (§5C.1). /admin/* có guard cứng system:cross_tenant
 * ở BE (§3.1b); FE chỉ ẩn/hiện cho đỡ bối rối, không phải hàng rào.
 * SUSPEND huỷ NGAY mọi phiên của tenant — confirm phải nói rõ.
 */
function CreateTenantForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');

  const create = useMutation({
    mutationFn: () => adminControllerCreateTenant({ code, name }),
    onSuccess: (t) => {
      toast.success(`Đã tạo tenant ${t.code} (kèm ROOT org + vai trò hệ thống)`);
      void qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      onClose();
    },
    onError: (e) => toast.error(getApiError(e).message),
  });

  return (
    <section
      className="flex flex-wrap items-end gap-3"
      style={{
        border: 'var(--card-border)',
        borderRadius: 'var(--card-radius)',
        padding: 'var(--card-padding)',
        background: 'var(--surface-raised)',
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Mã (CHỮ-HOA-GẠCH-NGANG)
        <Input
          aria-label="Mã tenant"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CTY-ABC"
          className="w-48 font-mono"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Tên
        <Input
          aria-label="Tên tenant"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Công ty ABC"
          className="w-64"
        />
      </label>
      <Button disabled={!code || !name || create.isPending} onClick={() => create.mutate()}>
        Tạo tenant
      </Button>
      <Button variant="outline" onClick={onClose} disabled={create.isPending}>
        Huỷ
      </Button>
    </section>
  );
}

/** Bật/tắt MỘT feature key cho tenant — PATCH nhận mảng, gửi một phần tử */
function FeatureForm({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [featureKey, setFeatureKey] = React.useState('');
  const [enabled, setEnabled] = React.useState(true);

  const set = useMutation({
    mutationFn: () =>
      adminControllerSetFeatures(tenantId, { features: [{ featureKey, enabled }] }),
    onSuccess: () => {
      toast.success(`Đã ${enabled ? 'bật' : 'tắt'} ${featureKey}`);
      onClose();
    },
    onError: (e) => toast.error(getApiError(e).message),
  });

  return (
    <span className="flex items-center gap-2">
      <Input
        aria-label="Feature key"
        placeholder="module.approvals"
        value={featureKey}
        onChange={(e) => setFeatureKey(e.target.value)}
        className="w-44 font-mono text-xs"
      />
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        bật
      </label>
      <Button size="sm" disabled={!featureKey || set.isPending} onClick={() => set.mutate()}>
        Áp dụng
      </Button>
      <Button size="sm" variant="outline" onClick={onClose}>
        Huỷ
      </Button>
    </span>
  );
}

export default function AdminTenantsPage() {
  const can = useCan();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [creating, setCreating] = React.useState(false);
  const [featureFor, setFeatureFor] = React.useState<string | null>(null);

  const tenants = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => adminControllerListTenants(),
  });

  const reload = () => void qc.invalidateQueries({ queryKey: ['admin-tenants'] });
  const suspend = useMutation({
    mutationFn: (id: string) => adminControllerSuspend(id),
    onSuccess: () => {
      toast.success('Đã đình chỉ — mọi phiên của tenant bị huỷ ngay');
      reload();
    },
    onError: (e) => toast.error(getApiError(e).message),
  });
  const activate = useMutation({
    mutationFn: (id: string) => adminControllerActivate(id),
    onSuccess: () => {
      toast.success('Đã kích hoạt lại');
      reload();
    },
    onError: (e) => toast.error(getApiError(e).message),
  });

  if (tenants.isError) {
    const err = getApiError(tenants.error);
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-4 text-xl font-semibold">Quản trị tenant</h1>
        <p className="text-sm text-muted-foreground">
          {err.status === 403
            ? 'Khu vực sysadmin — cần system:cross_tenant (§3.1b).'
            : err.message}
        </p>
      </main>
    );
  }

  const onSuspend = (t: AdminTenantDto) =>
    void confirm({
      title: `Đình chỉ ${t.code}?`,
      description: `MỌI PHIÊN đăng nhập của ${t.memberCount} thành viên bị huỷ NGAY LẬP TỨC — không phải chờ token hết hạn. Người dùng đang thao tác sẽ văng ra ở request kế tiếp.`,
      variant: 'danger',
      typeToConfirm: t.code, // hành động diện rộng — bắt gõ đúng mã
      confirmLabel: 'Đình chỉ',
    }).then((o) => {
      if (o.ok) suspend.mutate(t.id);
    });

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quản trị tenant</h1>
        {can('system_tenant:create') && !creating && (
          <Button onClick={() => setCreating(true)}>Tạo tenant</Button>
        )}
      </div>
      {creating && <CreateTenantForm onClose={() => setCreating(false)} />}

      {tenants.isPending ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3">Mã</th>
              <th className="py-2 pr-3">Tên</th>
              <th className="py-2 pr-3">Trạng thái</th>
              <th className="py-2 pr-3">Thành viên</th>
              <th className="py-2 pr-3">Tạo lúc</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {(tenants.data ?? []).map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="py-2 pr-3 font-mono text-xs">{t.code}</td>
                <td className="py-2 pr-3">{t.name}</td>
                <td className="py-2 pr-3">
                  <StatusBadge
                    tone={t.status === 'ACTIVE' ? 'success' : 'danger'}
                    label={t.status === 'ACTIVE' ? 'Hoạt động' : 'Đình chỉ'}
                  />
                </td>
                <td className="py-2 pr-3 tabular-nums">{t.memberCount}</td>
                <td className="py-2 pr-3">{new Date(t.createdAt).toLocaleDateString('vi')}</td>
                <td className="py-2">
                  <span className="flex flex-wrap items-center gap-1">
                    {can('system_tenant:suspend') &&
                      (t.status === 'ACTIVE' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={suspend.isPending}
                          onClick={() => onSuspend(t)}
                        >
                          Đình chỉ
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={activate.isPending}
                          onClick={() => activate.mutate(t.id)}
                        >
                          Kích hoạt
                        </Button>
                      ))}
                    {can('system_tenant:features') &&
                      (featureFor === t.id ? (
                        <FeatureForm tenantId={t.id} onClose={() => setFeatureFor(null)} />
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setFeatureFor(t.id)}>
                          Tính năng
                        </Button>
                      ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
