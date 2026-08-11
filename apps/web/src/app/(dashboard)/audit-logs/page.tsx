'use client';

import { Suspense, useMemo } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { auditControllerList, getApiError } from '@nexus/api-client';
import type { AuditLogEntryDto } from '@nexus/api-client';
import { ALL_ENTITY_TYPES } from '@nexus/shared';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';

/**
 * V12 — trang tra cứu audit (§4.9 "có UI tra cứu").
 * Scope theo quyền audit:read (desc = audit do người trong cây đơn vị thao
 * tác) — BE quyết, FE chỉ hiển thị. before/after ĐÃ che từ lúc ghi (§4.4c).
 */
const ACTION_OPTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'SUBMIT',
  'APPROVE',
  'REJECT',
  'CANCEL',
  'LOGIN',
  'SESSION_REVOKED',
  'CROSS_TENANT_ACCESS',
] as const;

function AuditLogsPage() {
  const [params, setParams] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(20),
    entity: parseAsString.withDefault(''),
    action: parseAsString.withDefault(''),
  });

  const query = useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () =>
      auditControllerList({
        page: params.page,
        limit: params.limit,
        entity: params.entity || undefined,
        action: params.action || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const columns = useMemo<ColumnDef<AuditLogEntryDto, unknown>[]>(
    () => [
      {
        id: 'createdAt',
        header: 'Thời điểm',
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleString('vi'),
      },
      { id: 'action', header: 'Hành động', cell: ({ row }) => row.original.action },
      { id: 'entity', header: 'Đối tượng', cell: ({ row }) => row.original.entity },
      {
        id: 'entityId',
        header: 'Bản ghi',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.entityId.slice(0, 8)}…</span>
        ),
      },
      {
        id: 'actor',
        header: 'Người thao tác',
        cell: ({ row }) =>
          row.original.actorName ??
          (row.original.actorId?.startsWith('system:') ? 'hệ thống' : (row.original.actorId ?? '—')),
      },
      {
        id: 'changes',
        header: 'Field đổi',
        cell: ({ row }) => {
          const keys = new Set<string>();
          for (const side of [row.original.before, row.original.after]) {
            if (side) for (const k of Object.keys(side)) keys.add(k);
          }
          return <span className="text-xs text-muted-foreground">{[...keys].join(', ')}</span>;
        },
      },
    ],
    [],
  );

  const err = query.isError ? getApiError(query.error) : null;

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Nhật ký thay đổi</h1>
      {err?.status === 403 ? (
        <p className="text-sm text-muted-foreground">
          Bạn không có quyền xem nhật ký (audit:read).
        </p>
      ) : (
        <>
          <FilterBar
            search=""
            onSearchChange={() => undefined}
            searchPlaceholder="(Lọc bằng hai ô bên phải)"
            chips={[
              ...(params.entity
                ? [
                    {
                      id: 'entity',
                      label: 'Đối tượng',
                      value: params.entity,
                      onRemove: () => void setParams({ entity: '', page: 1 }),
                    },
                  ]
                : []),
              ...(params.action
                ? [
                    {
                      id: 'action',
                      label: 'Hành động',
                      value: params.action,
                      onRemove: () => void setParams({ action: '', page: 1 }),
                    },
                  ]
                : []),
            ]}
            onClearAll={() => void setParams({ entity: '', action: '', page: 1 })}
          >
            <select
              aria-label="Đối tượng"
              className="rounded-md border border-input bg-background px-2 text-sm"
              style={{ height: 'var(--input-h)' }}
              value={params.entity}
              onChange={(e) => void setParams({ entity: e.target.value, page: 1 })}
            >
              <option value="">Đối tượng: —</option>
              {ALL_ENTITY_TYPES.map((et) => (
                <option key={et} value={et}>
                  {et}
                </option>
              ))}
            </select>
            <select
              aria-label="Hành động"
              className="rounded-md border border-input bg-background px-2 text-sm"
              style={{ height: 'var(--input-h)' }}
              value={params.action}
              onChange={(e) => void setParams({ action: e.target.value, page: 1 })}
            >
              <option value="">Hành động: —</option>
              {ACTION_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </FilterBar>
          <DataTable
            tableKey="audit-logs"
            columns={columns}
            rows={query.data?.data ?? []}
            meta={query.data?.meta}
            state={params}
            onStateChange={(patch) => void setParams({ ...params, ...patch })}
            status={query.status}
            onRetry={() => void query.refetch()}
            getRowId={(r) => r.id}
          />
        </>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <AuditLogsPage />
    </Suspense>
  );
}
