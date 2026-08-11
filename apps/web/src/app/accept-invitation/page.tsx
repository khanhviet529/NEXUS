'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuthControllerAcceptInvitation, getApiError } from '@nexus/api-client';

/**
 * Phase 3 — nhận lời mời vào tenant (?token=..., link một lần có hạn).
 * Hai nhánh của BE: email CHƯA có tài khoản → password bắt buộc;
 * email ĐÃ có tài khoản → chỉ nhận membership, bỏ qua password.
 */
function AcceptInvitationForm() {
  const token = useSearchParams().get('token') ?? '';
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = useAuthControllerAcceptInvitation({
    mutation: {
      onSuccess: () => setDone(true),
      onError: (e) => setError(getApiError(e).message),
    },
  });

  if (!token) {
    return (
      <main style={{ maxWidth: 400 }}>
        <h1>Liên kết không hợp lệ</h1>
        <p>Thiếu mã lời mời. Hãy mở đúng liên kết trong email mời, hoặc nhờ gửi lại lời mời.</p>
      </main>
    );
  }

  if (done) {
    return (
      <main style={{ maxWidth: 400 }}>
        <h1>Đã tham gia</h1>
        <p>Tài khoản của bạn đã sẵn sàng. Đăng nhập để bắt đầu.</p>
        <p>
          <Link href="/login">Đăng nhập →</Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 360 }}>
      <h1>Nhận lời mời</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          accept.mutate({
            data: { token, fullName, ...(password ? { password } : {}) },
          });
        }}
      >
        <label style={{ display: 'block', marginBottom: 8 }}>
          Họ tên
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{ width: '100%' }}
            required
          />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Mật khẩu (≥ 8 ký tự)
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%' }}
            minLength={password ? 8 : undefined}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Đã có tài khoản với email được mời? Để trống — mật khẩu cũ giữ nguyên.
          </span>
        </label>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" disabled={accept.isPending}>
          {accept.isPending ? 'Đang xử lý…' : 'Tham gia'}
        </button>
      </form>
    </main>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense>
      <AcceptInvitationForm />
    </Suspense>
  );
}
