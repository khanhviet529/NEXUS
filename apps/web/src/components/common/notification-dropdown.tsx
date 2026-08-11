'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import {
  notificationsControllerList,
  notificationsControllerMarkAllRead,
  notificationsControllerMarkRead,
  notificationsControllerUnreadCount,
} from '@nexus/api-client';
import type { NotificationDto } from '@nexus/api-client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * V13 — chuông thông báo (§5C đợt GĐ7 mới có BE, nay có UI đọc).
 * Notification là dữ liệu "own" tuyệt đối — không can() gì ở đây.
 * `data.entity/entityId` (nếu consumer ghi kèm) → điều hướng tới bản ghi.
 */
const ENTITY_PATH: Record<string, string> = {
  Order: 'orders',
  Product: 'products',
  Customer: 'customers',
  User: 'users',
};

function hrefOf(n: NotificationDto): string | null {
  const entity = n.data?.entity;
  const entityId = n.data?.entityId;
  if (typeof entity !== 'string' || typeof entityId !== 'string') return null;
  const path = ENTITY_PATH[entity];
  return path ? `/${path}/${entityId}` : null;
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return new Date(iso).toLocaleDateString('vi');
}

export function NotificationDropdown() {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const unread = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => notificationsControllerUnreadCount(),
    refetchInterval: 30_000,
  });
  const list = useQuery({
    queryKey: ['notifications', { page: 1 }],
    queryFn: () => notificationsControllerList({ page: 1, limit: 10 }),
    enabled: open, // không kéo danh sách khi chuông đóng
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  const markRead = useMutation({
    mutationFn: (id: string) => notificationsControllerMarkRead(id),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => notificationsControllerMarkAllRead(),
    onSuccess: invalidate,
  });

  const count = unread.data?.count ?? 0;
  const rows = list.data?.data ?? [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Thông báo" className="relative">
          <Bell />
          {count > 0 && (
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground">
              {Math.min(count, 99)}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-medium">Thông báo</span>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-1 py-0.5 text-xs"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              Đánh dấu tất cả đã đọc
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {list.isPending && open ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">Đang tải…</p>
        ) : rows.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            Không có thông báo nào.
          </p>
        ) : (
          rows.map((n) => {
            const href = hrefOf(n);
            return (
              <DropdownMenuItem
                key={n.id}
                className="flex flex-col items-start gap-0.5"
                onSelect={() => {
                  if (!n.readAt) markRead.mutate(n.id);
                  if (href) router.push(href);
                }}
              >
                <span className="flex w-full items-center gap-2">
                  {/* Chấm chưa đọc — dấu hiệu thứ hai ngoài độ đậm chữ (§8.4) */}
                  {!n.readAt && (
                    <span
                      aria-label="Chưa đọc"
                      className="size-2 shrink-0 rounded-full bg-destructive"
                    />
                  )}
                  <span className={n.readAt ? 'text-muted-foreground' : 'font-medium'}>
                    {n.title}
                  </span>
                </span>
                {n.body && (
                  <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                )}
                <span className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
