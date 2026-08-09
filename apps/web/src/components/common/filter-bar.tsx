'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * [CORE] FilterBar §5.5 — ô tìm kiếm + chip bộ lọc đang bật + chỗ cắm saved views.
 *
 * Hai luật đắt giá:
 *
 * 1. **Bộ lọc đang bật phải NHÌN THẤY được.** Bộ lọc giấu trong panel đóng là
 *    nguồn của "sao đơn của tôi biến mất" — người dùng quên mình đã lọc. Mỗi
 *    bộ lọc là một chip có nút xoá riêng.
 *
 * 2. **Ô tìm kiếm không tự submit từng phím.** Nó gọi `onSearchChange` sau khi
 *    ngừng gõ (debounce) — gõ 12 ký tự mà bắn 12 request là cách nhanh nhất
 *    làm chậm cả bảng.
 */
export interface FilterChip {
  id: string;
  label: string;
  value: string;
  onRemove: () => void;
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Tìm kiếm…',
  chips = [],
  onClearAll,
  savedViews,
  children,
  debounceMs = 300,
}: {
  search: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  chips?: FilterChip[];
  onClearAll?: () => void;
  /** Thanh saved views (features/saved-views) — cắm vào, không nhúng cứng */
  savedViews?: React.ReactNode;
  /** Nút lọc bổ sung của module */
  children?: React.ReactNode;
  debounceMs?: number;
}) {
  const [draft, setDraft] = React.useState(search);

  // Đồng bộ khi URL đổi từ bên ngoài (áp saved view, back/forward)
  React.useEffect(() => setDraft(search), [search]);

  React.useEffect(() => {
    if (draft === search) return;
    const id = setTimeout(() => onSearchChange(draft), debounceMs);
    return () => clearTimeout(id);
  }, [draft, search, onSearchChange, debounceMs]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            className="pl-8"
            style={{ height: 'var(--input-h)' }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // profile 'search' (§7): Enter là TÌM NGAY, không chờ debounce
              if (e.key === 'Enter') {
                e.preventDefault();
                onSearchChange(draft);
              }
            }}
          />
        </div>
        {children}
        {savedViews}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Đang lọc:</span>
          {chips.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 border border-border text-xs"
              style={{
                borderRadius: 'var(--badge-radius)',
                padding: 'var(--badge-padding)',
                fontSize: 'var(--badge-font-size)',
              }}
            >
              <span className="text-muted-foreground">{c.label}:</span>
              {c.value}
              <button
                type="button"
                aria-label={`Bỏ lọc ${c.label}`}
                onClick={c.onRemove}
                className="hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {onClearAll && (
            <Button variant="ghost" size="sm" onClick={onClearAll}>
              Xoá tất cả
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
