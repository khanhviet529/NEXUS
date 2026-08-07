import { z } from 'zod';

/**
 * [REF] features/customers/schema.ts — zod đặt tại features/<domain> (§5.8).
 * Khớp CreateCustomerDto của BE (code + name JSONB + taxCode);
 * name đa ngôn ngữ (§3.10): vi bắt buộc, en tuỳ chọn.
 */
export const customerSchema = z.object({
  code: z
    .string()
    .min(1, 'Mã khách hàng bắt buộc')
    .max(32, 'Tối đa 32 ký tự')
    .regex(/^[A-Za-z0-9_-]+$/, 'Chỉ chữ, số, gạch ngang/dưới'),
  name: z.object({
    vi: z.string().min(1, 'Tên tiếng Việt bắt buộc'),
    en: z.string().optional(),
  }),
  taxCode: z.string().max(20, 'Tối đa 20 ký tự').optional().or(z.literal('')),
});

export type CustomerFormValues = z.infer<typeof customerSchema>;
