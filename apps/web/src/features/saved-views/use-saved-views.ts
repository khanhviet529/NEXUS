'use client';

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  savedViewsControllerList,
  savedViewsControllerCreate,
  savedViewsControllerUpdate,
  savedViewsControllerRemove,
} from '@nexus/api-client';

/**
 * [CORE] Saved views (§5.5 tuỳ chọn, §5C.2) — lưu bộ lọc + cấu hình cột
 * thành view đặt tên.
 *
 * Điểm quan trọng: view lưu ĐÚNG những gì nằm trên URL (§5.4 — URL là nguồn
 * sự thật cho tham số danh sách). Nhờ vậy "áp dụng view" chỉ là ghi lại URL,
 * không cần cơ chế đồng bộ thứ hai.
 */
export interface SavedViewConfig {
  /** Chuỗi query của danh sách: page/limit/sort/q/filter[...] */
  search: string;
  /** Cột đang ẩn — khớp columnVisibility của DataTable */
  hiddenColumns?: string[];
}

export interface SavedView {
  id: string;
  entity: string;
  name: string;
  config: SavedViewConfig;
  isDefault: boolean;
  isShared: boolean;
  membershipId: string;
}

export function useSavedViews(entity: string, currentMembershipId?: string) {
  const qc = useQueryClient();
  const key = ['saved-views', entity];

  const list = useQuery({
    queryKey: key,
    queryFn: () => savedViewsControllerList({ entity }) as unknown as Promise<SavedView[]>,
    staleTime: 30_000,
  });

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, entity]);

  const create = useMutation({
    mutationFn: (input: { name: string; config: SavedViewConfig; isShared: boolean }) =>
      savedViewsControllerCreate({
        entity,
        name: input.name,
        config: input.config as unknown as Record<string, unknown>,
        isShared: input.isShared,
      }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: (input: { id: string; name?: string; isDefault?: boolean }) =>
      savedViewsControllerUpdate(input.id, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => savedViewsControllerRemove(id),
    onSuccess: invalidate,
  });

  const views = list.data ?? [];
  return {
    views,
    /** View của TÔI — sửa/xoá được */
    myViews: views.filter((v) => !currentMembershipId || v.membershipId === currentMembershipId),
    /** View người khác chia sẻ — chỉ đọc (BE trả 404 nếu cố sửa) */
    sharedViews: views.filter(
      (v) => currentMembershipId !== undefined && v.membershipId !== currentMembershipId,
    ),
    defaultView: views.find((v) => v.isDefault),
    isPending: list.isPending,
    create,
    update,
    remove,
  };
}
