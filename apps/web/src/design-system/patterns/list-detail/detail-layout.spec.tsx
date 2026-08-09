import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen } from '@/test/render';
import { DetailLayout, DetailField } from './detail-layout';

const SECTIONS = [
  { id: 'general', title: 'Thông tin chung', children: <p>nội dung chung</p> },
  { id: 'items', title: 'Dòng hàng', children: <p>bảng dòng</p> },
];

describe('DetailLayout — pattern list-detail (§6)', () => {
  it('mỗi section là landmark có tiêu đề riêng, không phải div rỗng nghĩa', () => {
    // Trang chi tiết chứng từ dài; không có heading thì người dùng trình đọc
    // màn hình phải nghe tuần tự từ đầu để tìm khối cần sửa.
    renderWithProviders(
      <DetailLayout backHref="/orders" title="DH-001" sections={SECTIONS} />,
    );
    expect(screen.getByRole('region', { name: 'Thông tin chung' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dòng hàng', level: 2 })).toBeInTheDocument();
  });

  it('luôn có đường lui về danh sách', () => {
    renderWithProviders(
      <DetailLayout backHref="/orders" title="DH-001" sections={SECTIONS} />,
    );
    expect(screen.getByRole('link', { name: /Quay lại danh sách/ })).toHaveAttribute(
      'href',
      '/orders',
    );
  });

  it('tiêu đề là h1 duy nhất của trang', () => {
    renderWithProviders(
      <DetailLayout backHref="/orders" title="DH-001" sections={SECTIONS} />,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('layout mặc định lấy từ preset, không phải hằng số trong component', () => {
    // Enterprise dùng 'sections' → các section xếp dọc, không chia hai cột.
    const { container } = renderWithProviders(
      <DetailLayout backHref="/orders" title="DH-001" sections={SECTIONS} />,
    );
    expect(container.querySelector('.md\\:grid-cols-2')).toBeNull();
  });

  it('layout two-column ghi đè được cho màn cần', () => {
    const { container } = renderWithProviders(
      <DetailLayout backHref="/o" title="x" sections={SECTIONS} layout="two-column" />,
    );
    expect(container.querySelector('.md\\:grid-cols-2')).not.toBeNull();
  });

  it('aside chỉ render khi có nội dung — không để cột trống chiếm chỗ', () => {
    const { container: without } = renderWithProviders(
      <DetailLayout backHref="/o" title="x" sections={SECTIONS} />,
    );
    expect(without.querySelector('aside')).toBeNull();

    const { container: with_ } = renderWithProviders(
      <DetailLayout backHref="/o" title="x" sections={SECTIONS} aside={<p>lịch sử</p>} />,
    );
    expect(with_.querySelector('aside')).not.toBeNull();
  });

  it('DetailField dùng dl semantics và bề rộng nhãn theo token', () => {
    const { container } = renderWithProviders(
      <DetailLayout
        backHref="/o"
        title="x"
        sections={[
          {
            id: 'meta',
            title: 'Meta',
            children: (
              <dl>
                <DetailField label="Khách hàng">Công ty A</DetailField>
              </dl>
            ),
          },
        ]}
      />,
    );
    const dt = container.querySelector('dt')!;
    expect(dt.textContent).toBe('Khách hàng');
    expect(dt.getAttribute('style')).toContain('var(--form-label-w)');
  });
});
