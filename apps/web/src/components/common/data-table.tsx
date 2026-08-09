'use client';

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnOrderState,
  type ColumnSizingState,
  type RowSelectionState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Pin,
  PinOff,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useProjectUI } from '@/design-system/use-project-ui';
import { cn } from '@/lib/utils';
import { useTableConfig, type TableConfig } from './use-table-config';

/**
 * [CORE] DataTable §5.5 + fe-preset-system §11 (GĐ A "DataTable đầy đủ"):
 * - sort/phân trang PHÍA SERVER, đồng bộ URL (caller giữ state qua nuqs §5.4)
 * - chọn dòng + chọn cả trang, thanh bulk do caller render
 * - sticky header, dòng tổng footer, ẩn/hiện cột
 * - **resize / ghim / đổi thứ tự cột**, lưu theo user (localStorage)
 * - 4 trạng thái: skeleton / empty có CTA / "không khớp bộ lọc" (KHÁC empty,
 *   có nút xoá lọc) / error có retry
 * - khôi phục vị trí cuộn khi quay lại (sessionStorage theo key)
 *
 * KHÔNG virtualization (fe-preset-system §11.2b): kiến trúc là phân trang phía
 * server với defaultPageSize 50. Render 50 dòng DOM không cần virtualization;
 * chỉ làm khi ĐO được vấn đề thật.
 *
 * Mọi kích thước lấy từ token derived (--table-row-h, --table-font-size,
 * --table-zebra) — đổi preset hoặc đổi density là bảng đổi mà không sửa file này.
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
  /** Chỗ cắm thanh saved views + bộ lọc, nằm cùng hàng với nút Cột */
  toolbarSlot?: React.ReactNode;
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
  toolbarSlot,
}: DataTableProps<TRow>) {
  const t = useTranslations('common');
  const ui = useProjectUI();
  const [config, setConfig, resetConfig] = useTableConfig(tableKey);

  // Ghim cột đầu là quyết định của preset (§4.4 stickyFirstColumn), nhưng user
  // ghim thêm/bỏ ghim được — lưu trong config. `undefined` = chưa động vào,
  // dùng mặc định của preset; mảng rỗng = user CỐ Ý bỏ ghim hết.
  const firstColumnId = columns[0] && columnIdOf(columns[0]);
  const stickyFirst = ui.behavior.table.stickyFirstColumn;
  const pinned = React.useMemo(
    () => config.pinned ?? (stickyFirst && firstColumnId ? [firstColumnId] : []),
    [config.pinned, stickyFirst, firstColumnId],
  );

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
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    state: {
      columnVisibility: config.visibility,
      columnOrder: config.order,
      columnSizing: config.sizes,
      rowSelection: rowSelection ?? {},
    },
    onColumnVisibilityChange: (u) =>
      setConfig((c) => ({ ...c, visibility: apply(u, c.visibility) })),
    onColumnOrderChange: (u) => setConfig((c) => ({ ...c, order: apply(u, c.order) })),
    onColumnSizingChange: (u) => setConfig((c) => ({ ...c, sizes: apply(u, c.sizes) })),
    onRowSelectionChange: (updater) => {
      if (!onRowSelectionChange) return;
      onRowSelectionChange(apply(updater, rowSelection ?? {}));
    },
    enableRowSelection: !!onRowSelectionChange,
  });

  const leafIds = table.getAllLeafColumns().map((c) => c.id);
  const visibleLeaf = table.getVisibleLeafColumns();

  /** Vị trí left của cột ghim — cộng dồn bề rộng các cột ghim trước nó */
  const pinOffset = React.useCallback(
    (columnId: string): number | undefined => {
      const idx = pinned.indexOf(columnId);
      if (idx < 0) return undefined;
      return pinned
        .slice(0, idx)
        .reduce((sum, id) => sum + (table.getColumn(id)?.getSize() ?? 0), 0);
    },
    [pinned, table],
  );

  const moveColumn = (columnId: string, delta: number) => {
    const order = config.order.length ? [...config.order] : [...leafIds];
    const from = order.indexOf(columnId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    order.splice(to, 0, ...order.splice(from, 1));
    setConfig((c) => ({ ...c, order }));
  };

  const togglePin = (columnId: string) => {
    setConfig((c) => {
      const current = c.pinned ?? pinned;
      return {
        ...c,
        pinned: current.includes(columnId)
          ? current.filter((id) => id !== columnId)
          : [...current, columnId],
      };
    });
  };

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

  // PHẢI gồm cả `state.limit` đang dùng: nếu giá trị hiện tại không có trong
  // danh sách, trình duyệt hiện tuỳ chọn ĐẦU TIÊN và người dùng đọc sai số bản
  // ghi mỗi trang. Xảy ra thật khi saved view lưu limit lạ hoặc preset đổi
  // defaultPageSize.
  const pageSizes = Array.from(
    new Set([10, 20, ui.behavior.table.defaultPageSize, 100, state.limit]),
  ).sort((a, b) => a - b);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {toolbarSlot}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto">
              <Columns3 /> Cột
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 overflow-auto">
            {table.getAllLeafColumns().map((c) => {
              const label = headerLabel(c.columnDef.header, c.id);
              return (
                <DropdownMenuItem
                  key={c.id}
                  className="flex items-center gap-2"
                  onSelect={(e) => e.preventDefault()}
                >
                  <label className="flex flex-1 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={c.getIsVisible()}
                      disabled={!c.getCanHide()}
                      onChange={() => c.toggleVisibility()}
                    />
                    {label}
                  </label>
                  {/* Bàn phím thay cho kéo-thả: kéo-thả KHÔNG tiếp cận được
                      bằng bàn phím, mà đổi thứ tự cột là chức năng thật (§8.4) */}
                  <button
                    type="button"
                    aria-label={`Chuyển ${label} sang trái`}
                    onClick={() => moveColumn(c.id, -1)}
                  >
                    <ArrowLeft className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Chuyển ${label} sang phải`}
                    onClick={() => moveColumn(c.id, 1)}
                  >
                    <ArrowRight className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={pinned.includes(c.id) ? `Bỏ ghim ${label}` : `Ghim ${label}`}
                    onClick={() => togglePin(c.id)}
                  >
                    {pinned.includes(c.id) ? (
                      <PinOff className="size-3.5" />
                    ) : (
                      <Pin className="size-3.5" />
                    )}
                  </button>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => resetConfig()}>
              <RotateCcw className="size-3.5" /> Khôi phục mặc định
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        ref={scrollRef}
        className="overflow-auto rounded-md border border-border"
        // Chiều cao khung cuộn là quyết định của preset (Executive thấy 8-10
        // dòng, Enterprise 28-32) → token tầng 3, không phải số trong .tsx
        style={{ maxHeight: 'var(--table-viewport-h)' }}
      >
        <table className="w-full" style={{ fontSize: 'var(--table-font-size)' }}>
          <thead
            className="sticky top-0 text-left"
            style={{ zIndex: 'var(--z-sticky)', background: 'var(--table-header-bg)' }}
          >
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const left = pinOffset(h.column.id);
                  return (
                    <th
                      key={h.id}
                      data-pinned={left !== undefined ? 'true' : undefined}
                      className={cn(
                        'relative whitespace-nowrap px-3 py-2 font-medium',
                        sortable.includes(h.column.id) && 'cursor-pointer select-none',
                        left !== undefined && 'sticky',
                      )}
                      style={{
                        width: h.getSize(),
                        left,
                        // Cột ghim phải có nền riêng, nếu không thì nội dung cột
                        // bên dưới trượt qua và đọc chồng lên nhau
                        background: left !== undefined ? 'var(--table-header-bg)' : undefined,
                        zIndex: left !== undefined ? 'var(--z-sticky)' : undefined,
                      }}
                      onClick={() => toggleSort(h.column.id)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {h.isPlaceholder
                          ? null
                          : flexRender(h.column.columnDef.header, h.getContext())}
                        {sortIcon(h.column.id)}
                      </span>
                      {h.column.getCanResize() && (
                        <ResizeHandle
                          label={headerLabel(h.column.columnDef.header, h.column.id)}
                          size={h.getSize()}
                          onResizeStart={h.getResizeHandler()}
                          onNudge={(d) =>
                            setConfig((c) => ({
                              ...c,
                              sizes: { ...c.sizes, [h.column.id]: Math.max(48, h.getSize() + d) },
                            }))
                          }
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {status === 'pending' &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr
                  key={`sk-${i}`}
                  className="border-t border-border"
                  style={{ height: 'var(--table-row-h)' }}
                >
                  {visibleLeaf.map((c) => (
                    <td key={c.id} className="px-3">
                      <div className="h-4 animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))}

            {status === 'error' && (
              <tr>
                <td colSpan={visibleLeaf.length} className="px-3 py-10 text-center">
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
                  colSpan={visibleLeaf.length}
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
              table.getRowModel().rows.map((row, i) => {
                const tr = (
                  <tr
                    key={row.id}
                    className={cn('border-t border-border', row.getIsSelected() && 'font-medium')}
                    style={{
                      height: 'var(--table-row-h)',
                      background: row.getIsSelected()
                        ? 'var(--table-row-selected)'
                        : i % 2 === 1
                          ? 'var(--table-zebra)'
                          : undefined,
                    }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const left = pinOffset(cell.column.id);
                      return (
                        <td
                          key={cell.id}
                          className={cn('px-3', left !== undefined && 'sticky')}
                          style={{
                            left,
                            background: left !== undefined ? 'var(--surface-raised)' : undefined,
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
                return renderRowWrapper ? (
                  <React.Fragment key={row.id}>{renderRowWrapper(row.original, tr)}</React.Fragment>
                ) : (
                  tr
                );
              })}
          </tbody>

          {summary && status === 'success' && rows.length > 0 && (
            <tfoot
              className="sticky bottom-0 border-t border-border font-medium"
              style={{ background: 'var(--table-header-bg)' }}
            >
              <tr>
                {visibleLeaf.map((c) => (
                  <td key={c.id} className="tnum px-3 py-2">
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
              aria-label="Số bản ghi mỗi trang"
              className="rounded-md border border-input bg-transparent px-2"
              style={{ height: 'var(--input-h)' }}
              value={state.limit}
              onChange={(e) => onStateChange({ limit: Number(e.target.value), page: 1 })}
            >
              {pageSizes.map((n) => (
                <option key={n} value={n}>
                  {n}/trang
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              aria-label="Trang trước"
              disabled={state.page <= 1}
              onClick={() => onStateChange({ page: state.page - 1 })}
            >
              ←
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label="Trang sau"
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

/**
 * Tay nắm resize. Chuột kéo qua handler của TanStack; bàn phím dùng mũi tên
 * trái/phải — cột hẹp quá đọc mất chữ, mà chuột không phải ai cũng dùng được.
 */
function ResizeHandle({
  label,
  size,
  onResizeStart,
  onNudge,
}: {
  label: string;
  size: number;
  onResizeStart: (e: React.MouseEvent | React.TouchEvent) => void;
  onNudge: (delta: number) => void;
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Đổi bề rộng cột ${label}`}
      aria-valuenow={Math.round(size)}
      tabIndex={0}
      className="absolute top-0 right-0 h-full w-1 cursor-col-resize touch-none select-none hover:bg-border"
      onMouseDown={onResizeStart}
      onTouchStart={onResizeStart}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        e.stopPropagation();
        onNudge(e.key === 'ArrowLeft' ? -16 : 16);
      }}
    />
  );
}

function headerLabel(header: unknown, fallback: string): string {
  return typeof header === 'string' ? header : fallback;
}

function columnIdOf<TRow>(col: ColumnDef<TRow, unknown>): string | undefined {
  return col.id ?? ('accessorKey' in col ? String(col.accessorKey) : undefined);
}

/** TanStack truyền updater dạng giá trị HOẶC hàm — gom về một chỗ */
function apply<T>(updater: T | ((old: T) => T), old: T): T {
  return typeof updater === 'function' ? (updater as (o: T) => T)(old) : updater;
}

export type { TableConfig, ColumnOrderState, ColumnSizingState, VisibilityState };
