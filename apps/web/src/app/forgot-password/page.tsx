'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuthControllerForgotPassword, getApiError } from '@nexus/api-client';

/**
 * Phase 3 — quên mật khẩu. BE LUÔN trả 202 cùng một response bất kể email
 * có tồn tại hay không (chống dò email) — nên UI cũng chỉ có MỘT thông điệp
 * thành công, không được viết "email không tồn tại".
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forgot = useAuthControllerForgotPassword({
    mutation: {
      onSuccess: () => setSent(true),
      onError: (e) => setError(getApiError(e).message),
    },
  });

  if (sent) {
    return (
      <main style={{ maxWidth: 400 }}>
        <h1>Kiểm tra hộp thư</h1>
        <p>
          Nếu <b>{email}</b> có tài khoản, một liên kết đặt lại mật khẩu đã được gửi tới. Liên kết
          chỉ dùng được một lần và có thời hạn.
        </p>
        <p>
          <Link href="/login">← Về trang đăng nhập</Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 360 }}>
      <h1>Quên mật khẩu</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          forgot.mutate({ data: { email } });
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
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" disabled={forgot.isPending}>
          {forgot.isPending ? 'Đang gửi…' : 'Gửi liên kết đặt lại'}
        </button>
      </form>
      <p style={{ marginTop: 12 }}>
        <Link href="/login">← Về trang đăng nhập</Link>
      </p>
    </main>
  );
}
