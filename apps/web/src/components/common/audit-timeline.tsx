'use client';

import * as React from 'react';
import { History } from 'lucide-react';
import { useAuditControllerList } from '@nexus/api-client';
import type { AuditLogEntryDto } from '@nexus/api-client';
import { cn } from '@/lib/utils';

/**
 * [CORE] AuditTimeline — timeline thay đổi trên trang chi tiết (§4.9: "có UI
 * tra cứu và timeline hiển thị trên trang chi tiết từng bản ghi").
 *
 * - before/after ĐÃ che field nhạy cảm từ lúc GHI (§4.4c nơi 4) — FE tin dữ liệu
 * - action là mã ngữ nghĩa từ registry (ADR-0004) — nhãn dịch Ở FE (§3.10 luật 3);
 *   mã lạ (DB_UPDATE của trigger, action module mới) rơi về chính mã đó,
 *   KHÔNG rẽ nhánh chết
 */
const ACTION_LABEL: Record<string, string> = {
  CREATE: 'Tạo mới',
  UPDATE: 'Cập nhật',
  DELETE: 'Xoá',
  SUBMIT: 'Gửi duyệt',
  APPROVE: 'Duyệt',
  REJECT: 'Từ chối',
  CANCEL: 'Huỷ',
  SESSION_REVOKED: 'Thu hồi phiên',
  CROSS_TENANT_ACCESS: 'Truy cập chéo tenant',
};

/** Field đổi = key có mặt ở before/after — chỉ hiện TÊN field, không hiện giá trị dài */
function changedKeys(entry: AuditLogEntryDto): string[] {
  const keys = new Set<string>();
  for (const side of [entry.before, entry.after]) {
    if (side && typeof side === 'object') {
      for (const k of Object.keys(side)) keys.add(k);
    }
  }
  return [...keys];
}

export function AuditTimeline({
  entity,
  entityId,
  limit = 20,
  className,
}: {
  entity: string;
  entityId: string;
  limit?: number;
  className?: string;
}) {
  const audit = useAuditControllerList({ entity, entityId, limit });

  if (audit.isPending) {
    return <p className="text-sm text-muted-foreground">Đang tải lịch sử…</p>;
  }
  if (audit.isError) {
    // Thiếu audit:read → không có timeline; đây KHÔNG phải lỗi của trang
    return <p className="text-sm text-muted-foreground">Không xem được lịch sử thay đổi.</p>;
  }
  const entries = audit.data.data;
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có thay đổi nào được ghi.</p>;
  }

  return (
    <ol className={cn('space-y-3', className)} aria-label="Lịch sử thay đổi">
      {entries.map((entry) => {
        const keys = changedKeys(entry);
        return (
          <li key={entry.id} className="flex gap-2 text-sm">
            <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p>
                <span className="font-medium">{ACTION_LABEL[entry.action] ?? entry.action}</span>
                {entry.actorName && (
                  <span className="text-muted-foreground"> — {entry.actorName}</span>
                )}
                {!entry.actorName && entry.actorId?.startsWith('system:') && (
                  <span className="text-muted-foreground"> — hệ thống</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(entry.createdAt).toLocaleString('vi')}
                {keys.length > 0 && <> · {keys.join(', ')}</>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
