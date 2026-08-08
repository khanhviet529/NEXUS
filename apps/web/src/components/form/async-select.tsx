'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronsUpDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Command as CommandPrimitive } from 'cmdk';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface AsyncSelectOption {
  value: string;
  label: string;
  hint?: string;
}

/**
 * [CORE] §5.8 — select ASYNC có tìm kiếm + phân trang ("tải thêm").
 * fetchPage(q, page) do caller cấp — thường bọc hook api-client.
 * Server lọc (không tải cả danh mục về client) — cùng lý §4.4 lọc trong query.
 */
export function AsyncSelect({
  value,
  valueLabel,
  onChange,
  fetchPage,
  placeholder = 'Chọn…',
  disabled,
  className,
}: {
  value: string | null;
  /** Nhãn của value đã chọn (caller giữ — tránh fetch phụ) */
  valueLabel?: string;
  onChange: (option: AsyncSelectOption) => void;
  fetchPage: (q: string, page: number) => Promise<{ items: AsyncSelectOption[]; hasNext: boolean }>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [acc, setAcc] = React.useState<AsyncSelectOption[]>([]);

  const debouncedQ = useDebounced(q, 250);
  React.useEffect(() => {
    setPage(1);
    setAcc([]);
  }, [debouncedQ]);

  const query = useQuery({
    queryKey: ['async-select', debouncedQ, page],
    queryFn: () => fetchPage(debouncedQ, page),
    enabled: open,
    staleTime: 15_000,
  });
  React.useEffect(() => {
    if (query.data) {
      setAcc((prev) => (page === 1 ? query.data.items : [...prev, ...query.data.items]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground', className)}
        onClick={() => setOpen(true)}
      >
        <span className="truncate">{value ? (valueLabel ?? value) : placeholder}</span>
        <ChevronsUpDown className="size-4 opacity-50" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-1/4 max-w-md -translate-y-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">{placeholder}</DialogTitle>
          <CommandPrimitive shouldFilter={false} className="flex w-full flex-col">
            <CommandInput value={q} onValueChange={setQ} placeholder="Gõ để tìm…" />
            <CommandList>
              {query.isPending && (
                <div className="flex justify-center py-4">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              )}
              {!query.isPending && acc.length === 0 && (
                <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                  Không có kết quả
                </CommandEmpty>
              )}
              <CommandGroup>
                {acc.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.value}
                    onSelect={() => {
                      onChange(opt);
                      setOpen(false);
                    }}
                  >
                    <span className="font-mono text-xs text-muted-foreground">{opt.hint}</span>
                    {opt.label}
                  </CommandItem>
                ))}
                {query.data?.hasNext && (
                  <CommandItem value="__more__" onSelect={() => setPage((p) => p + 1)}>
                    <span className="w-full text-center text-muted-foreground">Tải thêm…</span>
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </CommandPrimitive>
        </DialogContent>
      </Dialog>
    </>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
