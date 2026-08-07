'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * [CORE] FormField §5.8 — label + control + lỗi, một khuôn cho mọi form.
 * readonly dùng LẠI chính form (disabled), không viết màn hình thứ hai.
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
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
