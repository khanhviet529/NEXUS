'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { formatMoney, parseMoneyInput } from '@/lib/format/money';
import { cn } from '@/lib/utils';

/**
 * [CORE] §5.8 — input tiền/số có phân cách nghìn.
 * Giá trị TRUYỀN RA luôn là chuỗi decimal chuẩn (§3.7: '1234567.5');
 * phân cách nghìn chỉ là lớp HIỂN THỊ khi không focus.
 */
export function MoneyInput({
  value,
  onChange,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (raw: string) => void;
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <Input
      {...props}
      inputMode="decimal"
      className={cn('text-right tnum', className)}
      value={focused ? value : formatMoney(value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => onChange(parseMoneyInput(e.target.value))}
    />
  );
}
