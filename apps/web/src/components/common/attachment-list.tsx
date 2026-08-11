'use client';

import * as React from 'react';
import { FileText, Download } from 'lucide-react';
import {
  useFilesControllerListByEntity,
  filesControllerDownload,
  getApiError,
} from '@nexus/api-client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/**
 * [CORE] AttachmentList — tệp đính kèm của một bản ghi.
 * Quyền KẾ THỪA entity gốc (permission-matrix §2.5: "xem được đơn hàng thì
 * xem được file của đơn đó") — BE quyết, FE chỉ hiển thị.
 * Download qua presigned URL: file KHÔNG đi qua API server (§2.3).
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentList({ entity, entityId }: { entity: string; entityId: string }) {
  const attachments = useFilesControllerListByEntity(entity, entityId);

  const download = async (fileId: string) => {
    try {
      const { url } = await filesControllerDownload(fileId);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      toast.error(getApiError(e).message);
    }
  };

  if (attachments.isPending) {
    return <p className="text-sm text-muted-foreground">Đang tải tệp đính kèm…</p>;
  }
  if (attachments.isError) {
    return <p className="text-sm text-muted-foreground">Không xem được tệp đính kèm.</p>;
  }
  if (attachments.data.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có tệp đính kèm.</p>;
  }

  return (
    <ul className="space-y-2" aria-label="Tệp đính kèm">
      {attachments.data.map((a) => (
        <li key={a.attachmentId} className="flex items-center gap-2 text-sm">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate" title={a.filename}>
            {a.filename}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatSize(a.size)}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Tải ${a.filename}`}
            onClick={() => void download(a.fileId)}
          >
            <Download className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
