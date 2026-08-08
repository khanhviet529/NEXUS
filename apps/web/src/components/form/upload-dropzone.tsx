'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { CloudUpload, FileCheck2, Loader2 } from 'lucide-react';
import { filesControllerPresign, filesControllerConfirm, getApiError } from '@nexus/api-client';
import { cn } from '@/lib/utils';

/**
 * [CORE] §5.8 — upload kéo-thả qua PRESIGNED URL (GĐ7):
 * presign → PUT thẳng S3/MinIO (byte KHÔNG qua API server §2) → confirm
 * (BE HeadObject xác minh rồi mới ghi row files).
 */
export function UploadDropzone({
  entity,
  entityId,
  category,
  onUploaded,
  className,
}: {
  /** Đính ngay vào bản ghi (kế thừa quyền §2.5) — bỏ trống = file trôi nổi */
  entity?: string;
  entityId?: string;
  category?: string;
  onUploaded?: (file: { id: string; filename: string }) => void;
  className?: string;
}) {
  const [state, setState] = React.useState<'idle' | 'uploading' | 'done'>('idle');
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setState('uploading');
    try {
      const mime = file.type || 'application/octet-stream';
      const presign = (await filesControllerPresign({ filename: file.name, mime })) as unknown as {
        fileId: string;
        uploadUrl: string;
      };
      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: file,
      });
      if (!put.ok) throw new Error(`PUT S3 thất bại: ${put.status}`);
      const confirmed = (await filesControllerConfirm({
        fileId: presign.fileId,
        filename: file.name,
        mime,
        ...(entity && entityId ? { entity: entity as never, entityId, category } : {}),
      })) as unknown as { id: string; filename: string };
      setState('done');
      toast.success(`Đã tải lên ${file.name}`);
      onUploaded?.(confirmed);
    } catch (e) {
      setState('idle');
      toast.error(getApiError(e).message);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Tải tệp lên"
      className={cn(
        'flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-border p-6 text-sm text-muted-foreground transition-colors',
        dragOver && 'border-ring bg-accent',
        className,
      )}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) void upload(file);
      }}
    >
      {state === 'uploading' ? (
        <Loader2 className="size-6 animate-spin" />
      ) : state === 'done' ? (
        <FileCheck2 className="size-6 text-primary" />
      ) : (
        <CloudUpload className="size-6" />
      )}
      <span>Kéo thả hoặc bấm để chọn tệp</span>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
