'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { apiAxios } from '@nexus/api-client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Dropzone } from '@/components/form/dropzone';
import { parseCsv } from './parse-csv';

/**
 * [CORE] UI import §4.7 — ba bước: CHỌN FILE → XEM TRƯỚC → CHẠY, rồi theo dõi.
 *
 * Vì sao có bước xem trước bắt buộc: import là thao tác ghi hàng nghìn dòng.
 * "Chọn file xong chạy luôn" nghĩa là người dùng biết mình nhập nhầm cột sau
 * khi 5.000 sản phẩm đã vào kho.
 *
 * Vì sao KHÔNG có thanh phần trăm mượt: BE trả `lastProcessedRow` theo
 * checkpoint (§4.7), không phải theo dòng. Vẽ thanh chạy đều là nói dối về
 * tiến độ; ở đây hiện đúng số dòng đã xử lý.
 *
 * Lỗi TỪNG DÒNG lấy từ /import-jobs/:id/errors — báo "import thất bại" chung
 * chung thì người dùng không biết sửa dòng nào.
 */
type Step = 'pick' | 'preview' | 'running' | 'done';

interface JobStatus {
  id: string;
  status: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  lastProcessedRow: number;
}

interface RowError {
  rowNumber: number;
  field?: string | null;
  message: string;
}

const TERMINAL = ['COMPLETED', 'FAILED', 'PARTIAL'];

export function ImportDialog({
  open,
  onOpenChange,
  entityLabel,
  endpoint,
  onFinished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityLabel: string;
  /** Ví dụ '/api/v1/products/import' */
  endpoint: string;
  onFinished?: () => void;
}) {
  const [step, setStep] = React.useState<Step>('pick');
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const reset = React.useCallback(() => {
    setStep('pick');
    setRows([]);
    setParseError(null);
    setJobId(null);
    setSubmitError(null);
  }, []);

  const job = useQuery({
    queryKey: ['import-job', jobId],
    enabled: !!jobId && step === 'running',
    // Poll: job chạy nền theo batch, không có websocket ở GĐ này
    refetchInterval: (q) => (isTerminal(q.state.data) ? false : 1500),
    queryFn: async () => {
      const res = await apiAxios.get<JobStatus>(`/api/v1/import-jobs/${jobId}`);
      return res.data;
    },
  });

  React.useEffect(() => {
    if (step === 'running' && isTerminal(job.data)) {
      setStep('done');
      onFinished?.();
    }
  }, [step, job.data, onFinished]);

  const errors = useQuery({
    queryKey: ['import-job-errors', jobId],
    enabled: step === 'done' && (job.data?.errorRows ?? 0) > 0,
    queryFn: async () => {
      const res = await apiAxios.get<RowError[]>(`/api/v1/import-jobs/${jobId}/errors`);
      return res.data;
    },
  });

  const onFile = async (file: File) => {
    setParseError(null);
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length === 0) {
        setParseError('File không có dòng dữ liệu nào.');
        return;
      }
      setRows(parsed);
      setStep('preview');
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Không đọc được file.');
    }
  };

  const run = async () => {
    setSubmitError(null);
    try {
      const res = await apiAxios.post<{ jobId: string }>(endpoint, {
        mode: 'UPSERT',
        onDuplicate: 'SKIP',
        rows,
      });
      setJobId(res.data.jobId);
      setStep('running');
    } catch {
      setSubmitError('Không tạo được job import. Thử lại sau.');
    }
  };

  const headers = rows[0] ? Object.keys(rows[0]) : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogTitle>Nhập {entityLabel} từ file</DialogTitle>

        {step === 'pick' && (
          <div className="mt-4 space-y-3">
            <Dropzone
              accept=".csv,text/csv"
              ariaLabel="Chọn file CSV để nhập"
              label="Kéo thả file CSV hoặc bấm để chọn"
              icon={<FileUp className="size-6" />}
              onFiles={(files) => files[0] && void onFile(files[0])}
            />
            <p className="text-sm text-muted-foreground">
              File CSV, dòng đầu là tên cột. Dữ liệu sẽ được xem trước trước khi chạy.
            </p>
            {parseError && (
              <p role="alert" className="text-sm text-destructive">
                {parseError}
              </p>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="mt-4 space-y-3">
            <p className="text-sm">
              Đọc được <strong>{rows.length}</strong> dòng. Kiểm 5 dòng đầu xem cột có khớp không:
            </p>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full" style={{ fontSize: 'var(--table-font-size)' }}>
                <thead className="text-left" style={{ background: 'var(--table-header-bg)' }}>
                  <tr>
                    {headers.map((h) => (
                      <th key={h} scope="col" className="px-2 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      {headers.map((h) => (
                        <td key={h} className="px-2 py-1.5">
                          {r[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {submitError && (
              <p role="alert" className="text-sm text-destructive">
                {submitError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                Chọn file khác
              </Button>
              <Button onClick={run}>
                <FileUp /> Chạy import {rows.length} dòng
              </Button>
            </div>
          </div>
        )}

        {step === 'running' && (
          <div className="mt-4 flex items-center gap-3" aria-live="polite">
            <Loader2 className="size-5 animate-spin" />
            <span>
              Đang xử lý… {job.data?.lastProcessedRow ?? 0}/{job.data?.totalRows ?? rows.length} dòng
            </span>
          </div>
        )}

        {step === 'done' && job.data && (
          <div className="mt-4 space-y-3" aria-live="polite">
            <p className="flex items-center gap-2">
              {job.data.errorRows > 0 ? (
                <AlertTriangle className="size-5 text-destructive" />
              ) : (
                <CheckCircle2 className="size-5" />
              )}
              Xong: <strong>{job.data.validRows}</strong> dòng hợp lệ,{' '}
              <strong>{job.data.errorRows}</strong> dòng lỗi trên tổng {job.data.totalRows}.
            </p>

            {job.data.errorRows > 0 && (
              <div className="max-h-64 overflow-auto rounded-md border border-border">
                <table className="w-full" style={{ fontSize: 'var(--table-font-size)' }}>
                  <thead className="text-left" style={{ background: 'var(--table-header-bg)' }}>
                    <tr>
                      <th scope="col" className="px-2 py-2 font-medium">
                        Dòng
                      </th>
                      <th scope="col" className="px-2 py-2 font-medium">
                        Trường
                      </th>
                      <th scope="col" className="px-2 py-2 font-medium">
                        Lỗi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(errors.data ?? []).map((e, i) => (
                      <tr key={`${e.rowNumber}-${i}`} className="border-t border-border">
                        <td className="px-2 py-1.5 tnum">{e.rowNumber}</td>
                        <td className="px-2 py-1.5">{e.field ?? '—'}</td>
                        <td className="px-2 py-1.5">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                Nhập file khác
              </Button>
              <Button onClick={() => onOpenChange(false)}>Đóng</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function isTerminal(data: JobStatus | undefined): boolean {
  return !!data && TERMINAL.includes(data.status);
}
