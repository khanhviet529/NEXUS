'use client';

import * as React from 'react';
import type { OrderState } from '@nexus/shared';
import {
  ORDER_STATE_LABEL,
  ORDER_STATE_TONE,
  TONE_CLASS,
  type Tone,
} from '@/design-system/state-tones';
import { cn } from '@/lib/utils';

/**
 * [CORE] Badge trạng thái — MỘT component, nhiều mật độ (§9.1).
 *
 * `emphasis` sẽ do preset quyết định khi hệ preset (GĐ A) có mặt; hiện nhận
 * qua prop với mặc định 'normal'. Component KHÔNG rẽ nhánh theo id preset —
 * chỉ đọc giá trị, đúng luật §12 "cấm if (preset === 'x')".
 */
export type StatusEmphasis = 'subtle' | 'normal' | 'strong';

const EMPHASIS_CLASS: Record<StatusEmphasis, string> = {
  subtle: 'px-1.5 py-0 text-[11px]',
  normal: 'px-2 py-0.5 text-xs',
  strong: 'px-2.5 py-1 text-sm font-semibold',
};

export function StatusBadge({
  tone,
  label,
  emphasis = 'normal',
  className,
}: {
  tone: Tone;
  label: string;
  emphasis?: StatusEmphasis;
  className?: string;
}) {
  return (
    <span
      // role="status" để công nghệ trợ giúp đọc được thay đổi trạng thái (§5.10)
      role="status"
      className={cn(
        'inline-flex items-center rounded-md font-medium whitespace-nowrap',
        TONE_CLASS[tone],
        EMPHASIS_CLASS[emphasis],
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Badge cho trạng thái đơn hàng — tra tone + nhãn từ design-system */
export function OrderStatusBadge({
  status,
  emphasis,
}: {
  status: OrderState;
  emphasis?: StatusEmphasis;
}) {
  return (
    <StatusBadge
      tone={ORDER_STATE_TONE[status]}
      label={ORDER_STATE_LABEL[status]}
      emphasis={emphasis}
    />
  );
}
