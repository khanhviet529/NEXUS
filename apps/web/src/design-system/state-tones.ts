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
 * Tone → token màu TẦNG 2. Trả về TÊN TOKEN, không phải class hay màu.
 *
 * Trước đây map này trả class Tailwind arbitrary
 * (`bg-[color-mix(in_oklch,var(--color-primary)_12%…)]`) và cả `warning` lẫn
 * `success` đều lấy từ `--color-primary` — hai trạng thái đối lập ra gần như
 * cùng một màu. Trả token để nơi dùng tự pha nền/chữ, và để preset đổi bảng
 * màu ở đúng một chỗ.
 */
export const TONE_VAR: Record<Tone, string> = {
  neutral: 'var(--tone-neutral)',
  warning: 'var(--tone-warning)',
  success: 'var(--tone-success)',
  danger: 'var(--tone-danger)',
  info: 'var(--tone-info)',
  muted: 'var(--tone-muted)',
};

/**
 * Ký hiệu chữ đi kèm màu — §8.4 mục 2, mục quan trọng nhất của checklist a11y.
 *
 * 8% nam giới mù màu đỏ-lục: badge "Đã duyệt" xanh và "Từ chối" đỏ mà không có
 * dấu hiệu thứ hai thì họ KHÔNG phân biệt được. Đây là lý do màu không bao giờ
 * được là dấu hiệu duy nhất.
 */
export const TONE_SYMBOL: Record<Tone, string> = {
  neutral: '○',
  warning: '◐',
  success: '●',
  danger: '✕',
  info: 'ℹ',
  muted: '⊘',
};
