import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/render';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/orders',
}));

const slots = {
  search: <button type="button">Ctrl+K</button>,
  notifications: <button type="button">Thông báo</button>,
  user: <span>Nguyễn A</span>,
};

describe('SidebarShell qua AppShell (§5.1, §5.2)', () => {
  it('render nav, breadcrumb và cả ba header slot', () => {
    renderWithProviders(
      <AppShell
        nav={[{ href: '/orders', label: 'Đơn hàng' }]}
        breadcrumb={[{ label: 'Đơn hàng', href: '/orders' }]}
        headerSlots={slots}
        pageMode="normal"
      >
        <p>nội dung</p>
      </AppShell>,
    );
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Đường dẫn' })).toBeInTheDocument();
    expect(screen.getByText('Ctrl+K')).toBeInTheDocument();
    expect(screen.getByText('Thông báo')).toBeInTheDocument();
    expect(screen.getByText('Nguyễn A')).toBeInTheDocument();
    expect(screen.getByText('nội dung')).toBeInTheDocument();
  });

  it('đánh dấu mục đang mở bằng aria-current, không chỉ bằng màu', () => {
    // §8.4: màu KHÔNG được là dấu hiệu duy nhất. Người dùng đọc màn hình phải
    // biết đang ở đâu.
    renderWithProviders(
      <AppShell
        nav={[
          { href: '/orders', label: 'Đơn hàng' },
          { href: '/customers', label: 'Khách hàng' },
        ]}
        breadcrumb={[]}
        headerSlots={slots}
        pageMode="normal"
      >
        <p>x</p>
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: 'Đơn hàng' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Khách hàng' })).not.toHaveAttribute('aria-current');
  });

  it('pageMode="focus" giấu nav — luồng nhiều bước không để người dùng lạc', () => {
    renderWithProviders(
      <AppShell
        nav={[{ href: '/orders', label: 'Đơn hàng' }]}
        breadcrumb={[]}
        headerSlots={slots}
        pageMode="focus"
      >
        <p>x</p>
      </AppShell>,
    );
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).toBeNull();
  });

  it('shell render được KHÔNG cần QueryClient có dữ liệu — nó không tự fetch (§5.1)', () => {
    // Đây là hợp đồng quan trọng nhất của ShellProps. Nếu ai đó thêm useQuery
    // vào shell, `notifications` sẽ không còn phụ thuộc slot truyền vào và
    // shell thứ hai sẽ phải chép lại logic.
    const { container } = renderWithProviders(
      <AppShell
        nav={[]}
        breadcrumb={[]}
        headerSlots={{ search: null, notifications: null, user: null }}
        pageMode="normal"
      >
        <p>trống</p>
      </AppShell>,
    );
    expect(container.querySelector('header')).toBeInTheDocument();
    expect(screen.getByText('trống')).toBeInTheDocument();
  });

  it('sidebar và header lấy kích thước từ token, không phải số rời rạc', () => {
    const { container } = renderWithProviders(
      <AppShell
        nav={[]}
        breadcrumb={[]}
        headerSlots={{ search: null, notifications: null, user: null }}
        pageMode="normal"
      >
        <p>x</p>
      </AppShell>,
    );
    expect(container.querySelector('aside')).toHaveStyle({ width: 'var(--sidebar-w)' });
    expect(container.querySelector('header')).toHaveStyle({ height: 'var(--header-h)' });
  });
});
