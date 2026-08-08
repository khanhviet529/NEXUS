'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  resolveKeyAction,
  shouldPreventDefault,
  shouldStopPropagation,
  type KeyboardProfile,
  type KeyTargetKind,
} from './resolve';

/** Ô trong bảng dòng chứng từ đánh dấu bằng thuộc tính này để hook tìm được */
export const GRID_CELL_ATTR = 'data-grid-cell';

function targetKindOf(el: Element | null): KeyTargetKind {
  if (!el) return 'other';
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') return 'select';
  if (tag === 'button') return 'button';
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type;
    return type === 'checkbox' || type === 'radio' || type === 'button' || type === 'submit'
      ? 'button'
      : 'text-input';
  }
  return 'other';
}

/**
 * Nối profile bàn phím vào một form (§5.8).
 *
 * data-entry: Enter đi ô kế trong bảng dòng, ở ô cuối thì THÊM DÒNG rồi nhảy
 * vào — đúng phản xạ Excel của người nhập liệu; Ctrl/Cmd+Enter mới submit;
 * Esc huỷ giá trị ô đang sửa và KHÔNG đóng dialog.
 *
 * Bắt ở pha CAPTURE để chặn được trước khi Radix Dialog nghe thấy Escape.
 */
export function useFormKeyboard(opts: {
  profile: KeyboardProfile;
  formRef: RefObject<HTMLFormElement | null>;
  onSubmit: () => void;
  /** data-entry: gọi khi Enter ở ô cuối — caller thêm dòng mới */
  onAddRow?: () => void;
  /** data-entry: trả giá trị ô về trước khi sửa */
  onCancelCell?: (cell: HTMLElement) => void;
}): void {
  const { profile, formRef, onSubmit, onAddRow, onCancelCell } = opts;
  // Giữ giá trị lúc focus để Esc trả lại được
  const cellValueOnFocus = useRef<{ el: HTMLElement; value: string } | null>(null);

  const cells = useCallback((): HTMLElement[] => {
    const form = formRef.current;
    if (!form) return [];
    // KHÔNG dùng offsetParent để đoán "đang hiển thị": jsdom không có layout
    // nên luôn trả null → danh sách ô rỗng và mọi điều hướng chết lặng.
    // Ô nằm trong form đã render thì mặc định là dùng được; chỉ loại ô bị
    // vô hiệu hoá hoặc ẩn tường minh.
    return Array.from(form.querySelectorAll<HTMLElement>(`[${GRID_CELL_ATTR}]`)).filter(
      (el) => !el.hasAttribute('disabled') && !el.hidden,
    );
  }, [formRef]);

  const focusRelative = useCallback(
    (offset: number) => {
      const list = cells();
      const idx = list.indexOf(document.activeElement as HTMLElement);
      const next = list[idx + offset];
      if (next) {
        next.focus();
        if (next instanceof HTMLInputElement) next.select();
      }
    },
    [cells],
  );

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (el?.hasAttribute?.(GRID_CELL_ATTR) && el instanceof HTMLInputElement) {
        cellValueOnFocus.current = { el, value: el.value };
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const list = cells();
      const inGrid = !!(active as HTMLElement)?.hasAttribute?.(GRID_CELL_ATTR);
      const idx = list.indexOf(active as HTMLElement);
      const snapshot = cellValueOnFocus.current;

      const action = resolveKeyAction(profile, {
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        target: targetKindOf(active),
        inGrid,
        isLastCell: inGrid && idx === list.length - 1,
        isDirtyCell:
          inGrid &&
          active instanceof HTMLInputElement &&
          snapshot?.el === active &&
          snapshot.value !== active.value,
      });

      if (shouldPreventDefault(action)) e.preventDefault();
      if (shouldStopPropagation(action)) e.stopPropagation();

      switch (action.type) {
        case 'submit':
          onSubmit();
          break;
        case 'next-cell':
          focusRelative(1);
          break;
        case 'prev-cell':
          focusRelative(-1);
          break;
        case 'add-row-and-focus': {
          const before = list.length;
          onAddRow?.();
          // Dòng mới render ở tick sau — chờ rồi mới focus ô đầu dòng đó
          requestAnimationFrame(() => {
            const after = cells();
            if (after.length > before) after[before]?.focus();
          });
          break;
        }
        case 'cancel-cell': {
          if (active instanceof HTMLInputElement && snapshot?.el === active) {
            // Trả giá trị cũ qua setter gốc để React nhận được onChange
            const setter = Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              'value',
            )?.set;
            setter?.call(active, snapshot.value);
            active.dispatchEvent(new Event('input', { bubbles: true }));
            onCancelCell?.(active);
          }
          break;
        }
        default:
          break;
      }
    };

    form.addEventListener('focusin', onFocusIn);
    form.addEventListener('keydown', onKeyDown, true); // capture: chặn trước Dialog
    return () => {
      form.removeEventListener('focusin', onFocusIn);
      form.removeEventListener('keydown', onKeyDown, true);
    };
  }, [profile, formRef, onSubmit, onAddRow, onCancelCell, cells, focusRelative]);
}
