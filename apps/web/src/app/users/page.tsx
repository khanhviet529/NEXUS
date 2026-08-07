'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useUsersControllerList, getApiError } from '@nexus/api-client';

/**
 * GĐ4 — tiêu chí §10: danh sách đủ sort/filter/phân trang, ĐỒNG BỘ URL,
 * F5 và Back đúng (§5.4: tham số danh sách sống trong URL, không useState).
 * Giao diện thô — nhánh A (design system + DataTable §5.5 đầy đủ) thay ở GĐ8.
 */
const SORTABLE = ['email', 'fullName', 'createdAt', 'lastLoginAt', 'status'] as const;

function UsersTable() {
  const router = useRouter();
  // URL là NGUỒN SỰ THẬT cho bộ lọc (§5.4) — copy link/F5/Back đều giữ state
  const [params, setParams] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(20),
    sort: parseAsString.withDefault('-createdAt'),
    q: parseAsString.withDefault(''),
  });

  const users = useUsersControllerList(
    {
      page: params.page,
      limit: params.limit,
      sort: params.sort,
      q: params.q || undefined,
    },
    { query: { placeholderData: (prev) => prev } },
  );

  useEffect(() => {
    if (users.isError && getApiError(users.error).status === 401) router.replace('/login');
  }, [users.isError, users.error, router]);

  if (users.isPending) return <p>Đang tải…</p>;
  if (users.isError) return <p style={{ color: 'crimson' }}>{getApiError(users.error).message}</p>;

  const { data, meta } = users.data;
  const toggleSort = (field: string) => {
    const current = params.sort;
    const next = current === field ? `-${field}` : field;
    void setParams({ sort: next, page: 1 });
  };

  return (
    <main>
      <h1>Người dùng ({meta.total})</h1>
      <p>
        <input
          placeholder="Tìm email / tên…"
          defaultValue={params.q}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void setParams({ q: (e.target as HTMLInputElement).value, page: 1 });
            }
          }}
          style={{ width: 280 }}
        />
      </p>
      <table cellPadding={6} border={1} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {SORTABLE.map((f) => (
              <th key={f} onClick={() => toggleSort(f)} style={{ cursor: 'pointer' }}>
                {f}
                {params.sort === f ? ' ↑' : params.sort === `-${f}` ? ' ↓' : ''}
              </th>
            ))}
            <th>Đơn vị</th>
            <th>Vai trò</th>
          </tr>
        </thead>
        <tbody>
          {data.map((u) => (
            <tr key={u.membershipId}>
              <td>{u.email}</td>
              <td>{u.fullName}</td>
              <td>{new Date(u.createdAt).toLocaleDateString('vi')}</td>
              <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('vi') : '—'}</td>
              <td>{u.status}</td>
              <td>{u.orgUnit?.name ?? '—'}</td>
              <td>{u.roles.map((r) => r.name).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <button
          disabled={params.page <= 1}
          onClick={() => void setParams({ page: params.page - 1 })}
        >
          ← Trước
        </button>{' '}
        Trang {meta.page}/{meta.totalPages || 1}{' '}
        <button disabled={!meta.hasNext} onClick={() => void setParams({ page: params.page + 1 })}>
          Sau →
        </button>
      </p>
    </main>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<p>Đang tải…</p>}>
      <UsersTable />
    </Suspense>
  );
}
