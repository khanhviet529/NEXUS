'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

/* ============================================================
 * Overlay manager (§5.1 providers/overlay) — GĐ8b.
 * confirm() dạng PROMISE: action pipeline await kết quả, không callback.
 * Hỗ trợ đủ ConfirmSpec §5.9: variant, typeToConfirm, reason, options.
 * ============================================================ */

export interface ConfirmSpec {
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: 'default' | 'danger';
  /** Bắt gõ đúng chuỗi này mới cho bấm — hành động huỷ diệt */
  typeToConfirm?: string;
  reason?: { required: boolean; label?: string; placeholder?: string };
  options?: Array<{ key: string; label: string; defaultChecked?: boolean }>;
}

export interface ConfirmOutcome {
  ok: boolean;
  reason?: string;
  options?: Record<string, boolean>;
}

export interface BulkResultData {
  succeeded: number;
  failed: Array<{ id: string; label: string; reason: string }>;
  skipped?: Array<{ label: string; reason: string }>;
}

interface OverlayContextValue {
  confirm: (spec: ConfirmSpec) => Promise<ConfirmOutcome>;
  showBulkResult: (data: BulkResultData) => Promise<void>;
}

const OverlayContext = React.createContext<OverlayContextValue | null>(null);

export function useConfirm(): OverlayContextValue['confirm'] {
  const ctx = React.useContext(OverlayContext);
  if (!ctx) throw new Error('useConfirm phải nằm trong <OverlayProvider>');
  return ctx.confirm;
}

export function useBulkResultDialog(): OverlayContextValue['showBulkResult'] {
  const ctx = React.useContext(OverlayContext);
  if (!ctx) throw new Error('useBulkResultDialog phải nằm trong <OverlayProvider>');
  return ctx.showBulkResult;
}

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common');
  const [confirmState, setConfirmState] = React.useState<{
    spec: ConfirmSpec;
    resolve: (o: ConfirmOutcome) => void;
  } | null>(null);
  const [bulkState, setBulkState] = React.useState<{
    data: BulkResultData;
    resolve: () => void;
  } | null>(null);
  const [reason, setReason] = React.useState('');
  const [typed, setTyped] = React.useState('');
  const [opts, setOpts] = React.useState<Record<string, boolean>>({});

  const confirm = React.useCallback((spec: ConfirmSpec) => {
    setReason('');
    setTyped('');
    setOpts(
      Object.fromEntries((spec.options ?? []).map((o) => [o.key, o.defaultChecked ?? false])),
    );
    return new Promise<ConfirmOutcome>((resolve) => setConfirmState({ spec, resolve }));
  }, []);

  const showBulkResult = React.useCallback((data: BulkResultData) => {
    return new Promise<void>((resolve) => setBulkState({ data, resolve }));
  }, []);

  const closeConfirm = (ok: boolean) => {
    if (!confirmState) return;
    confirmState.resolve(ok ? { ok, reason: reason || undefined, options: opts } : { ok });
    setConfirmState(null);
  };

  const spec = confirmState?.spec;
  const blocked =
    !!spec &&
    ((spec.typeToConfirm !== undefined && typed !== spec.typeToConfirm) ||
      (spec.reason?.required === true && reason.trim() === ''));

  return (
    <OverlayContext.Provider value={{ confirm, showBulkResult }}>
      {children}

      {/* Confirm dialog dùng chung — §5.9 pipeline bước 1 */}
      <Dialog open={!!confirmState} onOpenChange={(open) => !open && closeConfirm(false)}>
        {spec && (
          <DialogContent>
            <DialogTitle>{spec.title}</DialogTitle>
            {spec.description && <DialogDescription>{spec.description}</DialogDescription>}

            {spec.typeToConfirm && (
              <div className="mt-3 space-y-1">
                <p className="text-sm text-muted-foreground">
                  Gõ <b className="text-foreground">{spec.typeToConfirm}</b> để xác nhận:
                </p>
                <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
              </div>
            )}
            {spec.reason && (
              <div className="mt-3 space-y-1">
                <label className="text-sm">
                  {spec.reason.label ?? 'Lý do'}
                  {spec.reason.required && <span className="text-destructive"> *</span>}
                </label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={spec.reason.placeholder}
                />
              </div>
            )}
            {spec.options?.map((o) => (
              <label key={o.key} className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={opts[o.key] ?? false}
                  onChange={(e) => setOpts((s) => ({ ...s, [o.key]: e.target.checked }))}
                />
                {o.label}
              </label>
            ))}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => closeConfirm(false)}>
                {t('cancel')}
              </Button>
              <Button
                variant={spec.variant === 'danger' ? 'destructive' : 'default'}
                disabled={blocked}
                onClick={() => closeConfirm(true)}
              >
                {spec.confirmLabel ?? t('confirm')}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Bulk result — §5.9: KHÔNG toast "thành công" khi có dòng hỏng */}
      <Dialog
        open={!!bulkState}
        onOpenChange={(open) => {
          if (!open && bulkState) {
            bulkState.resolve();
            setBulkState(null);
          }
        }}
      >
        {bulkState && (
          <DialogContent className="max-w-lg">
            <DialogTitle>Kết quả xử lý hàng loạt</DialogTitle>
            <DialogDescription>
              Thành công {bulkState.data.succeeded} · Lỗi {bulkState.data.failed.length}
              {bulkState.data.skipped?.length
                ? ` · Bỏ qua ${bulkState.data.skipped.length}`
                : ''}
            </DialogDescription>
            <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm">
              {bulkState.data.failed.map((f) => (
                <li key={f.id} className="rounded-sm bg-destructive/10 px-2 py-1">
                  <b>{f.label}</b>: {f.reason}
                </li>
              ))}
              {bulkState.data.skipped?.map((s, i) => (
                <li key={`skip-${i}`} className="rounded-sm bg-muted px-2 py-1">
                  <b>{s.label}</b>: {s.reason}
                </li>
              ))}
            </ul>
          </DialogContent>
        )}
      </Dialog>
    </OverlayContext.Provider>
  );
}
