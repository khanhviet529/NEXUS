'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthControllerMe, getApiError } from '@nexus/api-client';

/**
 * GET /me — TIÊU CHÍ HOÀN THÀNH GĐ1 (spec §10):
 * "GET /me chạy từ FE bằng type sinh tự động".
 */
export default function MePage() {
  const router = useRouter();
  const me = useAuthControllerMe();

  useEffect(() => {
    if (me.isError && getApiError(me.error).status === 401) {
      router.replace('/login');
    }
  }, [me.isError, me.error, router]);

  if (me.isPending) return <p>Đang tải…</p>;
  if (me.isError) return <p style={{ color: 'crimson' }}>{getApiError(me.error).message}</p>;

  const data = me.data;
  return (
    <main>
      <h1>Xin chào, {data.fullName}</h1>
      <table cellPadding={6}>
        <tbody>
          <tr>
            <td>Email</td>
            <td>{data.email}</td>
          </tr>
          <tr>
            <td>Tenant</td>
            <td>
              {data.tenant.name} ({data.tenant.code})
            </td>
          </tr>
          <tr>
            <td>Đơn vị</td>
            <td>{data.orgUnit ? `${data.orgUnit.name} (${data.orgUnit.code})` : '—'}</td>
          </tr>
          <tr>
            <td>Vai trò</td>
            <td>{data.roles.map((r) => r.name).join(', ')}</td>
          </tr>
          <tr>
            <td>Quyền ({data.permissions.length})</td>
            <td style={{ maxWidth: 480 }}>
              <code style={{ fontSize: 12 }}>{data.permissions.join(' · ')}</code>
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ marginTop: 12 }}>
        <Link href="/me/sessions" className="text-sm underline">
          Thiết bị đang đăng nhập →
        </Link>
      </p>
    </main>
  );
}
