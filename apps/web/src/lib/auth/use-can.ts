'use client';

import { useCallback } from 'react';
import { useAuthControllerMe } from '@nexus/api-client';

/**
 * [CORE] useCan (§5.1 lib/auth) — FE kiểm quyền bằng permissions từ /me,
 * KHÔNG rẽ nhánh theo mã vai trò (CLAUDE.md §3). FE ẩn/hiện là UX;
 * BE vẫn là lưới chặn thật.
 */
export function useCurrentUser() {
  return useAuthControllerMe({ query: { staleTime: 60_000 } });
}

export function useCan() {
  const me = useCurrentUser();
  const permissions = me.data?.permissions;
  return useCallback(
    (required: string | string[]): boolean => {
      if (!permissions) return false; // chưa tải xong → coi như chưa có (fail-closed)
      const list = Array.isArray(required) ? required : [required];
      return list.every((p) => permissions.includes(p));
    },
    [permissions],
  );
}
