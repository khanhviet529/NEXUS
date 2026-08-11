'use client';

import { use } from 'react';
import { OrderDetailScreen } from './order-detail-screen';

/**
 * Wrapper Next-specific MỎNG — nội dung ở `order-detail-screen.tsx`.
 *
 * Hai lý do tách (V9 + V14):
 * 1. `use(promise)` không resolve trong act() của RTL (React 19) — test đi
 *    qua OrderDetailScreen nhận `id` prop.
 * 2. Next production build CẤM page module export thêm component: export
 *    `OrderDetailScreen` từ đây qua được dev/vitest nhưng vỡ `next build`.
 */
export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <OrderDetailScreen id={id} />;
}
