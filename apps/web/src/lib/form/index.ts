'use client';

import { useCallback, useEffect } from 'react';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { getApiError } from '@nexus/api-client';
import { toast } from 'sonner';

/**
 * [CORE] Form §5.8 — tiện ích dùng chung cho react-hook-form + zod.
 */

/** Map lỗi 422 vào ĐÚNG field (§5.8) — key trong details khớp path của form */
export function applyServerErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown,
): boolean {
  const err = getApiError(error);
  if (err.status !== 422 || !err.details) return false;
  let applied = false;
  for (const [field, messages] of Object.entries(err.details)) {
    const message = Array.isArray(messages) ? String(messages[0]) : String(messages);
    form.setError(field as Path<T>, { type: 'server', message });
    applied = true;
  }
  if (!applied) toast.error(err.message);
  return applied;
}

/** Guard rời trang khi form dirty chưa lưu (§5.8) — beforeunload cho F5/đóng tab */
export function useDirtyGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}

/** Ctrl+S submit (§5.8) — chặn hành vi save trang của trình duyệt */
export function useCtrlS(submit: () => void): void {
  const cb = useCallback(
    (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );
  useEffect(() => {
    window.addEventListener('keydown', cb);
    return () => window.removeEventListener('keydown', cb);
  }, [cb]);
}
