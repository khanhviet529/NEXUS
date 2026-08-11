'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  authControllerMySessions,
  authControllerRevokeMySession,
  getApiError,
} from '@nexus/api-client';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/providers/overlay';

/**
 * Phase 2b — thiết bị đang đăng nhập (§4.3d). "Own" tuyệt đối: BE chỉ trả
 * phiên CỦA TÔI, thu hồi cũng chỉ phiên của tôi. Thu hồi phiên đang dùng
 * đồng nghĩa tự đăng xuất — confirm nói rõ.
 */
export default function MySessionsPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['my-sessions'],
    queryFn: () => authControllerMySessions(),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => authControllerRevokeMySession(id),
    onSuccess: () => {
      toast.success('Đã thu hồi phiên');
      void qc.invalidateQueries({ queryKey: ['my-sessions'] });
    },
    onError: (e) => toast.error(getApiError(e).message),
  });

  if (query.isError) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-4 text-xl font-semibold">Thiết bị đăng nhập</h1>
        <p className="text-sm text-muted-foreground">{getApiError(query.error).message}</p>
      </main>
    );
  }

  const rows = (query.data ?? []).filter((s) => !s.revokedAt);

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Thiết bị đăng nhập</h1>
      <p className="text-sm text-muted-foreground">
        Thấy thiết bị lạ? Thu hồi phiên đó ngay — refresh token của nó hết hiệu lực lập tức.
      </p>
      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không có phiên nào đang hoạt động.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3">Thiết bị</th>
              <th className="py-2 pr-3">IP</th>
              <th className="py-2 pr-3">Đăng nhập</th>
              <th className="py-2 pr-3">Hoạt động cuối</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="py-2 pr-3">{s.device ?? s.userAgent ?? 'Không rõ'}</td>
                <td className="py-2 pr-3 font-mono text-xs">{s.ip ?? '—'}</td>
                <td className="py-2 pr-3">{new Date(s.createdAt).toLocaleString('vi')}</td>
                <td className="py-2 pr-3">
                  {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString('vi') : '—'}
                </td>
                <td className="py-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={revoke.isPending}
                    onClick={() =>
                      void confirm({
                        title: 'Thu hồi phiên này?',
                        description:
                          'Thiết bị đó bị đăng xuất ngay. Nếu là phiên BẠN ĐANG DÙNG, chính bạn sẽ phải đăng nhập lại.',
                        variant: 'danger',
                        confirmLabel: 'Thu hồi',
                      }).then((o) => {
                        if (o.ok) revoke.mutate(s.id);
                      })
                    }
                  >
                    Thu hồi
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
