'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * [CORE] FormField §5.8 — label + control + lỗi, một khuôn cho mọi form.
 * readonly dùng LẠI chính form (disabled), không viết màn hình thứ hai.
 *
 * Nối nhãn với ô nhập bằng `htmlFor`/`id`, và nối thông báo lỗi bằng
 * `aria-describedby` (§8.4). Trước đây `<label>` đứng cạnh ô nhập mà không trỏ
 * vào đâu cả: axe báo luật `label` ở CẢ BỐN ô của màn form. Hậu quả thật là
 * người dùng trình đọc màn hình nghe "edit text" trống trơn và bấm vào nhãn
 * không focus được vào ô.
 *
 * Id sinh bằng `useId` nên ổn định giữa SSR và client — tự đặt id bằng
 * `Math.random()` sẽ gây hydration mismatch.
 */
export function FormField({
  label,
  required,
  error,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  const controlId = `${id}-control`;
  const errorId = `${id}-error`;

  // Chỉ gắn được id/aria khi children là MỘT phần tử. Trường hợp khác (nhiều
  // phần tử, chuỗi) thì bỏ qua — im lặng còn hơn cloneElement lên thứ không
  // nhận prop và vỡ lúc chạy.
  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: (children.props as { id?: string }).id ?? controlId,
        'aria-describedby': error ? errorId : undefined,
        'aria-invalid': error ? true : undefined,
        'aria-required': required ? true : undefined,
      })
    : children;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={controlId} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {control}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
