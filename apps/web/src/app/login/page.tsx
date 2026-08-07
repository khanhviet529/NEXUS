'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  useAuthControllerLogin,
  getApiError,
  type MembershipSummaryDto,
} from '@nexus/api-client';

/**
 * Màn login GĐ1 — tối giản, chưa có design system (nhánh song song A).
 * Type + hook SINH TỰ ĐỘNG từ OpenAPI (§2.4) — không viết tay type response.
 * User nhiều membership → accessToken null → hiện màn chọn tenant (§4.4b).
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@tenant-a.local');
  const [password, setPassword] = useState('');
  const [memberships, setMemberships] = useState<MembershipSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const login = useAuthControllerLogin({
    mutation: {
      onSuccess: (data) => {
        if (data.accessToken) {
          router.push('/me'); // cookie httpOnly đã được set — JS không đụng token
        } else {
          setMemberships(data.memberships);
        }
      },
      onError: (e) => setError(getApiError(e).message),
    },
  });

  const submit = (tenantId?: string) => {
    setError(null);
    login.mutate({ data: { email, password, tenantId } });
  };

  if (memberships) {
    return (
      <main>
        <h1>Chọn đơn vị làm việc</h1>
        <ul>
          {memberships.map((m) => (
            <li key={m.tenantId} style={{ margin: 8 }}>
              <button onClick={() => submit(m.tenantId)} disabled={login.isPending}>
                {m.tenantName} ({m.tenantCode})
              </button>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 360 }}>
      <h1>Đăng nhập</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label style={{ display: 'block', marginBottom: 8 }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%' }}
            required
          />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Mật khẩu
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%' }}
            required
            minLength={8}
          />
        </label>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </main>
  );
}
