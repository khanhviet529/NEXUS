'use client';

import * as React from 'react';
import type { OrderState } from '@nexus/shared';
import {
  ORDER_STATE_LABEL,
  ORDER_STATE_TONE,
  TONE_FG_VAR,
  TONE_SYMBOL,
  TONE_VAR,
  type Tone,
} from '@/design-system/state-tones';
import { useProjectUI } from '@/design-system/use-project-ui';
import type { StatusEmphasis } from '@/design-system/registry';
import { cn } from '@/lib/utils';

/**
 * [CORE] Badge trạng thái — MỘT component, nhiều mật độ (fe-preset-system §9.1).
 *
 * `emphasis` mặc định lấy từ `behavior.statusEmphasis` của preset. Enterprise
 * dùng badge nhỏ ('subtle'), Operations dùng badge to màu đậm ('strong') —
 * cùng component này, không thêm dòng code nào.
 *
 * Component KHÔNG rẽ nhánh theo id preset (§12): nó đọc giá trị, không hỏi
 * "đang là preset nào".
 *
 * Kích thước chữ và padding đến từ token DERIVED (--badge-font-size,
 * --badge-padding) chứ không phải class cố định — nên đổi preset là badge đổi
 * mà không sửa file này.
 */
export function StatusBadge({
  tone,
  label,
  emphasis,
  className,
}: {
  tone: Tone;
  label: string;
  emphasis?: StatusEmphasis;
  className?: string;
}) {
  const ui = useProjectUI();
  const strong = (emphasis ?? ui.behavior.statusEmphasis) === 'strong';
  const fill = TONE_VAR[tone];
  const fg = TONE_FG_VAR[tone];

  return (
    <span
      // role="status" để công nghệ trợ giúp đọc được thay đổi trạng thái (§5.10)
      role="status"
      data-tone={tone}
      data-emphasis={strong ? 'strong' : 'subtle'}
      className={cn('inline-flex items-center gap-1 font-medium whitespace-nowrap', className)}
      style={{
        // 'strong' đọc được từ xa (màn hình kho, quầy); 'subtle' giữ nền nhạt
        // cho bảng dày 30 dòng không bị loang màu.
        //
        // 'strong' dùng --tone-x-fg LÀM NỀN chứ không dùng --tone-x: chỉ token
        // -fg mới bảo đảm tương phản với chữ ở CẢ hai theme (nó tối ở light,
        // sáng ở dark, còn --surface-raised đi ngược lại).
        background: strong ? fg : `color-mix(in oklch, ${fill} 16%, transparent)`,
        color: strong ? 'var(--surface-raised)' : fg,
        fontSize: 'var(--badge-font-size)',
        padding: 'var(--badge-padding)',
        borderRadius: 'var(--badge-radius)',
      }}
    >
      {/* Dấu hiệu thứ hai ngoài màu — §8.4. aria-hidden vì nhãn chữ đã mang
          đủ nghĩa cho trình đọc màn hình. */}
      <span aria-hidden="true">{TONE_SYMBOL[tone]}</span>
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
