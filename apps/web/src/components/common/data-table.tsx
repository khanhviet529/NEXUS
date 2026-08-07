'use client';

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * [CORE] DataTable §5.5 — phần BẮT BUỘC:
 * - sort/phân trang PHÍA SERVER, đồng bộ URL (caller giữ state qua nuqs §5.4)
 * - chọn dòng + chọn cả trang, thanh bulk do caller render
 * - sticky header, dòng tổng footer, ẩn/hiện cột
 * - 4 trạng thái: skeleton / empty có CTA / "không khớp bộ lọc" (KHÁC empty,
 *   có nút xoá lọc) / error có retry
 * - khôi phục vị trí cuộn khi quay lại (sessionStorage theo key)
 * Nợ (ghi progress.md): resize/ghim/kéo thứ tự cột, virtualization, saved views UI.
 */

export interface DataTableState {
  page: number;
  limit: number;
  /** '-createdAt' = desc (khớp SortParser BE) */
  sort?: string;
}

export interface DataTableMeta {
  page: number;
  totalPages: number;
  total: number;
  hasNext: boolean;
}

interface DataTableProps<TRow> {
  tableKey: string; // key lưu scroll + cấu hình cột
  columns: ColumnDef<TRow, unknown>[];
  rows: TRow[];
  meta?: DataTableMeta;
  state: DataTableState;
  onStateChange: (patch: Partial<DataTableState>) => void;
  status: 'pending' | 'error' | 'success';
  onRetry?: () => void;
  /** Đang có bộ lọc/từ khoá? → trạng thái "không khớp bộ lọc" thay vì empty */
  isFiltered?: boolean;
  onClearFilters?: () => void;
  emptyCta?: React.ReactNode;
  /** Cột nào sort được (whitelist khớp BE §3.4) */
  sortable?: string[];
  getRowId: (row: TRow) => string;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (s: RowSelectionState) => void;
  /** Dòng tổng cộng footer (§5.5) — map cột id → nội dung */
  summary?: Record<string, React.ReactNode>;
  renderRowWrapper?: (row: TRow, children: React.ReactNode) => React.ReactNode;
}

export function DataTable<TRow>({
  tableKey,
  columns,
  rows,
  meta,
  state,
  onStateChange,
  status,
  onRetry,
  isFiltered,
  onClearFilters,
  emptyCta,
  sortable = [],
  getRowId,
  rowSelection,
  onRowSelectionChange,
  summary,
  renderRowWrapper,
}: DataTableProps<TRow>) {
  const t = useTranslations('common');
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem(`dt-cols:${tableKey}`) ?? '{}') as VisibilityState;
    } catch {
      return {};
    }
  });

  // Ẩn/hiện cột lưu THEO USER (localStorage — saved_views server-side là OPT §5.5)
  React.useEffect(() => {
    localStorage.setItem(`dt-cols:${tableKey}`, JSON.stringify(columnVisibility));
  }, [tableKey, columnVisibility]);

  // Khôi phục vị trí cuộn khi quay lại từ trang chi tiết (§5.5)
  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || status !== 'success') return;
    const saved = sessionStorage.getItem(`dt-scroll:${tableKey}`);
    if (saved) el.scrollTop = Number(saved);
    const onScroll = () => sessionStorage.setItem(`dt-scroll:${tableKey}`, String(el.scrollTop));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [tableKey, status]);

  const table = useReactTable({
    data: rows,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    state: { columnVisibility, rowSelection: rowSelection ?? {} },
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: (updater) => {
      if (!onRowSelectionChange) return;
      const next = typeof updater === 'function' ? updater(rowSelection ?? {}) : updater;
      onRowSelectionChange(next);
    },
    enableRowSelection: !!onRowSelectionChange,
  });

  const currentSort = state.sort ?? '';
  const toggleSort = (columnId: string) => {
    if (!sortable.includes(columnId)) return;
    const next =
      currentSort === columnId ? `-${columnId}` : currentSort === `-${columnId}` ? '' : columnId;
    onStateChange({ sort: next || undefined, page: 1 });
  };
  const sortIcon = (columnId: string) => {
    if (!sortable.includes(columnId)) return null;
    if (currentSort === columnId) return <ArrowUp className="size-3.5" />;
    if (currentSort === `-${columnId}`) return <ArrowDown className="size-3.5" />;
    return <ArrowUpDown className="size-3.5 opacity-40" />;
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 /> Cột
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllLeafColumns()
              .filter((c) => c.getCanHide())
              .map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    c.toggleVisibility();
                  }}
                >
                  <input type="checkbox" readOnly checked={c.getIsVisible()} />
                  {typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        ref={scrollRef}
        className="max-h-[70vh] overflow-auto rounded-md border border-border"
      >
        <table className="w-full text-sm">
          <thead
            className="sticky top-0 bg-muted text-left"
            style={{ zIndex: 'var(--z-sticky)' as never }}
          >
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className={cn(
                      'whitespace-nowrap px-3 py-2 font-medium',
                      sortable.includes(h.column.id) && 'cursor-pointer select-none',
                    )}
                    onClick={() => toggleSort(h.column.id)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                      {sortIcon(h.column.id)}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {status === 'pending' &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-t border-border">
                  {table.getVisibleLeafColumns().map((c) => (
                    <td key={c.id} className="px-3 py-2.5">
                      <div className="h-4 animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))}

            {status === 'error' && (
              <tr>
                <td
                  colSpan={table.getVisibleLeafColumns().length}
                  className="px-3 py-10 text-center"
                >
                  <p className="mb-3 text-muted-foreground">{t('error')}</p>
                  <Button variant="outline" size="sm" onClick={onRetry}>
                    <RotateCw /> Thử lại
                  </Button>
                </td>
              </tr>
            )}

            {status === 'success' && rows.length === 0 && (
              <tr>
                <td
                  colSpan={table.getVisibleLeafColumns().length}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  {isFiltered ? (
                    // "Không khớp bộ lọc" KHÁC empty (§5.5) — có nút xoá lọc
                    <>
                      <p className="mb-3">Không có kết quả khớp bộ lọc</p>
                      <Button variant="outline" size="sm" onClick={onClearFilters}>
                        Xoá bộ lọc
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="mb-3">{t('noResults')}</p>
                      {emptyCta}
                    </>
                  )}
                </td>
              </tr>
            )}

            {status === 'success' &&
              table.getRowModel().rows.map((row) => {
                const tr = (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-t border-border hover:bg-accent/50',
                      row.getIsSelected() && 'bg-accent/70',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
                return renderRowWrapper ? (
                  <React.Fragment key={row.id}>
                    {renderRowWrapper(row.original, tr)}
                  </React.Fragment>
                ) : (
                  tr
                );
              })}
          </tbody>

          {summary && status === 'success' && rows.length > 0 && (
            <tfoot className="sticky bottom-0 border-t border-border bg-muted font-medium">
              <tr>
                {table.getVisibleLeafColumns().map((c) => (
                  <td key={c.id} className="px-3 py-2 tnum">
                    {summary[c.id] ?? null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {meta && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Trang {meta.page}/{Math.max(meta.totalPages, 1)} · {meta.total} bản ghi
          </span>
          <span className="flex items-center gap-2">
            <select
              className="h-8 rounded-md border border-input bg-transparent px-2"
              value={state.limit}
              onChange={(e) => onStateChange({ limit: Number(e.target.value), page: 1 })}
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}/trang
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={state.page <= 1}
              onClick={() => onStateChange({ page: state.page - 1 })}
            >
              ←
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!meta.hasNext}
              onClick={() => onStateChange({ page: state.page + 1 })}
            >
              →
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}
