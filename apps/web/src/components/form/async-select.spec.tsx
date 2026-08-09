import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { AsyncSelect, type AsyncSelectOption } from './async-select';

/**
 * Nợ test PR#4. Điểm cốt lõi: LỌC Ở SERVER và phân trang — không kéo cả danh
 * mục về client (cùng lý do §4.4 với lọc trong query, và danh mục thật có
 * hàng nghìn dòng).
 */
const page = (items: AsyncSelectOption[], hasNext = false) => ({ items, hasNext });

describe('AsyncSelect — nợ test PR#4', () => {
  it('mở dialog → gọi fetchPage trang 1 và render kết quả', async () => {
    const fetchPage = vi.fn().mockResolvedValue(
      page([{ value: 'c1', label: 'Công ty A', hint: 'KH001' }]),
    );
    renderWithProviders(
      <AsyncSelect value={null} onChange={() => {}} fetchPage={fetchPage} placeholder="Chọn KH…" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Chọn KH…' }));
    await waitFor(() => expect(screen.getByText('Công ty A')).toBeInTheDocument());
    expect(fetchPage).toHaveBeenCalledWith('', 1);
  });

  it('gõ tìm kiếm → gọi LẠI server với từ khoá (không lọc phía client)', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page([]));
    renderWithProviders(
      <AsyncSelect value={null} onChange={() => {}} fetchPage={fetchPage} placeholder="Chọn…" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Chọn…' }));
    await userEvent.type(screen.getByPlaceholderText('Gõ để tìm…'), 'cong ty');
    await waitFor(() => expect(fetchPage).toHaveBeenCalledWith('cong ty', 1), { timeout: 2000 });
  });

  it('"Tải thêm" gọi TRANG KẾ và CỘNG DỒN, không thay thế', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([{ value: 'a', label: 'Mục A' }], true))
      .mockResolvedValueOnce(page([{ value: 'b', label: 'Mục B' }], false));
    renderWithProviders(
      <AsyncSelect value={null} onChange={() => {}} fetchPage={fetchPage} placeholder="Chọn…" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Chọn…' }));
    await waitFor(() => expect(screen.getByText('Mục A')).toBeInTheDocument());

    await userEvent.click(screen.getByText('Tải thêm…'));
    await waitFor(() => expect(screen.getByText('Mục B')).toBeInTheDocument());
    expect(screen.getByText('Mục A')).toBeInTheDocument(); // cộng dồn
    expect(fetchPage).toHaveBeenLastCalledWith('', 2);
  });

  it('chọn một mục → trả option ĐẦY ĐỦ (value + label) và đóng dialog', async () => {
    const onChange = vi.fn();
    const opt = { value: 'c1', label: 'Công ty A', hint: 'KH001' };
    renderWithProviders(
      <AsyncSelect
        value={null}
        onChange={onChange}
        fetchPage={vi.fn().mockResolvedValue(page([opt]))}
        placeholder="Chọn…"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Chọn…' }));
    await waitFor(() => expect(screen.getByText('Công ty A')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Công ty A'));

    expect(onChange).toHaveBeenCalledWith(opt); // caller cần cả label để hiển thị
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Gõ để tìm…')).not.toBeInTheDocument(),
    );
  });

  it('đã chọn: nút hiện NHÃN, không hiện id thô', () => {
    renderWithProviders(
      <AsyncSelect
        value="c1"
        valueLabel="KH001 · Công ty A"
        onChange={() => {}}
        fetchPage={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'KH001 · Công ty A' })).toBeInTheDocument();
  });

  it('không có kết quả → báo rõ, không im lặng', async () => {
    renderWithProviders(
      <AsyncSelect
        value={null}
        onChange={() => {}}
        fetchPage={vi.fn().mockResolvedValue(page([]))}
        placeholder="Chọn…"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Chọn…' }));
    await waitFor(() => expect(screen.getByText('Không có kết quả')).toBeInTheDocument());
  });

  it('disabled → không mở được dialog', async () => {
    const fetchPage = vi.fn();
    renderWithProviders(
      <AsyncSelect value={null} onChange={() => {}} fetchPage={fetchPage} disabled placeholder="Chọn…" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Chọn…' }));
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
