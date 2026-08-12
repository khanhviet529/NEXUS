'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  importsControllerImportProducts,
  importsControllerJobStatus,
  importsControllerJobErrors,
  getApiError,
} from '@nexus/api-client';
import { Button } from '@/components/ui/button';
import { useCan } from '@/lib/auth/use-can';

/**
 * Phase 4b — import wizard nối JOB THẬT (§4.7):
 * dán CSV → POST tạo job (202) → poll GET import-jobs/:id tới
 * COMPLETED/FAILED (progress từ checkpoint lastProcessedRow #27) →
 * bảng lỗi TỪNG DÒNG → "Sửa & tải lại" đưa đúng các dòng lỗi về textarea.
 *
 * Parser CSV ở đây CỐ Ý tối giản (split dấu phẩy, không quote/escape) —
 * đủ cho wizard demo của boilerplate; dự án thật thay bằng luồng file S3
 * presigned của §4.7 bước 1-2.
 */
type Row = Record<string, string>;

function parseCsv(text: string): { header: string[]; rows: Row[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { header: [], rows: [] };
  const header = lines[0]!.split(',').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
  return { header, rows };
}

function toCsv(header: string[], rows: Row[]): string {
  return [header.join(','), ...rows.map((r) => header.map((h) => r[h] ?? '').join(','))].join('\n');
}

const SAMPLE = 'code,nameVi,baseUom,costPrice\nSP100,Hàng nhập thử,CAI,1000';

export default function ProductImportPage() {
  const can = useCan();
  const [csv, setCsv] = React.useState('');
  const [jobId, setJobId] = React.useState<string | null>(null);

  const create = useMutation({
    mutationFn: (rows: Row[]) => importsControllerImportProducts({ rows }),
    onSuccess: (r) => {
      setJobId(r.jobId);
      toast.success(`Đã nhận ${r.totalRows} dòng — job đang chạy`);
    },
    onError: (e) => toast.error(getApiError(e).message),
  });

  const job = useQuery({
    queryKey: ['import-job', jobId],
    queryFn: () => importsControllerJobStatus(jobId!),
    enabled: !!jobId,
    // Poll tới trạng thái đích rồi DỪNG — không giữ interval chạy rỗng
    refetchInterval: (q) =>
      q.state.data && ['COMPLETED', 'FAILED'].includes(q.state.data.status) ? false : 1_000,
  });

  const finished = job.data && ['COMPLETED', 'FAILED'].includes(job.data.status);
  const errors = useQuery({
    queryKey: ['import-job-errors', jobId],
    queryFn: () => importsControllerJobErrors(jobId!),
    enabled: !!jobId && !!finished && (job.data?.errorRows ?? 0) > 0,
  });

  if (!can('product:import')) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-4 text-xl font-semibold">Import sản phẩm</h1>
        <p className="text-sm text-muted-foreground">
          Bạn không có quyền import (product:import).
        </p>
      </main>
    );
  }

  const parsed = parseCsv(csv);

  const retryWithErrorRows = () => {
    if (!errors.data) return;
    const { header } = parsed.header.length
      ? parsed
      : { header: Object.keys(errors.data[0]?.raw ?? {}) };
    const rows = errors.data.map((e) => e.raw as Row);
    setCsv(toCsv(header, rows));
    setJobId(null); // quay về bước dán — giữ nguyên dữ liệu lỗi để sửa
  };

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Import sản phẩm</h1>
      <p className="text-sm text-muted-foreground">
        <Link href="/products" className="underline">
          ← Về danh sách sản phẩm
        </Link>
      </p>

      {!jobId && (
        <section className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="csv-input">
            Dán CSV (dòng đầu là tên cột)
          </label>
          <textarea
            id="csv-input"
            className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
            rows={10}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={SAMPLE}
          />
          <div className="flex items-center gap-2">
            <Button
              disabled={parsed.rows.length === 0 || create.isPending}
              onClick={() => create.mutate(parsed.rows)}
            >
              {create.isPending ? 'Đang gửi…' : `Import ${parsed.rows.length} dòng`}
            </Button>
            <Button variant="outline" onClick={() => setCsv(SAMPLE)}>
              Chèn mẫu
            </Button>
          </div>
        </section>
      )}

      {jobId && job.data && (
        <section className="space-y-2" aria-live="polite">
          <h2 className="font-medium">
            {finished
              ? job.data.status === 'COMPLETED'
                ? 'Hoàn tất'
                : 'Job thất bại'
              : 'Đang xử lý…'}
          </h2>
          <p className="text-sm tabular-nums">
            {job.data.lastProcessedRow}/{job.data.totalRows} dòng · hợp lệ {job.data.validRows} ·
            lỗi {job.data.errorRows}
          </p>
          {/* progress từ checkpoint — job chết giữa chừng thấy được nó dừng ở đâu (#27) */}
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={job.data.totalRows}
            aria-valuenow={job.data.lastProcessedRow}
            className="h-2 w-full overflow-hidden rounded"
            style={{ background: 'var(--tone-muted)' }}
          >
            <div
              className="h-full transition-all"
              style={{
                background: 'var(--tone-success-fg)',
                width: `${job.data.totalRows ? (job.data.lastProcessedRow / job.data.totalRows) * 100 : 0}%`,
              }}
            />
          </div>

          {finished && (job.data.errorRows ?? 0) > 0 && errors.data && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Lỗi từng dòng</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1 pr-3">Dòng</th>
                      <th className="py-1 pr-3">Dữ liệu</th>
                      <th className="py-1">Lỗi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.data.map((e) => (
                      <tr key={e.rowNumber} className="border-b align-top last:border-0">
                        <td className="py-1 pr-3 tabular-nums">{e.rowNumber}</td>
                        <td className="py-1 pr-3 font-mono text-xs">
                          {JSON.stringify(e.raw)}
                        </td>
                        <td className="py-1 text-xs" style={{ color: 'var(--tone-danger-fg)' }}>
                          {Object.entries(e.errors)
                            .map(
                              ([field, msgs]) =>
                                `${field}: ${Array.isArray(msgs) ? msgs.join('; ') : String(msgs)}`,
                            )
                            .join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" onClick={retryWithErrorRows}>
                Sửa &amp; tải lại {errors.data.length} dòng lỗi
              </Button>
            </div>
          )}

          {finished && (
            <Button
              variant="outline"
              onClick={() => {
                setJobId(null);
                setCsv('');
              }}
            >
              Import lô khác
            </Button>
          )}
        </section>
      )}
    </main>
  );
}
