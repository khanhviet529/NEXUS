import { z } from 'zod';

/** [GEN] Schema zod tại features/<domain> (§5.8) — khớp CreateProductDto BE */
export const productSchema = z.object({
  code: z.string().min(1, 'Mã bắt buộc').max(32),
  name: z.object({
    vi: z.string().min(1, 'Tên tiếng Việt bắt buộc'),
    en: z.string().optional(),
  }),
});

export type ProductFormValues = z.infer<typeof productSchema>;
