import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { ImportDialog } from './import-dialog';

const post = vi.fn();
const get = vi.fn();
vi.mock('@nexus/api-client', () => ({
  apiAxios: {
    post: (...a: unknown[]) => post(...a),
    get: (...a: unknown[]) => get(...a),
  },
}));

/**
 * Câu tổng kết bị <strong> cắt thành nhiều node nên getByText chuỗi thẳng
 * không khớp — tra theo textContent của cả đoạn.
 */
const summaryText = (re: RegExp) => (_: string, el: Element | null) =>
  el?.tagName === 'P' && re.test(el.textContent ?? '');

/** jsdom không có File.text() trong mọi phiên bản — dựng file có text() thật */
function csvFile(content: string, name = 'products.csv'): File {
  const file = new File([content], name, { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) });
  return file;
}

async function pickFile(content: string) {
  const user = userEvent.setup();
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, csvFile(content));
  return user;
}

beforeEach(() => {
  post.mockReset();
  get.mockReset();
});

describe('ImportDialog (§4.7)', () => {
  it('KHÔNG chạy import ngay khi chọn file — bắt buộc qua bước xem trước', async () => {
    // "Chọn file xong chạy luôn" nghĩa là người dùng phát hiện nhầm cột sau khi
    // 5.000 dòng đã ghi vào kho.
    renderWithProviders(
      <ImportDialog open onOpenChange={vi.fn()} entityLabel="sản phẩm" endpoint="/x/import" />,
    );
    await pickFile('code,name\nSP-1,Bút\nSP-2,Vở');

    expect(await screen.findByText(/Kiểm 5 dòng đầu/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Chạy import 2 dòng/ })).toBeInTheDocument();
  });

  it('xem trước hiện đúng tên cột đọc được từ file', async () => {
    renderWithProviders(
      <ImportDialog open onOpenChange={vi.fn()} entityLabel="sản phẩm" endpoint="/x/import" />,
    );
    await pickFile('code,name,unit\nSP-1,Bút,Cái');

    expect(await screen.findByRole('columnheader', { name: 'unit' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Cái' })).toBeInTheDocument();
  });

  it('file lỗi định dạng báo ngay ở bước chọn, không đẩy sang server', async () => {
    renderWithProviders(
      <ImportDialog open onOpenChange={vi.fn()} entityLabel="sản phẩm" endpoint="/x/import" />,
    );
    await pickFile('code,code\nA,B');

    expect(await screen.findByRole('alert')).toHaveTextContent(/xuất hiện hai lần/);
    expect(post).not.toHaveBeenCalled();
  });

  it('file chỉ có header thì báo không có dòng dữ liệu', async () => {
    renderWithProviders(
      <ImportDialog open onOpenChange={vi.fn()} entityLabel="sản phẩm" endpoint="/x/import" />,
    );
    await pickFile('code,name');
    expect(await screen.findByRole('alert')).toHaveTextContent(/không có dòng dữ liệu/i);
  });

  it('chạy xong hiện lỗi TỪNG DÒNG, không phải "import thất bại" chung chung', async () => {
    post.mockResolvedValue({ data: { jobId: 'job-1' } });
    get.mockImplementation((url: string) =>
      url.endsWith('/errors')
        ? Promise.resolve({
            data: [{ rowNumber: 2, field: 'price', message: 'Giá phải là số dương' }],
          })
        : Promise.resolve({
            data: {
              id: 'job-1',
              status: 'PARTIAL',
              totalRows: 2,
              validRows: 1,
              errorRows: 1,
              lastProcessedRow: 2,
            },
          }),
    );

    renderWithProviders(
      <ImportDialog open onOpenChange={vi.fn()} entityLabel="sản phẩm" endpoint="/x/import" />,
    );
    const user = await pickFile('code,price\nSP-1,10\nSP-2,-1');
    await user.click(await screen.findByRole('button', { name: /Chạy import 2 dòng/ }));

    expect(await screen.findByText(summaryText(/1 dòng lỗi/))).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('cell', { name: 'Giá phải là số dương' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('cell', { name: 'price' })).toBeInTheDocument();
  });

  it('không lỗi thì KHÔNG hiện bảng lỗi rỗng', async () => {
    post.mockResolvedValue({ data: { jobId: 'job-2' } });
    get.mockResolvedValue({
      data: {
        id: 'job-2',
        status: 'COMPLETED',
        totalRows: 1,
        validRows: 1,
        errorRows: 0,
        lastProcessedRow: 1,
      },
    });

    renderWithProviders(
      <ImportDialog open onOpenChange={vi.fn()} entityLabel="sản phẩm" endpoint="/x/import" />,
    );
    const user = await pickFile('code\nSP-1');
    await user.click(await screen.findByRole('button', { name: /Chạy import 1 dòng/ }));

    expect(await screen.findByText(summaryText(/1 dòng hợp lệ/))).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Lỗi' })).toBeNull();
  });
});
