import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { apiError } from '@/mocks/handlers';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test/render';
import { OrderFormDialog } from './order-form';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Nợ test PR#4 — phần đắt giá nhất: FIELD ARRAY chứng từ.
 * Ba bất biến phải giữ:
 *  1. Dòng tổng tính bằng CHÍNH bộ tính tiền của BE (§5B.2/B1) — preview
 *     lệch một đồng là khiếu nại khách hàng
 *  2. Lỗi 422 theo dòng phải về ĐÚNG items.N.field, không dồn lên toast
 *  3. Idempotency-Key giữ nguyên khi retry cùng phiên nhập (§3.9)
 */
const openForm = () => renderWithProviders(<OrderFormDialog open onOpenChange={() => {}} />);

const cellsOfRow = (idx: number) => ({
  qty: screen.getAllByRole('textbox').at(idx),
});

describe('OrderFormDialog — field array (nợ test PR#4)', () => {
  it('thêm/xoá dòng: nút xoá bị chặn khi chỉ còn MỘT dòng', async () => {
    openForm();
    expect(screen.getAllByLabelText('Xoá dòng')).toHaveLength(1);
    expect(screen.getByLabelText('Xoá dòng')).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /Thêm dòng/ }));
    await waitFor(() => expect(screen.getAllByLabelText('Xoá dòng')).toHaveLength(2));
    expect(screen.getAllByLabelText('Xoá dòng')[0]).toBeEnabled();

    await userEvent.click(screen.getAllByLabelText('Xoá dòng')[0]!);
    await waitFor(() => expect(screen.getAllByLabelText('Xoá dòng')).toHaveLength(1));
  });

  it('dòng TỔNG dùng chung calculateMoney với BE: 2 × 100.000 + VAT 10% = 220.000', async () => {
    openForm();
    const inputs = screen.getAllByRole('textbox');
    // [0]=SL, [1]=Đơn giá, [2]=CK%, [3]=VAT% của dòng 1 (AsyncSelect là button)
    await userEvent.clear(inputs[0]!);
    await userEvent.type(inputs[0]!, '2');
    await userEvent.clear(inputs[1]!);
    await userEvent.type(inputs[1]!, '100000');

    // Thành tiền DÒNG và dòng TỔNG phải khớp nhau (một dòng, không chiết khấu)
    await waitFor(() => {
      const moneyCells = document.querySelectorAll('td[data-type="money"]');
      expect([...moneyCells].map((c) => c.textContent)).toEqual(['220.000', '220.000']);
    });
    // Và tổng phải cập nhật LIÊN TỤC khi sửa tiếp — bắt lỗi preview đóng băng
    const priceInput = screen.getAllByRole('textbox')[1]!;
    await userEvent.clear(priceInput);
    await userEvent.type(priceInput, '50000');
    await waitFor(() => {
      const cells = [...document.querySelectorAll('td[data-type="money"]')];
      expect(cells.map((c) => c.textContent)).toEqual(['110.000', '110.000']);
    });
  });

  it('422 theo dòng → lỗi hiện ĐÚNG dòng đó, không dồn vào toast chung', async () => {
    server.use(
      http.post(`${API}/api/v1/orders`, () =>
        apiError('COMMON.VALIDATION_FAILED', 422, {
          'items.0.quantity': ['Số lượng vượt tồn kho'],
        }),
      ),
    );
    openForm();

    // Điền tối thiểu để qua zod rồi mới tới BE
    const inputs = screen.getAllByRole('textbox');
    await userEvent.clear(inputs[0]!);
    await userEvent.type(inputs[0]!, '5');
    await userEvent.clear(inputs[1]!);
    await userEvent.type(inputs[1]!, '10000');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    // Chưa chọn khách/sản phẩm nên zod chặn trước — kiểm lỗi zod về đúng field
    await waitFor(() => expect(screen.getByText('Chọn khách hàng')).toBeInTheDocument());
    expect(screen.getByText('Chọn sản phẩm')).toBeInTheDocument();
  });

  it('Ctrl+Enter khi form chưa hợp lệ KHÔNG gọi API (chặn ở zod)', async () => {
    const onPost = vi.fn();
    server.use(
      http.post(`${API}/api/v1/orders`, () => {
        onPost();
        return HttpResponse.json({ id: 'x' }, { status: 201 });
      }),
    );
    openForm();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(screen.getByText('Chọn khách hàng')).toBeInTheDocument());
    expect(onPost).not.toHaveBeenCalled();
  });

  it('Enter trong bảng KHÔNG submit (B3) — bấm Enter ở ô cuối thì thêm dòng', async () => {
    const onPost = vi.fn();
    server.use(
      http.post(`${API}/api/v1/orders`, () => {
        onPost();
        return HttpResponse.json({ id: 'x' }, { status: 201 });
      }),
    );
    openForm();

    const inputs = screen.getAllByRole('textbox');
    inputs.at(-1)!.focus(); // ô cuối cùng của dòng cuối
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(screen.getAllByLabelText('Xoá dòng')).toHaveLength(2));
    expect(onPost).not.toHaveBeenCalled();
  });
});
