'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  tenantSelfControllerGetCurrent,
  tenantSelfControllerUpdateBranding,
  getApiError,
} from '@nexus/api-client';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/common/status-badge';
import { useCan } from '@/lib/auth/use-can';

/**
 * Phase 2b — tenant tự quản (ma trận §2.6): thông tin tổ chức, tính năng
 * được sysadmin bật (chỉ đọc — bật/tắt là việc của /admin), branding.
 */
export default function TenantPage() {
  const can = useCan();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['tenant-current'],
    queryFn: () => tenantSelfControllerGetCurrent(),
  });
  const [draft, setDraft] = React.useState<string | null>(null);

  const save = useMutation({
    mutationFn: (branding: Record<string, unknown>) =>
      tenantSelfControllerUpdateBranding({ branding }),
    onSuccess: () => {
      toast.success('Đã lưu branding');
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ['tenant-current'] });
    },
    onError: (e) => toast.error(getApiError(e).message),
  });

  if (query.isError) {
    const err = getApiError(query.error);
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-4 text-xl font-semibold">Tổ chức</h1>
        <p className="text-sm text-muted-foreground">
          {err.status === 403 ? 'Bạn không có quyền xem thông tin tổ chức (tenant:read).' : err.message}
        </p>
      </main>
    );
  }
  if (query.isPending) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-4 text-xl font-semibold">Tổ chức</h1>
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      </main>
    );
  }

  const t = query.data;
  const brandingText = draft ?? JSON.stringify(t.branding ?? {}, null, 2);

  const submit = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(brandingText);
    } catch {
      toast.error('Branding phải là JSON hợp lệ');
      return;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      toast.error('Branding phải là một object JSON');
      return;
    }
    save.mutate(parsed as Record<string, unknown>);
  };

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Tổ chức</h1>

      <section aria-labelledby="tenant-info">
        <h2 id="tenant-info" className="mb-2 font-medium">
          Thông tin
        </h2>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
          <dt className="text-muted-foreground">Mã</dt>
          <dd className="font-mono">{t.code}</dd>
          <dt className="text-muted-foreground">Tên</dt>
          <dd>{t.name}</dd>
          <dt className="text-muted-foreground">Ngôn ngữ mặc định</dt>
          <dd>{t.defaultLocale}</dd>
          <dt className="text-muted-foreground">Múi giờ</dt>
          <dd>{t.defaultTimezone}</dd>
        </dl>
      </section>

      <section aria-labelledby="tenant-features">
        <h2 id="tenant-features" className="mb-2 font-medium">
          Tính năng
        </h2>
        {t.features.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có tính năng nào được cấu hình.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {t.features.map((f) => (
              <li key={f.featureKey} className="flex items-center gap-1">
                <StatusBadge
                  tone={f.enabled ? 'success' : 'muted'}
                  label={`${f.featureKey}${f.enabled ? '' : ' (tắt)'}`}
                />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Bật/tắt tính năng do quản trị hệ thống thực hiện.
        </p>
      </section>

      <section aria-labelledby="tenant-branding" className="space-y-2">
        <h2 id="tenant-branding" className="font-medium">
          Branding (JSON)
        </h2>
        <textarea
          aria-label="Branding JSON"
          className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
          rows={8}
          value={brandingText}
          disabled={!can('tenant:update') || save.isPending}
          onChange={(e) => setDraft(e.target.value)}
        />
        {can('tenant:update') && (
          <Button disabled={draft === null || save.isPending} onClick={submit}>
            Lưu branding
          </Button>
        )}
      </section>
    </main>
  );
}
