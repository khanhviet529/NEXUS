'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { personalizationControllerTouch } from '@nexus/api-client';
import type { TouchItemDtoEntity } from '@nexus/api-client';

/**
 * V13 §5C.7 — trang chi tiết gọi khi mở để ghi "vừa xem".
 * Fire-and-forget: lỗi không được làm phiền người dùng (tiện ích, không nghiệp vụ).
 */
export function useTouchRecent(entity: TouchItemDtoEntity, entityId: string | undefined): void {
  const qc = useQueryClient();
  React.useEffect(() => {
    if (!entityId) return;
    personalizationControllerTouch({ entity, entityId })
      .then(() => qc.invalidateQueries({ queryKey: ['recent-items'] }))
      .catch(() => undefined);
  }, [entity, entityId, qc]);
}
