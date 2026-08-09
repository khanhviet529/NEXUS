'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useProjectUI } from '../use-project-ui';
import { cn } from '@/lib/utils';
import type { NavItem, ShellProps } from './types';

/**
 * Shell `hybrid` — GĐ B, dùng cho preset Operations (fe-preset-system §5.3).
 *
 * ```
 * ┌─────────────────────────┐
 * │ global nav              │   ← hàng trên: nhóm chức năng cấp 1
 * ├──────┬──────────────────┤
 * │module│ content          │   ← cột trái: mục con của nhóm đang mở
 * │ nav  │                  │
 * └──────┴──────────────────┘
 * ```
 *
 * Vì sao Operations cần shell này chứ không phải `sidebar`: người dùng kho/quầy
 * làm việc trong MỘT nhóm chức năng suốt ca, và chuyển nhóm là chuyện hiếm.
 * Đặt nhóm cấp 1 lên hàng trên giải phóng chiều cao cột trái cho mục con —
 * thứ họ bấm liên tục.
 *
 * Đây cũng là điểm kiểm chứng THẬT của `ShellProps` (§11.1): nếu hợp đồng
 * thiếu slot thì nó lộ ra ở đây chứ không phải sau pilot. Kết quả: hợp đồng
 * đủ, không phải thêm trường nào.
 *
 * KHÔNG `useQuery`, KHÔNG `if (preset === …)` — cùng luật với SidebarShell.
 */
export function HybridShell({ children, nav, breadcrumb, headerSlots, pageMode }: ShellProps) {
  const pathname = usePathname();
  const ui = useProjectUI();
  const width = ui.behavior.contentWidth;
  const focus = pageMode === 'focus';

  // Nhóm đang mở = mục cấp 1 khớp đường dẫn; không khớp thì lấy mục đầu, để
  // cột trái không bao giờ trống rỗng vô nghĩa.
  const activeTop = nav.find((i) => pathname.startsWith(i.href)) ?? nav[0];
  const moduleNav: NavItem[] = activeTop?.children ?? [];

  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="sticky top-0 flex items-center gap-1 border-b border-border px-4"
        style={{
          height: 'var(--header-h)',
          background: 'var(--sidebar-bg)',
          color: 'var(--sidebar-fg)',
          zIndex: 'var(--z-sticky)' as never,
        }}
      >
        <Link href="/" className="mr-4 font-bold">
          Nexus
        </Link>
        {!focus && (
          <nav aria-label="Điều hướng chính" className="flex items-center gap-1">
            {nav.map((item) => {
              const active = item.href === activeTop?.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm"
                  style={{
                    background: active ? 'var(--sidebar-item-active)' : undefined,
                    fontWeight: active ? 500 : undefined,
                  }}
                >
                  {item.icon && <item.icon className="size-4" />}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-1">
          {headerSlots.tenantSwitcher}
          {headerSlots.search}
          {headerSlots.notifications}
          {headerSlots.user}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Cột module chỉ hiện khi nhóm đang mở CÓ mục con — cột trống chiếm
            chỗ mà không mang thông tin là lỗi hay gặp của bố cục hai tầng. */}
        {!focus && moduleNav.length > 0 && (
          <aside
            className="shrink-0 border-r border-border"
            style={{ width: 'var(--sidebar-w)', background: 'var(--surface-sunken)' }}
          >
            <nav aria-label={`Mục trong ${activeTop?.label ?? ''}`} className="space-y-1 p-2">
              {moduleNav.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                      active && 'font-medium',
                    )}
                    style={{ background: active ? 'var(--table-row-selected)' : undefined }}
                  >
                    {item.icon && <item.icon className="size-4" />}
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {breadcrumb.length > 0 && (
            <nav
              aria-label="Đường dẫn"
              className="min-w-0 truncate border-b border-border px-4 text-sm"
              style={{ height: 'var(--toolbar-h)', lineHeight: 'var(--toolbar-h)' }}
            >
              {breadcrumb.map((c, i) => (
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
          )}
          <main
            className={cn('min-w-0 flex-1', width !== 'fluid' && 'mx-auto w-full')}
            style={width === 'fluid' ? undefined : { maxWidth: `${width.max}px` }}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
