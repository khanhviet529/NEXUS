'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { parseAsString, useQueryState } from 'nuqs';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  reportsControllerList,
  reportsControllerMeta,
  reportsControllerRun,
  orgUnitsControllerList,
  getApiError,
} from '@nexus/api-client';
import type { ReportParamDefDto, ReportRunResultDto } from '@nexus/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExportButton } from '@/features/exports/export-button';
import { formatMoney } from '@/lib/format/money';

/**
 * Phase 4a — trang báo cáo render ĐỘNG từ GET /reports/:id/meta (A1).
 * Phép thử "khai báo báo cáo mới < 2 giờ" phía FE: thêm report ở BE registry
 * là trang này TỰ có form + bảng + dòng tổng + drill-down + export, không sửa
 * một dòng FE nào.
 *
 * RANH GIỚI CHỐNG FORM-BUILDER: switch DUY NHẤT dưới đây trên union ĐÓNG
 * `ReportParamDefDtoType` (4 loại). Muốn loại param mới → sửa ReportParamType
 * ở BE → orval sinh lại → switch này ĐỎ COMPILE (assertNever). Không thêm
 * nhánh "render config tuỳ ý".
 */
function assertNever(x: never): never {
  throw new Error(`Loại param ngoài union đóng: ${String(x)}`);
}

