'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Vùng kéo-thả THUẦN TRÌNH BÀY: nhận file, không biết file đi đâu.
 *
 * Tách khỏi UploadDropzone vì hai nơi dùng khác hẳn nhau: upload đính kèm đẩy
 * byte thẳng lên S3 qua presigned URL (§2), còn import ĐỌC file tại máy để xem
 * trước rồi mới gửi JSON. Gộp một component thì một trong hai phải nhận cờ
 * "đừng upload nhé" — đúng kiểu tham số làm hỏng cả hai đường.
 *
 * Bàn phím: Enter và Space đều mở hộp chọn file. Chỉ Enter là chưa đủ — với
 * `role="button"` người dùng trình đọc màn hình mong Space cũng chạy.
 */
export function Dropzone({
  onFiles,
  accept,
  multiple = false,
  label = 'Kéo thả hoặc bấm để chọn tệp',
  ariaLabel = 'Tải tệp lên',
  icon,
  className,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: React.ReactNode;
  ariaLabel?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const emit = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) onFiles(files);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-border p-6 text-sm text-muted-foreground transition-colors',
        dragOver && 'border-ring bg-accent',
        className,
      )}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        emit(e.dataTransfer.files);
      }}
    >
      {icon}
      <span>{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          emit(e.target.files);
          // Reset để chọn LẠI CÙNG một file vẫn bắn sự kiện — nếu không, người
          // dùng sửa file rồi chọn lại sẽ tưởng app treo
          e.target.value = '';
        }}
      />
    </div>
  );
}
