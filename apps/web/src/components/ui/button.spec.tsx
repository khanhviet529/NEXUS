import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/render';
import { Button } from './button';

/** TẦNG 2 (mẫu) — component + tương tác thật qua RTL/user-event */
describe('Button — tầng 2: component', () => {
  it('bấm được và gọi onClick', async () => {
    const onClick = vi.fn();
    renderWithProviders(<Button onClick={onClick}>Lưu</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('disabled thì KHÔNG gọi onClick (nút mờ phải thật sự chặn)', async () => {
    const onClick = vi.fn();
    renderWithProviders(
      <Button disabled onClick={onClick}>
        Duyệt
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
