import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders, screen, userEvent, act } from '@/test/render';
import { FilterBar } from './filter-bar';

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe('FilterBar (§5.5)', () => {
  it('gõ nhiều ký tự chỉ gọi search MỘT lần sau khi ngừng gõ', async () => {
    // Gõ 12 ký tự mà bắn 12 request là cách nhanh nhất làm chậm cả bảng.
    const onSearchChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<FilterBar search="" onSearchChange={onSearchChange} />);

    await user.type(screen.getByRole('searchbox'), 'bút bi');
    expect(onSearchChange).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith('bút bi');
  });

  it('Enter tìm NGAY, không chờ debounce (profile search, §7)', async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<FilterBar search="" onSearchChange={onSearchChange} />);

    await user.type(screen.getByRole('searchbox'), 'x{Enter}');
    expect(onSearchChange).toHaveBeenCalledWith('x');
  });

  it('bộ lọc đang bật hiện thành chip có nút xoá riêng', async () => {
    // Bộ lọc giấu trong panel đóng là nguồn của "sao đơn của tôi biến mất".
    const onRemove = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(
      <FilterBar
        search=""
        onSearchChange={vi.fn()}
        chips={[{ id: 'status', label: 'Trạng thái', value: 'Chờ duyệt', onRemove }]}
      />,
    );

    expect(screen.getByText('Chờ duyệt')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bỏ lọc Trạng thái' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('không có chip thì không hiện dòng "Đang lọc"', () => {
    renderWithProviders(<FilterBar search="" onSearchChange={vi.fn()} />);
    expect(screen.queryByText('Đang lọc:')).toBeNull();
  });

  it('search đổi từ BÊN NGOÀI (áp saved view, back/forward) thì ô nhập đồng bộ theo', () => {
    const { rerender } = renderWithProviders(
      <FilterBar search="cũ" onSearchChange={vi.fn()} />,
    );
    expect(screen.getByRole('searchbox')).toHaveValue('cũ');

    rerender(<FilterBar search="mới" onSearchChange={vi.fn()} />);
    expect(screen.getByRole('searchbox')).toHaveValue('mới');
  });
});
