'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useProjectUI } from '../use-project-ui';
import { cn } from '@/lib/utils';
import type { ShellProps } from './types';

/**
 * Shell `sidebar` — GĐ A, dùng cho preset Enterprise (fe-preset-system §5.3).
 *
 * ```
 * ┌──────┬─────────────────┐
 * │ menu │ header          │
 * │      ├─────────────────┤
 * │      │ content         │
 * └──────┴─────────────────┘
 * ```
 *
 * KHÔNG có `useQuery` ở đây (§5.1) và KHÔNG có `if (preset === …)` (§12).
 * Kích thước đọc từ token derived: --sidebar-w, --header-h — nên đổi density
 * là shell giãn theo mà không sửa dòng code nào.
 */
export function SidebarShell({ children, nav, breadcrumb, headerSlots, pageMode }: ShellProps) {
  const pathname = usePathname();
  const ui = useProjectUI();
  const width = ui.behavior.contentWidth;

  // pageMode 'focus' (cấp 2, §2.2): giấu nav để người dùng không lạc khỏi
  // luồng nhiều bước. Không phải trục user đổi được.
  const focus = pageMode === 'focus';

  return (
    <div className="flex min-h-screen">
      {!focus && (
        <aside
          className="shrink-0 border-r border-border"
          style={{
            width: 'var(--sidebar-w)',
            background: 'var(--sidebar-bg)',
            color: 'var(--sidebar-fg)',
          }}
        >
          <Link
            href="/"
            className="flex items-center px-4 font-bold"
            style={{ height: 'var(--header-h)' }}
          >
            Nexus
          </Link>
          <nav className="space-y-1 px-2" aria-label="Điều hướng chính">
            {nav.map((item) => (
              <SidebarLink key={item.href} item={item} pathname={pathname} />
            ))}
          </nav>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 flex items-center gap-1 border-b border-border px-4"
          style={{
            height: 'var(--header-h)',
            background: 'var(--header-bg)',
            zIndex: 'var(--z-sticky)' as never,
          }}
        >
          <Breadcrumb items={breadcrumb} />
          <div className="ml-auto flex items-center gap-1">
            {headerSlots.tenantSwitcher}
            {headerSlots.search}
            {headerSlots.notifications}
            {headerSlots.user}
          </div>
        </header>

        <main
          className={cn('min-w-0 flex-1', width !== 'fluid' && 'mx-auto w-full')}
          style={width === 'fluid' ? undefined : { maxWidth: `${width.max}px` }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarLink({
  item,
  pathname,
}: {
  item: ShellProps['nav'][number];
  pathname: string;
}) {
  const active = pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
      style={{
        background: active ? 'var(--sidebar-item-active)' : undefined,
        fontWeight: active ? 500 : undefined,
      }}
    >
      {item.icon && <item.icon className="size-4" />}
      {item.label}
    </Link>
  );
}

function Breadcrumb({ items }: { items: ShellProps['breadcrumb'] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Đường dẫn" className="min-w-0 truncate text-sm">
      {items.map((c, i) => (
        <span key={`${c.label}-${i}`}>
          {i > 0 && <span className="mx-1 text-muted-foreground">/</span>}
          {c.href ? (
            <Link href={c.href} className="hover:underline">
              {c.label}
            </Link>
          ) : (
            <span className="text-muted-foreground">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
