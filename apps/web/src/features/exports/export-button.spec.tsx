import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { ExportButton, filenameFromDisposition } from './export-button';

const post = vi.fn();
vi.mock('@nexus/api-client', () => ({ apiAxios: { post: (...a: unknown[]) => post(...a) } }));

describe('filenameFromDisposition', () => {
  it('đọc filename thường', () => {
    expect(filenameFromDisposition('attachment; filename="products.csv"')).toBe('products.csv');
  });

  it('ưu tiên filename* RFC 5987 để giữ tên tiếng Việt có dấu', () => {
    expect(
      filenameFromDisposition(
        "attachment; filename=\"san-pham.csv\"; filename*=UTF-8''s%E1%BA%A3n-ph%E1%BA%A9m.csv",
      ),
    ).toBe('sản-phẩm.csv');
  });

  it('encoding hỏng thì lùi về filename thường, không làm hỏng cả lần tải', () => {
    expect(
      filenameFromDisposition("attachment; filename=\"ok.csv\"; filename*=UTF-8''%E0%A4%A"),
    ).toBe('ok.csv');
  });

  it('không có gì thì trả null để caller dùng tên dự phòng', () => {
    expect(filenameFromDisposition('attachment')).toBeNull();
  });
});

describe('ExportButton (§5B.3/C1)', () => {
  beforeEach(() => {
    post.mockReset();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('tải qua axios (giữ cookie + CSRF), KHÔNG mở tab mới', async () => {
    // window.open bỏ qua interceptor nên mất header CSRF (§4.3b) — request
    // đi ra là 403 và người dùng chỉ thấy một tab trắng.
    post.mockResolvedValue({
      data: new Blob(['code,name']),
      headers: { 'content-disposition': 'attachment; filename="products.csv"' },
    });
    const user = userEvent.setup();
    renderWithProviders(<ExportButton endpoint="/api/v1/products/export" />);

    await user.click(screen.getByRole('button', { name: /Xuất CSV/ }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/api/v1/products/export', undefined, {
      responseType: 'blob',
    });
  });

  it('thu hồi blob URL sau khi tải — không giữ file trong bộ nhớ tab', async () => {
    post.mockResolvedValue({ data: new Blob(['x']), headers: {} });
    const user = userEvent.setup();
    renderWithProviders(<ExportButton endpoint="/api/v1/products/export" />);

    await user.click(screen.getByRole('button', { name: /Xuất CSV/ }));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake'));
  });

  it('lỗi thì nút mở lại được, không kẹt ở "Đang xuất…"', async () => {
    post.mockRejectedValue(new Error('500'));
    const user = userEvent.setup();
    renderWithProviders(<ExportButton endpoint="/api/v1/products/export" />);

    await user.click(screen.getByRole('button', { name: /Xuất CSV/ }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Xuất CSV/ })).not.toBeDisabled(),
    );
  });
});
