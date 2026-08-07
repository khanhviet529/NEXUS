'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Command,
  Languages,
  LogOut,
  Moon,
  ShoppingCart,
  Sun,
  User,
  Users,
} from 'lucide-react';
import {
  notificationsControllerUnreadCount,
  useAuthControllerLogout,
} from '@nexus/api-client';
import { Button } from '@/components/ui/button';
import { useCommandPalette } from '@/providers/command-palette';
import { useCurrentUser } from '@/lib/auth/use-can';
import { cn } from '@/lib/utils';

/**
 * Layout dashboard (§5.1): sidebar + header (chuông unread GĐ7, Cmd+K,
 * dark mode + đổi ngôn ngữ qua cookie — server đọc lại ở root layout).
 */
const NAV = [
  { href: '/orders', label: 'Đơn hàng', icon: ShoppingCart },
  { href: '/customers', label: 'Khách hàng', icon: Users },
  { href: '/users', label: 'Người dùng', icon: User },
];

function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${value};path=/;max-age=${365 * 24 * 3600}`;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const palette = useCommandPalette();
  const me = useCurrentUser();
  const logout = useAuthControllerLogout();

  const unread = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => notificationsControllerUnreadCount() as unknown as Promise<{ count: number }>,
    refetchInterval: 30_000,
    enabled: !!me.data,
  });

  const toggleTheme = () => {
    const next =
      document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    setCookie('theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };
  const toggleLocale = () => {
    const current = document.cookie.includes('locale=en') ? 'en' : 'vi';
    setCookie('locale', current === 'vi' ? 'en' : 'vi');
    router.refresh(); // messages nạp lại server-side
  };

  return (
    <div className="flex min-h-screen">
      <aside className="w-52 shrink-0 border-r border-border bg-card p-3">
        <Link href="/" className="mb-6 block px-2 text-lg font-bold">
          Nexus
        </Link>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
                pathname.startsWith(item.href) && 'bg-accent font-medium',
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 flex h-14 items-center justify-end gap-1 border-b border-border bg-background px-4"
          style={{ zIndex: 'var(--z-sticky)' as never }}
        >
          <Button variant="ghost" size="sm" onClick={palette.open}>
            <Command /> Ctrl+K
          </Button>
          <Button variant="ghost" size="icon" aria-label="Thông báo" className="relative">
            <Bell />
            {(unread.data?.count ?? 0) > 0 && (
              <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                {Math.min(unread.data!.count, 99)}
              </span>
            )}
          </Button>
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
            onClick={() =>
              logout.mutate(undefined, { onSuccess: () => router.replace('/login') })
            }
          >
            <LogOut />
          </Button>
        </header>
        {children}
      </div>
    </div>
  );
}
