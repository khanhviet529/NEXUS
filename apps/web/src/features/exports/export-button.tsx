'use client';

import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiAxios } from '@nexus/api-client';
import { Button } from '@/components/ui/button';

/**
 * [CORE] Nút export §5B.3/C1 — tải file CSV do BE STREAM về.
 *
 * Ba điều dễ làm sai, đã xử lý ở đây:
 *
 * 1. **Không dùng `window.open`/thẻ `<a href>` thẳng.** Xác thực là httpOnly
 *    cookie kèm CSRF (§4.3b); mở tab mới bỏ qua lớp interceptor và mất header.
 *    Tải qua axios rồi tạo blob URL.
 *
 * 2. **Tên file lấy từ `Content-Disposition` của BE.** BE là nơi biết cột nào
 *    bị loại theo quyền (§4.4c), nên nó cũng là nơi đặt tên đúng. FE đoán tên
 *    thì hai người tải cùng lúc ra hai file trùng tên, khác nội dung.
 *
 * 3. **Thu hồi blob URL sau khi tải.** Không thu hồi thì mỗi lần export giữ
 *    nguyên file trong bộ nhớ tab cho tới khi đóng — với file 50MB thì thấy rõ.
 */
export function ExportButton({
  endpoint,
  body,
  label = 'Xuất CSV',
  fallbackFilename = 'export.csv',
}: {
  /** Ví dụ '/api/v1/products/export' */
  endpoint: string;
  /** Body POST — reports cần { params } (Phase 4a); list export dùng query string thì bỏ trống */
  body?: unknown;
  label?: string;
  fallbackFilename?: string;
}) {
  const [busy, setBusy] = React.useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await apiAxios.post(endpoint, body, { responseType: 'blob' });
      const filename =
        filenameFromDisposition(String(res.headers['content-disposition'] ?? '')) ??
        fallbackFilename;

      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Không xuất được file. Thử lại sau.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <Download />}
      {busy ? 'Đang xuất…' : label}
    </Button>
  );
}

/** `attachment; filename="products.csv"` hoặc RFC 5987 `filename*=UTF-8''…` */
export function filenameFromDisposition(disposition: string): string | null {
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      // Tên hỏng encoding không được làm hỏng cả lần tải
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain?.[1] ?? null;
}
