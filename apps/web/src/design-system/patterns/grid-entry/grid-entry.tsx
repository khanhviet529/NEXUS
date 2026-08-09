'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * [CORE] GridEntry — FormLayout `grid-entry` (fe-preset-system §6, §11 GĐ A).
 *
 * ⚠ Đây là FormLayout, KHÔNG phải page pattern. Đơn hàng là
 * `pagePattern: 'list-detail'` + `formLayout: 'grid-entry'`. File nằm ở
 * patterns/grid-entry/ cho gọn thư mục, nhưng mô hình là FormLayout.
 *
 * Phạm vi cố ý HẸP: nó chỉ dựng khung bảng (header, dòng, nút xoá dòng, nút
 * thêm dòng, dòng tổng) và đánh dấu ô để bàn phím `data-entry` nhảy đúng thứ
 * tự. Ô nhập do caller render — không trừu tượng hoá schema, không đoán kiểu
 * dữ liệu. CLAUDE.md §1.2 cấm `BaseCrudService<T>`; một generic
 * "GridEntry<TSchema>" tự sinh input cũng là cùng một cái bẫy.
 *
 * Bàn phím do `useFormKeyboard({ profile: 'data-entry' })` ở form cha lo:
 * Enter đi ô kế, ở ô cuối thì gọi `onAddRow`. GridEntry chỉ bảo đảm các ô
 * mang `data-grid-cell` — xem lib/keyboard/use-form-keyboard.ts.
 */
export interface GridColumn {
  id: string;
  header: React.ReactNode;
  /** Lớp tiện ích cho bề rộng/căn lề của CỘT, áp cho cả th lẫn td */
  className?: string;
  /**
   * Đặt `data-type` lên <td>. KHÔNG phải trang trí: globals.css bật
   * `font-variant-numeric: tabular-nums` cho `td[data-type='money'|'number']`
   * (§5.10) — thiếu nó thì cột số nhảy bề rộng theo từng chữ số.
   */
  dataType?: 'money' | 'number';
}

export interface GridRow {
  key: string;
  cells: React.ReactNode[];
  /** Lỗi cấp dòng — hiện dưới dòng, không đẩy cột lệch */
  error?: React.ReactNode;
}

export function GridEntry({
  columns,
  rows,
  onAddRow,
  onRemoveRow,
  addLabel = 'Thêm dòng',
  footer,
  caption,
}: {
  columns: GridColumn[];
  rows: GridRow[];
  onAddRow: () => void;
  /** Không truyền = không cho xoá dòng (bảng chỉ đọc) */
  onRemoveRow?: (index: number) => void;
  addLabel?: string;
  /** Dòng tổng — nội dung theo cột, caller tự dựng */
  footer?: React.ReactNode;
  caption?: string;
}) {
  const canRemove = !!onRemoveRow && rows.length > 1;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full" style={{ fontSize: 'var(--table-font-size)' }}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="text-left" style={{ background: 'var(--table-header-bg)' }}>
            <tr>
              {columns.map((c) => (
                <th key={c.id} scope="col" className={cn('px-2 py-2 font-medium', c.className)}>
                  {c.header}
                </th>
              ))}
              {onRemoveRow && <th className="w-10 px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <React.Fragment key={row.key}>
                <tr className="border-t border-border align-top">
                  {columns.map((c, i) => (
                    <td
                      key={c.id}
                      data-type={c.dataType}
                      className={cn('px-2 py-1.5', c.className)}
                    >
                      {row.cells[i]}
                    </td>
                  ))}
                  {onRemoveRow && (
                    <td className="px-2 py-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        // Nhãn có SỐ DÒNG: mười nút "Xoá dòng" giống hệt nhau
                        // thì người dùng trình đọc màn hình không biết xoá cái nào
                        aria-label={`Xoá dòng ${idx + 1}`}
                        disabled={!canRemove}
                        onClick={() => onRemoveRow(idx)}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </td>
                  )}
                </tr>
                {row.error && (
                  <tr>
                    <td
                      colSpan={columns.length + (onRemoveRow ? 1 : 0)}
                      className="px-2 pb-1.5 text-xs text-destructive"
                    >
                      {row.error}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
          {footer}
        </table>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={onAddRow}>
        <Plus /> {addLabel}
      </Button>
    </div>
  );
}
