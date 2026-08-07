'use client';

import * as React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * [CORE] §5.9: nút bị chặn phải MỜ + tooltip nêu lý do, không biến mất.
 * Bọc <span> quanh children — Radix không bắt được event trên
 * <button disabled> (bug kinh điển, ghi chú ngay trong action-registry.tsx).
 */
export function DisabledTooltip({
  reason,
  side,
  children,
}: {
  reason?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: React.ReactNode;
}) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={0}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side={side}>{reason}</TooltipContent>
    </Tooltip>
  );
}
