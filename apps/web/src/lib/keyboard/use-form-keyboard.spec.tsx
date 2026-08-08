import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useFormKeyboard, GRID_CELL_ATTR } from './use-form-keyboard';

/**
 * Test TÍCH HỢP DOM cho profile bàn phím: resolve.spec.ts chứng minh LUẬT,
 * file này chứng minh luật đó thật sự điều khiển được focus/submit trong DOM.
 */
function GridForm({
  onSubmit,
  profile = 'data-entry' as const,
}: {
  onSubmit: () => void;
  profile?: 'data-entry' | 'standard';
}) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [rows, setRows] = React.useState(['0']);

  useFormKeyboard({
    profile,
    formRef,
    onSubmit,
    onAddRow: () => setRows((r) => [...r, String(r.length)]),
  });

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
      <input aria-label="Khách hàng" defaultValue="" />
      {rows.map((id, idx) => (
        <div key={id}>
          <input {...{ [GRID_CELL_ATTR]: '' }} aria-label={`SL dòng ${idx + 1}`} defaultValue="" />
          <input {...{ [GRID_CELL_ATTR]: '' }} aria-label={`Giá dòng ${idx + 1}`} defaultValue="" />
        </div>
      ))}
      <button type="submit">Lưu</button>
    </form>
  );
}

describe('useFormKeyboard — hành vi thật trong DOM', () => {
  it('data-entry: Enter giữa bảng chuyển ô, KHÔNG submit', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<GridForm onSubmit={onSubmit} />);

    const sl = screen.getByLabelText('SL dòng 1');
    sl.focus();
    await userEvent.keyboard('{Enter}');

    expect(document.activeElement).toBe(screen.getByLabelText('Giá dòng 1'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('data-entry: Enter ở ô CUỐI thêm dòng mới và nhảy vào — phản xạ Excel', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<GridForm onSubmit={onSubmit} />);

    screen.getByLabelText('Giá dòng 1').focus(); // ô cuối của dòng cuối
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByLabelText('SL dòng 2')).toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('SL dòng 2')));
    expect(onSubmit).not.toHaveBeenCalled(); // ĐÂY là bug đang sửa
  });

  it('data-entry: Ctrl+Enter mới submit', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<GridForm onSubmit={onSubmit} />);
    screen.getByLabelText('SL dòng 1').focus();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('Ctrl+S lưu ở mọi profile (§7)', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<GridForm onSubmit={onSubmit} profile="standard" />);
    screen.getByLabelText('Khách hàng').focus();
    await userEvent.keyboard('{Control>}s{/Control}');
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('standard: Enter submit ngay', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<GridForm onSubmit={onSubmit} profile="standard" />);
    screen.getByLabelText('Khách hàng').focus();
    await userEvent.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('Esc trong ô ĐANG SỬA trả giá trị cũ và KHÔNG submit/đóng', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<GridForm onSubmit={onSubmit} />);

    const cell = screen.getByLabelText('SL dòng 1') as HTMLInputElement;
    cell.focus();
    await userEvent.type(cell, '123');
    expect(cell.value).toBe('123');

    await userEvent.keyboard('{Escape}');
    expect(cell.value).toBe(''); // trả về giá trị lúc focus
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
