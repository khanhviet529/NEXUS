'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Building2,
  Command,
  Languages,
  LogOut,
  Moon,
  Network,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sun,
  User,
  Users,
} from 'lucide-react';
import { useAuthControllerLogout } from '@nexus/api-client';
import { Button } from '@/components/ui/button';
import { NotificationDropdown } from '@/components/common/notification-dropdown';
import { AppShell } from '@/design-system/layouts/app-shell';
import type { NavItem } from '@/design-system/layouts/types';
import { useCommandPalette } from '@/providers/command-palette';
import { useCan, useCurrentUser } from '@/lib/auth/use-can';

/**
 * Layout dashboard (§5.1).
 *
 * Đây là nơi DUY NHẤT gọi dữ liệu cho khung app: số thông báo chưa đọc, người
 * dùng hiện tại, quyền. Shell chỉ nhận ReactNode đã dựng sẵn qua `headerSlots`
 * (fe-preset-system §5.1) — nhờ vậy thêm HybridShell ở GĐ B không phải chép
 * lại một dòng logic nào.
 */
const NAV: (NavItem & { permission?: string })[] = [
  { href: '/orders', label: 'Đơn hàng', icon: ShoppingCart, permission: 'order:read' },
  { href: '/customers', label: 'Khách hàng', icon: Users, permission: 'customer:read' },
  { href: '/users', label: 'Người dùng', icon: User, permission: 'user:read' },
  { href: '/roles', label: 'Vai trò', icon: ShieldCheck, permission: 'role:read' },
  { href: '/org-units', label: 'Đơn vị', icon: Network, permission: 'org_unit:read' },
  { href: '/audit-logs', label: 'Nhật ký', icon: ScrollText, permission: 'audit:read' },
  { href: '/settings', label: 'Cấu hình', icon: Settings, permission: 'setting:read' },
  { href: '/tenant', label: 'Tổ chức', icon: Building2, permission: 'tenant:read' },
  // Khu sysadmin — chỉ ai có system_tenant:read mới thấy (guard thật ở BE §3.1b)
  { href: '/admin/tenants', label: 'Tenants', icon: Server, permission: 'system_tenant:read' },
];

function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${value};path=/;max-age=${365 * 24 * 3600}`;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const palette = useCommandPalette();
  const me = useCurrentUser();
  const can = useCan();
  const logout = useAuthControllerLogout();

  // Lọc quyền TRƯỚC khi đưa vào shell — shell không biết can() là gì (§5.1)
  const nav = React.useMemo(
    () => NAV.filter((i) => !i.permission || can(i.permission)).map(({ ...item }) => item),
    [can],
  );

  const breadcrumb = React.useMemo(() => {
    const item = NAV.find((i) => pathname.startsWith(i.href));
    return item ? [{ label: item.label, href: item.href }] : [];
  }, [pathname]);

  const toggleTheme = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    setCookie('theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };
  const toggleLocale = () => {
    const current = document.cookie.includes('locale=en') ? 'en' : 'vi';
    setCookie('locale', current === 'vi' ? 'en' : 'vi');
    router.refresh(); // messages nạp lại server-side
  };

  return (
    <AppShell
      nav={nav}
      breadcrumb={breadcrumb}
      pageMode="normal"
      headerSlots={{
        search: (
          <Button variant="ghost" size="sm" onClick={palette.open}>
            <Command /> Ctrl+K
          </Button>
        ),
        notifications: <NotificationDropdown />,
        user: (
          <>
            <Button variant="ghost" size="icon" aria-label="Đổi giao diện" onClick={toggleTheme}>
              <Sun className="block dark:hidden" />
              <Moon className="hidden dark:block" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Đổi ngôn ngữ" onClick={toggleLocale}>
              <Languages />
            </Button>
            <span className="mx-2 text-sm text-muted-foreground">{me.data?.fullName}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Đăng xuất"
              onClick={() => logout.mutate(undefined, { onSuccess: () => router.replace('/login') })}
            >
              <LogOut />
            </Button>
          </>
        ),
      }}
    >
      {children}
    </AppShell>
  );
}
