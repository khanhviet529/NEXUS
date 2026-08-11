import type { ActionDef } from '@/lib/actions';

/**
 * [GEN] Action Registry (§5.9) — khai MỘT lần, hiện ở 4 nơi.
 * Thiếu permission → ẨN; enabled() trả string → nút MỜ + tooltip lý do.
 */
export interface ProductCtx {
  record: { id: string; code: string };
  meId: string | undefined;
}

export const productActions: ActionDef<ProductCtx>[] = [
  // TODO: khai action theo khuôn features/orders/actions.ts
];
