'use client';

import * as React from 'react';
import type {
  ColumnOrderState,
  ColumnSizingState,
  VisibilityState,
} from '@tanstack/react-table';

/**
 * Cấu hình bảng theo NGƯỜI DÙNG (cấp 3, fe-preset-system §2): ẩn/hiện, thứ tự,
 * bề rộng, ghim cột. Lưu localStorage — saved view lưu server là thứ khác
 * (bộ lọc + sort dùng chung cho cả nhóm), xem features/saved-views.
 *
 * Gộp bốn trục vào MỘT key thay vì bốn key rời: đọc/ghi bốn lần trên mỗi
 * tương tác resize là nguồn của trạng thái lệch nhau khi mở nhiều tab.
 */
export interface TableConfig {
  visibility: VisibilityState;
  order: ColumnOrderState;
  sizes: ColumnSizingState;
  /** `undefined` = chưa động vào, dùng mặc định preset. `[]` = user CỐ Ý bỏ ghim hết. */
  pinned?: string[];
}

const EMPTY: TableConfig = { visibility: {}, order: [], sizes: {} };

function storageKey(tableKey: string): string {
  return `dt-config:${tableKey}`;
}

function read(tableKey: string): TableConfig {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = localStorage.getItem(storageKey(tableKey));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<TableConfig>;
    return {
      visibility: parsed.visibility ?? {},
      order: parsed.order ?? [],
      sizes: parsed.sizes ?? {},
      pinned: parsed.pinned,
    };
  } catch {
    // Cấu hình hỏng không được làm chết bảng — mất tuỳ biến còn hơn màn trắng
    return EMPTY;
  }
}

export function useTableConfig(
  tableKey: string,
): [TableConfig, (fn: (c: TableConfig) => TableConfig) => void, () => void] {
  // Đọc LAZY trong useState: đọc ở thân component sẽ chạy lại mỗi lần render,
  // và ở SSR thì localStorage không tồn tại.
  const [config, setState] = React.useState<TableConfig>(() => read(tableKey));

  // Đổi bảng (tableKey) phải nạp lại cấu hình của bảng đó, nếu không thì bề
  // rộng cột của bảng A dính sang bảng B.
  const previousKey = React.useRef(tableKey);
  React.useEffect(() => {
    if (previousKey.current === tableKey) return;
    previousKey.current = tableKey;
    setState(read(tableKey));
  }, [tableKey]);

  const update = React.useCallback(
    (fn: (c: TableConfig) => TableConfig) => {
      setState((current) => {
        const next = fn(current);
        try {
          localStorage.setItem(storageKey(tableKey), JSON.stringify(next));
        } catch {
          // Hết quota / chế độ riêng tư: vẫn cho dùng trong phiên này
        }
        return next;
      });
    },
    [tableKey],
  );

  const reset = React.useCallback(() => {
    try {
      localStorage.removeItem(storageKey(tableKey));
    } catch {
      /* xem trên */
    }
    setState(EMPTY);
  }, [tableKey]);

  return [config, update, reset];
}
