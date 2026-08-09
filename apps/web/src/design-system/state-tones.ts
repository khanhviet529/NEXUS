import type { OrderState } from '@nexus/shared';

/**
 * [CORE] Ánh xạ TRẠNG THÁI NGHIỆP VỤ → TONE TRÌNH BÀY (fe-preset-system §9.1).
 *
 * Vì sao ở FE chứ không ở packages/shared: `PENDING → warning` là **quyết định
 * trình bày**. Backend không cần biết màu, và nếu để ở shared thì mỗi lần đổi
 * bảng màu lại phải build lại gói dùng chung của cả BE.
 *
 * `satisfies Record<OrderState, Tone>` giữ lưới an toàn: thêm trạng thái mới
 * vào ORDER_STATES mà quên map ở đây → LỖI BIÊN DỊCH, không phải badge trắng
 * trên production.
 */
export type Tone = 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'muted';

export const ORDER_STATE_TONE = {
  DRAFT: 'neutral',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'muted',
} as const satisfies Record<OrderState, Tone>;

/** Nhãn tiếng Việt của trạng thái — cũng là trình bày, không phải nghiệp vụ */
export const ORDER_STATE_LABEL = {
  DRAFT: 'Nháp',
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã huỷ',
} as const satisfies Record<OrderState, string>;

/**
 * Lớp CSS theo tone — dùng token §5.7, KHÔNG màu rời rạc.
 * Giữ ở đây (không rải trong component) để đổi bảng màu là sửa một chỗ.
 */
export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  warning: 'bg-[color-mix(in_oklch,var(--color-primary)_12%,transparent)] text-foreground',
  success: 'bg-[color-mix(in_oklch,var(--color-primary)_18%,transparent)] text-primary',
  danger: 'bg-[color-mix(in_oklch,var(--color-destructive)_15%,transparent)] text-destructive',
  info: 'bg-accent text-accent-foreground',
  muted: 'bg-muted text-muted-foreground line-through',
};
