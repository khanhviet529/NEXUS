'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuthControllerResetPassword, getApiError } from '@nexus/api-client';

/**
 * Phase 3 — đặt lại mật khẩu từ link email (?token=...).
 * Thành công = BE thu hồi TOÀN BỘ phiên cũ (§4.3c) — người dùng phải đăng
 * nhập lại ở mọi thiết bị; UI nói rõ điều đó thay vì để họ tưởng bị lỗi.
 */
function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useAuthControllerResetPassword({
    mutation: {
      onSuccess: () => setDone(true),
      onError: (e) => setError(getApiError(e).message),
    },
  });

  if (!token) {
    return (
      <main style={{ maxWidth: 400 }}>
        <h1>Liên kết không hợp lệ</h1>
        <p>Thiếu mã đặt lại. Hãy mở đúng liên kết trong email, hoặc yêu cầu liên kết mới.</p>
        <p>
          <Link href="/forgot-password">Yêu cầu liên kết mới →</Link>
        </p>
      </main>
    );
  }

  if (done) {
    return (
      <main style={{ maxWidth: 400 }}>
        <h1>Đã đổi mật khẩu</h1>
        <p>
          Mọi phiên đăng nhập cũ trên <b>tất cả thiết bị</b> đã bị thu hồi. Đăng nhập lại bằng mật
          khẩu mới.
        </p>
        <p>
          <Link href="/login">Đăng nhập →</Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 360 }}>
      <h1>Đặt mật khẩu mới</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (password !== confirmPw) {
            setError('Hai ô mật khẩu không khớp');
            return;
          }
          reset.mutate({ data: { token, newPassword: password } });
        }}
      >
        <label style={{ display: 'block', marginBottom: 8 }}>
          Mật khẩu mới (≥ 8 ký tự)
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%' }}
            required
            minLength={8}
          />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Nhập lại mật khẩu
          <input
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            style={{ width: '100%' }}
            required
            minLength={8}
          />
        </label>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" disabled={reset.isPending}>
          {reset.isPending ? 'Đang đổi…' : 'Đổi mật khẩu'}
        </button>
      </form>
    </main>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams cần Suspense boundary khi build production
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
