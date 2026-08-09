'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiError } from '@nexus/api-client';
import { resolveNextAction } from '@/lib/api/next-action';
import { useCan } from '@/lib/auth/use-can';
import { useConfirm, useBulkResultDialog } from '@/providers/overlay';
import type { ActionDef, BulkActionDef, ConfirmResult, ResolvedAction } from './types';

function evalLabel<TCtx>(v: ActionDef<TCtx>['label'], ctx: TCtx): string {
  return typeof v === 'function' ? (v as (c: TCtx) => string)(ctx) : v;
}

/** Sắp theo group → order → id: thứ tự menu luôn ổn định (§5.9) */
function sortActions<TCtx>(a: ActionDef<TCtx>, b: ActionDef<TCtx>): number {
  const g = (a.group ?? '').localeCompare(b.group ?? '');
  if (g !== 0) return g;
  const o = (a.order ?? 100) - (b.order ?? 100);
  return o !== 0 ? o : a.id.localeCompare(b.id);
}

/**
 * [CORE] Pipeline §5.9: confirm → run → toast → invalidate → lỗi tập trung.
 *   const actions = useActions(orderActions, { record, me })
 */
export function useActions<TCtx>(defs: ActionDef<TCtx>[], ctx: TCtx): ResolvedAction<TCtx>[] {
  const can = useCan();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const execute = useCallback(
    async (def: ActionDef<TCtx>) => {
      let input: ConfirmResult = {};
      if (def.confirm) {
        const spec = def.confirm(ctx);
        if (spec) {
          const res = await confirm(spec);
          if (!res.ok) return; // user bấm Huỷ
          input = { reason: res.reason, options: res.options };
        }
      }

      setPendingId(def.id);
      try {
        const result = await def.run(ctx, input);
        const msg = typeof def.success === 'function' ? def.success(ctx, result) : def.success;
        if (msg) toast.success(msg);
        def.invalidates?.(ctx).forEach((key) => void qc.invalidateQueries({ queryKey: key }));
        def.onSuccess?.(ctx, result);
      } catch (e) {
        // Lỗi tập trung — FE xử lý theo code/status, không theo message (§3.6)
        const err = getApiError(e);
        // §3.6: BE trả MÃ việc nên làm tiếp; FE quyết nhãn + đích đến.
        // Lỗi cụt ("không đủ tồn kho") để người dùng bế tắc; có lối đi tiếp
        // thì họ tự xử lý được.
        const next = resolveNextAction(err.nextAction);
        const action = next
          ? {
              label: next.label,
              onClick: () => {
                if (next.kind === 'reload') {
                  def.invalidates?.(ctx).forEach((k) => void qc.invalidateQueries({ queryKey: k }));
                } else if (next.kind === 'navigate' && next.href) {
                  window.location.assign(next.href);
                }
              },
            }
          : undefined;

        if (err.status === 403) {
          toast.error('Bạn không có quyền thực hiện thao tác này', { action });
        } else if (err.status === 409) {
          toast.error(err.message, { action }); // optimistic lock (§12 #17)
          def.invalidates?.(ctx).forEach((k) => void qc.invalidateQueries({ queryKey: k }));
        } else if (err.code !== 'COMMON.INTERNAL_ERROR') {
          toast.error(err.message, { action }); // lỗi nghiệp vụ có code từ BE
        } else {
          toast.error('Đã xảy ra lỗi', {
            description: `Mã tra cứu: ${err.traceId}`,
            action: {
              label: 'Copy',
              onClick: () => void navigator.clipboard.writeText(err.traceId),
            },
          });
        }
      } finally {
        setPendingId(null);
      }
    },
    [ctx, confirm, qc],
  );

  return useMemo(() => {
    return [...defs].sort(sortActions).map((def) => {
      // §5.9: thiếu quyền → ẨN HẲN; không đủ điều kiện → MỜ + lý do
      const hasPerm = !def.permission || can(def.permission);
      const visible = hasPerm && (def.visible?.(ctx) ?? true);
      const enabled = def.enabled?.(ctx) ?? true;
      return {
        def,
        label: evalLabel(def.label, ctx),
        visible,
        disabled: enabled !== true || pendingId === def.id,
        reason: enabled === true ? undefined : enabled,
        pending: pendingId === def.id,
        run: () => execute(def),
      };
    });
  }, [defs, ctx, can, execute, pendingId]);
}

/**
 * Bulk (§5.9 mục 5): KHÔNG toast "thành công" trơn khi có dòng hỏng —
 * mở dialog liệt kê dòng nào hỏng vì sao.
 */
export function useBulkAction<TRow>(def: BulkActionDef<TRow>): (rows: TRow[]) => Promise<void> {
  const confirm = useConfirm();
  const showResult = useBulkResultDialog();
  const qc = useQueryClient();

  return useCallback(
    async (rows: TRow[]) => {
      const { ok, skipped } = def.eligible?.(rows) ?? { ok: rows, skipped: [] };
      if (ok.length === 0) {
        toast.error('Không có bản ghi nào hợp lệ để thực hiện');
        return;
      }
      if (def.confirm) {
        const res = await confirm(def.confirm(ok));
        if (!res.ok) return;
      }
      try {
        const result = await def.run(ok, {});
        def.invalidates?.().forEach((k) => void qc.invalidateQueries({ queryKey: k }));
        const skippedOut = skipped.map((s) => ({
          label: String((s.row as { code?: string }).code ?? ''),
          reason: s.reason,
        }));
        if (result.failed.length === 0 && skipped.length === 0) {
          toast.success(`Đã xử lý ${result.succeeded} bản ghi`);
        } else {
          await showResult({ ...result, skipped: skippedOut });
        }
      } catch (e) {
        toast.error(getApiError(e).message);
      }
    },
    [def, confirm, showResult, qc],
  );
}
