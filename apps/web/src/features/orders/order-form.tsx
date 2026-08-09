'use client';

import * as React from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
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
import { applyServerErrors, useDirtyGuard } from '@/lib/form';
import { useFormKeyboard, GRID_CELL_ATTR } from '@/lib/keyboard/use-form-keyboard';
import { GridEntry, type GridColumn } from '@/design-system/patterns/grid-entry/grid-entry';
import { formatMoney } from '@/lib/format/money';
import { orderSchema, type OrderFormValues } from './schema';

/**
 * [REF] §5.8 FIELD ARRAY — form chứng từ có bảng dòng: thêm/xoá dòng,
 * tự tính thành tiền + DÒNG TỔNG bằng CHÍNH calculateMoney của BE
 * (@nexus/shared — một bộ tính tiền hai đầu, preview không bao giờ lệch).
 * POST kèm Idempotency-Key (§3.9) — double-click không tạo 2 đơn.
 */
const GRID_COLUMNS: GridColumn[] = [
  { id: 'product', header: 'Sản phẩm' },
  { id: 'quantity', header: 'SL', className: 'w-20 text-right' },
  { id: 'unitPrice', header: 'Đơn giá', className: 'w-32 text-right' },
  { id: 'discountPercent', header: 'CK%', className: 'w-16 text-right' },
  { id: 'taxRate', header: 'VAT%', className: 'w-16 text-right' },
  { id: 'amount', header: 'Thành tiền', className: 'w-28 text-right', dataType: 'money' },
];

export function OrderFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const formRef = React.useRef<HTMLFormElement>(null);
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

  // Preview tiền — dùng useWatch (KHÔNG dùng form.watch): form.watch('items')
  // trả về CÙNG reference sau mỗi setValue, nên useMemo không tính lại và
  // dòng tổng đứng yên trong khi ô nhập vẫn đổi. useWatch tạo giá trị mới.
  const watched = useWatch({ control: form.control, name: 'items' });
  const preview = React.useMemo(() => {
    // `?? []` phải nằm TRONG useMemo: ở ngoài, mỗi render tạo một mảng rỗng
    // mới nên dependency đổi liên tục và useMemo mất tác dụng.
    const lines = watched ?? [];
    try {
      // KHÔNG filter — giữ lines[idx] thẳng hàng với dòng form; dòng gõ dở = 0
      return calculateMoney(
        lines.map((i) => ({
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

  const addRow = React.useCallback(
    () =>
      items.append({
        productId: '',
        quantity: '1',
        unitPrice: '0',
        discountPercent: '',
        taxRate: '10',
      }),
    [items],
  );

  // profile 'data-entry' (§5.8): Enter đi ô kế / thêm dòng ở ô cuối —
  // KHÔNG submit; Ctrl+Enter mới submit; Esc huỷ ô chứ không đóng form
  useFormKeyboard({
    profile: 'data-entry',
    formRef,
    onSubmit: () => {
      if (open && !isSubmitting) void onSubmit();
    },
    onAddRow: addRow,
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
        <form ref={formRef} className="mt-4 space-y-4" onSubmit={onSubmit}>
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

            {/* FIELD ARRAY §5.8 — bảng dòng chứng từ, layout `grid-entry` */}
            <GridEntry
              caption="Dòng hàng của đơn"
              columns={GRID_COLUMNS}
              onAddRow={addRow}
              onRemoveRow={(idx) => items.remove(idx)}
              rows={items.fields.map((field, idx) => ({
                key: field.id,
                error: errors.items?.[idx]?.productId?.message,
                cells: [
                  <AsyncSelect
                    key="product"
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
                  />,
                  <MoneyInput
                    key="qty"
                    {...{ [GRID_CELL_ATTR]: '' }}
                    value={form.watch(`items.${idx}.quantity`)}
                    onChange={(v) => form.setValue(`items.${idx}.quantity`, v, { shouldDirty: true })}
                  />,
                  <MoneyInput
                    key="price"
                    {...{ [GRID_CELL_ATTR]: '' }}
                    value={form.watch(`items.${idx}.unitPrice`)}
                    onChange={(v) =>
                      form.setValue(`items.${idx}.unitPrice`, v, { shouldDirty: true })
                    }
                  />,
                  <Input
                    key="discount"
                    className="tnum text-right"
                    inputMode="decimal"
                    aria-label={`Chiết khấu % dòng ${idx + 1}`}
                    {...{ [GRID_CELL_ATTR]: '' }}
                    {...form.register(`items.${idx}.discountPercent`)}
                  />,
                  <Input
                    key="tax"
                    className="tnum text-right"
                    inputMode="decimal"
                    aria-label={`VAT % dòng ${idx + 1}`}
                    {...{ [GRID_CELL_ATTR]: '' }}
                    {...form.register(`items.${idx}.taxRate`)}
                  />,
                  <span key="amount" className="tnum block text-right">
                    {preview?.lines[idx] ? formatMoney(preview.lines[idx]!.amount) : '—'}
                  </span>,
                ],
              }))}
              footer={
                /* DÒNG TỔNG (§5.5/§5.8) — từ calculateMoney, khớp BE tuyệt đối */
                preview ? (
                  <tfoot
                    className="border-t border-border font-medium"
                    style={{ background: 'var(--table-header-bg)' }}
                  >
                    <tr>
                      <td className="px-2 py-2" colSpan={5}>
                        Tổng · thuế {formatMoney(preview.taxTotal)} · chiết khấu{' '}
                        {formatMoney(preview.discountTotal)}
                      </td>
                      <td className="tnum px-2 py-2 text-right" data-type="money">
                        {formatMoney(preview.total)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                ) : undefined
              }
            />
            {errors.items?.root && (
              <p className="text-xs text-destructive">{errors.items.root.message}</p>
            )}

          </fieldset>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Đang lưu…' : 'Tạo đơn (Ctrl+Enter)'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
