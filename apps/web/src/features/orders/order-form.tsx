'use client';

import * as React from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { calculateMoney, DEFAULT_MONEY_CONFIG } from '@nexus/shared';
import {
  apiAxios,
  customersControllerList,
  productsControllerList,
} from '@nexus/api-client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/form-field';
import { AsyncSelect } from '@/components/form/async-select';
import { MoneyInput } from '@/components/form/money-input';
import { applyServerErrors, useCtrlS, useDirtyGuard } from '@/lib/form';
import { formatMoney } from '@/lib/format/money';
import { orderSchema, type OrderFormValues } from './schema';

/**
 * [REF] §5.8 FIELD ARRAY — form chứng từ có bảng dòng: thêm/xoá dòng,
 * tự tính thành tiền + DÒNG TỔNG bằng CHÍNH calculateMoney của BE
 * (@nexus/shared — một bộ tính tiền hai đầu, preview không bao giờ lệch).
 * POST kèm Idempotency-Key (§3.9) — double-click không tạo 2 đơn.
 */
export function OrderFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  // Idempotency-Key theo PHIÊN NHẬP LIỆU: đổi khi mở form mới, giữ khi retry lỗi
  const idempotencyKey = React.useRef(crypto.randomUUID());

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      customerId: '',
      items: [{ productId: '', quantity: '1', unitPrice: '0', discountPercent: '', taxRate: '10' }],
    },
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const items = useFieldArray({ control: form.control, name: 'items' });

  useDirtyGuard(isDirty && open);
  React.useEffect(() => {
    if (open) idempotencyKey.current = crypto.randomUUID();
  }, [open]);

  // Preview tiền — watch toàn bộ items, tính bằng bộ B1 dùng chung
  const watched = form.watch('items');
  const preview = React.useMemo(() => {
    try {
      // KHÔNG filter — giữ lines[idx] thẳng hàng với dòng form; dòng gõ dở = 0
      return calculateMoney(
        watched.map((i) => ({
          quantity: i.quantity || '0',
          unitPrice: i.unitPrice || '0',
          discountPercent: i.discountPercent || undefined,
          taxRate: i.taxRate || undefined,
        })),
        DEFAULT_MONEY_CONFIG,
      );
    } catch {
      return null; // đang gõ dở — không chặn
    }
  }, [watched]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      // Generated fn chưa nhận header tuỳ biến → gọi apiAxios trực tiếp cho
      // MỘT endpoint cần Idempotency-Key (ngoại lệ có chủ đích, §3.9)
      await apiAxios.post(
        '/api/v1/orders',
        {
          customerId: values.customerId,
          items: values.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            ...(i.discountPercent ? { discountPercent: i.discountPercent } : {}),
            ...(i.taxRate ? { taxRate: i.taxRate } : {}),
          })),
        },
        { headers: { 'Idempotency-Key': idempotencyKey.current } },
      );
      toast.success('Đã tạo đơn hàng');
      void qc.invalidateQueries({ queryKey: ['orders'] });
      form.reset();
      onOpenChange(false);
    } catch (e) {
      applyServerErrors(form, e);
    }
  });

  useCtrlS(() => {
    if (open && !isSubmitting) void onSubmit();
  });

  const fetchCustomers = async (q: string, page: number) => {
    const res = (await customersControllerList({ page, limit: 20 })) as unknown as {
      data: Array<{ id: string; code: string; name: string | null }>;
      meta: { hasNext: boolean };
    };
    const filtered = q
      ? res.data.filter(
          (c) =>
            c.code.toLowerCase().includes(q.toLowerCase()) ||
            (c.name ?? '').toLowerCase().includes(q.toLowerCase()),
        )
      : res.data;
    return {
      items: filtered.map((c) => ({ value: c.id, label: c.name ?? c.code, hint: c.code })),
      hasNext: res.meta.hasNext,
    };
  };

  const fetchProducts = async (q: string, page: number) => {
    const res = (await productsControllerList({
      page,
      limit: 20,
      ...(q ? { q } : {}),
    })) as unknown as {
      data: Array<{ id: string; code: string; name: string | null }>;
      meta: { hasNext: boolean };
    };
    return {
      items: res.data.map((p) => ({ value: p.id, label: p.name ?? p.code, hint: p.code })),
      hasNext: res.meta.hasNext,
    };
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isDirty && !window.confirm('Dữ liệu chưa lưu sẽ mất. Đóng?')) return;
        if (!next) form.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogTitle>Tạo đơn hàng</DialogTitle>
        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          <fieldset disabled={isSubmitting} className="space-y-4">
            <FormField label="Khách hàng" required error={errors.customerId?.message}>
              <AsyncSelect
                value={form.watch('customerId') || null}
                valueLabel={form.watch('customerLabel')}
                placeholder="Chọn khách hàng…"
                fetchPage={fetchCustomers}
                onChange={(opt) => {
                  form.setValue('customerId', opt.value, { shouldDirty: true, shouldValidate: true });
                  form.setValue('customerLabel', `${opt.hint} · ${opt.label}`);
                }}
              />
            </FormField>

            {/* FIELD ARRAY §5.8 — bảng dòng chứng từ */}
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="px-2 py-2">Sản phẩm</th>
                    <th className="w-20 px-2 py-2 text-right">SL</th>
                    <th className="w-32 px-2 py-2 text-right">Đơn giá</th>
                    <th className="w-16 px-2 py-2 text-right">CK%</th>
                    <th className="w-16 px-2 py-2 text-right">VAT%</th>
                    <th className="w-28 px-2 py-2 text-right">Thành tiền</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.fields.map((field, idx) => (
                    <tr key={field.id} className="border-t border-border align-top">
                      <td className="px-2 py-1.5">
                        <AsyncSelect
                          value={form.watch(`items.${idx}.productId`) || null}
                          valueLabel={form.watch(`items.${idx}.productLabel`)}
                          placeholder="Chọn sản phẩm…"
                          fetchPage={fetchProducts}
                          onChange={(opt) => {
                            form.setValue(`items.${idx}.productId`, opt.value, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                            form.setValue(`items.${idx}.productLabel`, `${opt.hint} · ${opt.label}`);
                          }}
                        />
                        {errors.items?.[idx]?.productId && (
                          <p className="mt-1 text-xs text-destructive">
                            {errors.items[idx]!.productId!.message}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <MoneyInput
                          value={form.watch(`items.${idx}.quantity`)}
                          onChange={(v) =>
                            form.setValue(`items.${idx}.quantity`, v, { shouldDirty: true })
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <MoneyInput
                          value={form.watch(`items.${idx}.unitPrice`)}
                          onChange={(v) =>
                            form.setValue(`items.${idx}.unitPrice`, v, { shouldDirty: true })
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="text-right tnum"
                          inputMode="decimal"
                          {...form.register(`items.${idx}.discountPercent`)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="text-right tnum"
                          inputMode="decimal"
                          {...form.register(`items.${idx}.taxRate`)}
                        />
                      </td>
                      <td className="px-2 py-2 text-right tnum" data-type="money">
                        {preview?.lines[idx] ? formatMoney(preview.lines[idx]!.amount) : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Xoá dòng"
                          disabled={items.fields.length <= 1}
                          onClick={() => items.remove(idx)}
                        >
                          <Trash2 className="text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* DÒNG TỔNG (§5.5/§5.8) — từ calculateMoney, khớp BE tuyệt đối */}
                {preview && (
                  <tfoot className="border-t border-border bg-muted font-medium">
                    <tr>
                      <td className="px-2 py-2" colSpan={5}>
                        Tổng · thuế {formatMoney(preview.taxTotal)} · chiết khấu{' '}
                        {formatMoney(preview.discountTotal)}
                      </td>
                      <td className="px-2 py-2 text-right tnum" data-type="money">
                        {formatMoney(preview.total)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {errors.items?.root && (
              <p className="text-xs text-destructive">{errors.items.root.message}</p>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                items.append({
                  productId: '',
                  quantity: '1',
                  unitPrice: '0',
                  discountPercent: '',
                  taxRate: '10',
                })
              }
            >
              <Plus /> Thêm dòng
            </Button>
          </fieldset>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Đang lưu…' : 'Tạo đơn (Ctrl+S)'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
