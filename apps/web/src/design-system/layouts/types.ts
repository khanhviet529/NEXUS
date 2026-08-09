import type { ComponentType, ReactNode } from 'react';

export interface NavItem {
  href: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** Nav con — shell 2/3 cấp dùng, shell 1 cấp bỏ qua */
  children?: NavItem[];
}

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * [CORE] Hợp đồng chung của MỌI shell — fe-preset-system §5.1.
 *
 * Chốt NGAY dù mới có một shell. Lý do: shell thứ hai (HybridShell, GĐ B) là
 * thứ kiểm chứng hợp đồng này đủ hay thiếu, và sửa hợp đồng khi đã có bốn
 * shell tốn gấp nhiều lần.
 *
 * ⚠ SHELL KHÔNG ĐƯỢC TỰ GỌI `useQuery`. Mọi dữ liệu vào qua `headerSlots`
 * dưới dạng ReactNode đã dựng sẵn. Nếu shell tự lấy số thông báo chưa đọc thì
 * shell thứ hai phải chép lại logic đó, và shell thứ ba nữa — đến lúc sửa
 * cách đếm unread thì phải sửa bốn chỗ.
 *
 * `nav` cũng phải ĐÃ lọc theo quyền trước khi vào đây: shell không biết
 * `can()` là gì.
 */
export interface ShellProps {
  children: ReactNode;
  nav: NavItem[];
  breadcrumb: Crumb[];
  headerSlots: {
    /** Nút mở Cmd+K */
    search: ReactNode;
    /** Chuông + số chưa đọc */
    notifications: ReactNode;
    /** Menu người dùng (đổi theme/ngôn ngữ, đăng xuất) */
    user: ReactNode;
    tenantSwitcher?: ReactNode;
  };
  /** Cấp 2 — theo trang, không phải theo user (§2.2) */
  pageMode: 'normal' | 'focus';
}

export type ShellComponent = (props: ShellProps) => ReactNode;
