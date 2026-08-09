import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { renderWithProviders, screen, userEvent } from '@/test/render';
import { MoneyInput } from './money-input';

/**
 * Nợ test PR#4. Luật §3.7: tiền là CHUỖI decimal — phân cách nghìn CHỈ là
 * lớp hiển thị. Sai chỗ này thì số tiền gửi lên BE sai, không phải lỗi giao diện.
 */
function Controlled({ initial = '', onRaw }: { initial?: string; onRaw?: (v: string) => void }) {
  const [v, setV] = React.useState(initial);
  return (
    <MoneyInput
      aria-label="Đơn giá"
      value={v}
      onChange={(raw) => {
        setV(raw);
        onRaw?.(raw);
      }}
    />
  );
}

describe('MoneyInput — nợ test PR#4', () => {
  it('KHÔNG focus: hiển thị có phân cách nghìn', () => {
    renderWithProviders(<Controlled initial="1234567" />);
    expect(screen.getByLabelText<HTMLInputElement>('Đơn giá').value).toBe('1.234.567');
  });

  it('KHI focus: hiện giá trị THÔ để gõ tiếp, không phải chuỗi có dấu chấm', async () => {
    renderWithProviders(<Controlled initial="1234567" />);
    const input = screen.getByLabelText<HTMLInputElement>('Đơn giá');
    await userEvent.click(input);
    expect(input.value).toBe('1234567');
  });

  it('giá trị TRUYỀN RA luôn là chuỗi decimal chuẩn cho BE (§3.7)', async () => {
    const onRaw = vi.fn();
    renderWithProviders(<Controlled onRaw={onRaw} />);
    const input = screen.getByLabelText('Đơn giá');
    await userEvent.click(input);
    await userEvent.type(input, '1.234.567,5');
    expect(onRaw).toHaveBeenLastCalledWith('1234567.5');
  });

  it('lọc ký tự rác, không sinh NaN', async () => {
    const onRaw = vi.fn();
    renderWithProviders(<Controlled onRaw={onRaw} />);
    const input = screen.getByLabelText('Đơn giá');
    await userEvent.click(input);
    await userEvent.type(input, '12abc3');
    expect(onRaw).toHaveBeenLastCalledWith('123');
  });

  it('nhận data-attr để hook bàn phím nhận diện ô lưới (B3)', () => {
    renderWithProviders(
      <MoneyInput aria-label="SL" value="1" onChange={() => {}} {...{ 'data-grid-cell': '' }} />,
    );
    expect(screen.getByLabelText('SL')).toHaveAttribute('data-grid-cell');
  });
});