function ParamField({
  def,
  value,
  onChange,
}: {
  def: ReportParamDefDto;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const orgUnits = useQuery({
    queryKey: ['org-units'],
    queryFn: () => orgUnitsControllerList(),
    enabled: def.type === 'orgUnit',
    staleTime: 60_000,
  });

  switch (def.type) {
    case 'dateRange': {
      const range = (value ?? {}) as { from?: string; to?: string };
      // BE validate {from,to} ISO — input date cho ISO yyyy-mm-dd
      return (
        <span className="flex items-center gap-1">
          <Input
            type="date"
            aria-label={`${def.label} từ`}
            value={range.from?.slice(0, 10) ?? ''}
            onChange={(e) =>
              onChange({ ...range, from: new Date(e.target.value).toISOString() })
            }
            className="w-40"
          />
          <span className="text-muted-foreground">→</span>
          <Input
            type="date"
            aria-label={`${def.label} đến`}
            value={range.to?.slice(0, 10) ?? ''}
            onChange={(e) =>
              // hết ngày — không mất đơn phát sinh trong ngày cuối
              onChange({ ...range, to: new Date(`${e.target.value}T23:59:59.999Z`).toISOString() })
            }
            className="w-40"
          />
        </span>
      );
    }
    case 'select':
      return (
        <select
          aria-label={def.label}
          className="rounded-md border border-input bg-background px-2 text-sm"
          style={{ height: 'var(--input-h)' }}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">—</option>
          {(def.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'orgUnit':
      return (
        <select
          aria-label={def.label}
          className="rounded-md border border-input bg-background px-2 text-sm"
          style={{ height: 'var(--input-h)' }}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">Tất cả đơn vị</option>
          {(orgUnits.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.code} — {u.name}
            </option>
          ))}
        </select>
      );
    case 'text':
      return (
        <Input
          aria-label={def.label}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="w-48"
        />
      );
    default:
      return assertNever(def.type);
  }
}

function formatCell(value: unknown, type?: string): string {
  if (value === null || value === undefined) return '—';
  if (type === 'money') return formatMoney(String(value));
  if (type === 'date') return new Date(String(value)).toLocaleDateString('vi');
  return String(value);
}

function ReportRunner({ id }: { id: string }) {
  const meta = useQuery({
    queryKey: ['report-meta', id],
    queryFn: () => reportsControllerMeta(id),
  });
  const [params, setParams] = React.useState<Record<string, unknown>>({});
  const [result, setResult] = React.useState<ReportRunResultDto | null>(null);

  const run = useMutation({
    mutationFn: () => reportsControllerRun(id, { params }),
    onSuccess: setResult,
    onError: (e) => toast.error(getApiError(e).message),
  });

  // Đổi báo cáo → params/kết quả của báo cáo cũ không được dính lại
  React.useEffect(() => {
    setParams({});
    setResult(null);
  }, [id]);

  if (meta.isError) {
    return <p className="text-sm text-muted-foreground">{getApiError(meta.error).message}</p>;
  }
  if (meta.isPending) return <p className="text-sm text-muted-foreground">Đang tải định nghĩa…</p>;

  const missingRequired = meta.data.params.some(
    (p) => p.required && (params[p.key] === undefined || params[p.key] === null),
  );

  return (
    <section className="space-y-4">
      <h2 className="font-medium">{meta.data.name}</h2>
      <div className="flex flex-wrap items-end gap-3">
        {meta.data.params.map((p) => (
          <label key={p.key} className="flex flex-col gap-1 text-sm">
            <span>
              {p.label}
              {p.required && <span style={{ color: 'var(--tone-danger-fg)' }}> *</span>}
            </span>
            <ParamField
              def={p}
              value={params[p.key]}
              onChange={(v) => setParams((s) => ({ ...s, [p.key]: v }))}
            />
          </label>
        ))}
        <Button disabled={missingRequired || run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? 'Đang chạy…' : 'Chạy báo cáo'}
        </Button>
        <ExportButton
          endpoint={`/api/v1/reports/${id}/export`}
          body={{ params }}
          fallbackFilename={`${id}.csv`}
        />
      </div>

      {result && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                {result.columns.map((c) => (
                  <th
                    key={c.key}
                    className={`py-2 pr-3 ${c.type === 'money' || c.type === 'number' ? 'text-right' : ''}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.length === 0 ? (
                <tr>
                  <td colSpan={result.columns.length} className="py-4 text-center text-muted-foreground">
                    Không có dữ liệu trong phạm vi đã chọn.
                  </td>
                </tr>
              ) : (
                result.rows.map((row, i) => {
                  const href = result.drilldowns?.[i];
                  return (
                    <tr key={i} className="border-b last:border-0">
                      {result.columns.map((c, ci) => {
                        const text = formatCell(row[c.key], c.type);
                        return (
                          <td
                            key={c.key}
                            className={`py-1.5 pr-3 tabular-nums ${c.type === 'money' || c.type === 'number' ? 'text-right' : ''}`}
                          >
                            {/* Drill-down là LINK THẬT trên cột đầu — mở màn danh sách đã filter */}
                            {ci === 0 && href ? (
                              <Link href={href} className="underline">
                                {text}
                              </Link>
                            ) : (
                              text
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr>
                {result.columns.map((c, ci) => (
                  <td
                    key={c.key}
                    className={`py-2 pr-3 font-semibold tabular-nums ${c.type === 'money' || c.type === 'number' ? 'text-right' : ''}`}
                  >
                    {ci === 0 && !(c.key in result.summary)
                      ? 'Tổng cộng'
                      : c.key in result.summary
                        ? formatCell(result.summary[c.key], c.type)
                        : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
          {result.cached && (
            <p className="mt-1 text-xs text-muted-foreground">Kết quả từ cache của máy chủ.</p>
          )}
        </div>
      )}
    </section>
  );
}

function ReportsPageInner() {
  const [id, setId] = useQueryState('id', parseAsString.withDefault(''));
  const list = useQuery({ queryKey: ['reports'], queryFn: () => reportsControllerList() });

  if (list.isError) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-4 text-xl font-semibold">Báo cáo</h1>
        <p className="text-sm text-muted-foreground">{getApiError(list.error).message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Báo cáo</h1>
      {list.isPending ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : (list.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Bạn chưa có quyền xem báo cáo nào — danh sách này lọc theo quyền từng report (A1).
        </p>
      ) : (
        <>
          <nav aria-label="Danh sách báo cáo" className="flex flex-wrap gap-2">
            {(list.data ?? []).map((r) => (
              <Button
                key={r.id}
                size="sm"
                variant={r.id === id ? 'default' : 'outline'}
                onClick={() => void setId(r.id)}
              >
                {r.name}
              </Button>
            ))}
          </nav>
          {id && <ReportRunner id={id} />}
        </>
      )}
    </main>
  );
}

export default function ReportsPage() {
  return (
    <Suspense>
      <ReportsPageInner />
    </Suspense>
  );
}
