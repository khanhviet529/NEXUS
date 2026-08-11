'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  settingsControllerList,
  settingsControllerUpdate,
  getApiError,
} from '@nexus/api-client';
import type { SettingDto } from '@nexus/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/common/status-badge';
import { useCan } from '@/lib/auth/use-can';

/**
 * V12 — trang cấu hình (§2.5 ma trận): global là MẶC ĐỊNH hệ thống,
 * sửa từ đây LUÔN tạo override của tenant (§6.4 HYBRID) — dòng global
 * không bao giờ bị đụng qua API này (TC-1 §3C).
 */
function SettingRow({
  setting,
  canUpdate,
}: {
  setting: SettingDto;
  canUpdate: boolean;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = React.useState(JSON.stringify(setting.value));
  const [dirty, setDirty] = React.useState(false);

  const save = useMutation({
    mutationFn: (value: unknown) =>
      settingsControllerUpdate({ key: setting.key, value: value as Record<string, unknown> }),
    onSuccess: () => {
      toast.success(`Đã lưu ${setting.key} (override của tenant)`);
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => toast.error(getApiError(e).message),
  });

  const submit = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      toast.error('Giá trị phải là JSON hợp lệ (chuỗi thì bọc trong nháy kép)');
      return;
    }
    save.mutate(parsed);
  };

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-3 align-top font-mono text-sm">{setting.key}</td>
      <td className="py-2 pr-3 align-top">
        <StatusBadge
          tone={setting.scope === 'tenant' ? 'info' : 'muted'}
          label={setting.scope === 'tenant' ? 'Override tenant' : 'Mặc định hệ thống'}
        />
      </td>
      <td className="py-2 pr-3">
        <Input
          aria-label={`Giá trị ${setting.key}`}
          value={draft}
          disabled={!canUpdate || save.isPending}
          onChange={(e) => {
            setDraft(e.target.value);
            setDirty(true);
          }}
          className="font-mono text-xs"
        />
      </td>
      <td className="py-2 align-top">
        {canUpdate && (
          <Button size="sm" variant="outline" disabled={!dirty || save.isPending} onClick={submit}>
            Lưu
          </Button>
        )}
      </td>
    </tr>
  );
}

export default function SettingsPage() {
  const can = useCan();
  const canUpdate = can('setting:update');
  const query = useQuery({ queryKey: ['settings'], queryFn: () => settingsControllerList() });

  if (query.isError) {
    const err = getApiError(query.error);
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-4 text-xl font-semibold">Cấu hình</h1>
        <p className="text-sm text-muted-foreground">
          {err.status === 403 ? 'Bạn không có quyền xem cấu hình (setting:read).' : err.message}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Cấu hình</h1>
      <p className="text-sm text-muted-foreground">
        Sửa ở đây tạo <b>override cho tenant của bạn</b> — mặc định hệ thống giữ nguyên.
      </p>
      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : (query.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có cấu hình nào.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3">Key</th>
              <th className="py-2 pr-3">Nguồn</th>
              <th className="py-2 pr-3">Giá trị (JSON)</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {(query.data ?? []).map((s) => (
              <SettingRow key={s.key} setting={s} canUpdate={canUpdate} />
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
