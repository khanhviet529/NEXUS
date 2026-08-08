import { z } from 'zod';

/** [REF] §5.8 — schema đơn hàng, khớp CreateOrderDto BE. Tiền/số lượng là CHUỖI (§3.7) */
const MONEY_RE = /^\d+(\.\d{1,4})?$/;
const PERCENT_RE = /^\d{1,2}(\.\d{1,2})?$|^100$/;

export const orderItemSchema = z.object({
  productId: z.string().uuid('Chọn sản phẩm'),
  /** Nhãn hiển thị — không gửi BE */
  productLabel: z.string().optional(),
  quantity: z.string().regex(MONEY_RE, 'Số lượng không hợp lệ').refine((v) => Number(v) > 0, 'Phải > 0'),
  unitPrice: z.string().regex(MONEY_RE, 'Đơn giá không hợp lệ'),
  discountPercent: z.string().regex(PERCENT_RE, '0–100').optional().or(z.literal('')),
  taxRate: z.string().regex(PERCENT_RE, '0–100').optional().or(z.literal('')),
});

export const orderSchema = z.object({
  customerId: z.string().uuid('Chọn khách hàng'),
  customerLabel: z.string().optional(),
  items: z.array(orderItemSchema).min(1, 'Đơn phải có ít nhất một dòng'),
});

export type OrderFormValues = z.infer<typeof orderSchema>;
