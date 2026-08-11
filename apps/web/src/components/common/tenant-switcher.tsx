'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { authControllerSwitchTenant, getApiError } from '@nexus/api-client';
import { useCurrentUser } from '@/lib/auth/use-can';

/**
 * Phase 3 — đổi tenant từ header. Chỉ hiện khi user có >1 membership ACTIVE.
 * POST /auth/switch-tenant cấp cookie token MỚI cho tenant đích (§3.1b) —
 * sau đó RELOAD CỨNG: mọi cache (React Query, RSC) đều thuộc tenant cũ,
 * vá từng query là nguồn rò dữ liệu chéo tenant kiểu mới.
 */
export function TenantSwitcher() {
  const me = useCurrentUser();

  const switchTenant = useMutation({
    mutationFn: (tenantId: string) => authControllerSwitchTenant({ tenantId }),
    onSuccess: () => {
      window.location.assign('/me'); // reload cứng — xem chú thích trên
    },
    onError: (e) => toast.error(getApiError(e).message),
  });

  const memberships = me.data?.memberships ?? [];
  if (memberships.length <= 1) return null;

  return (
    <select
      aria-label="Đổi tenant"
      className="rounded-md border border-input bg-background px-2 text-sm"
      style={{ height: 'var(--input-h)' }}
      value={me.data!.tenant.id}
      disabled={switchTenant.isPending}
      onChange={(e) => {
        if (e.target.value !== me.data!.tenant.id) switchTenant.mutate(e.target.value);
      }}
    >
      {memberships.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name} ({m.code})
        </option>
      ))}
    </select>
  );
}
