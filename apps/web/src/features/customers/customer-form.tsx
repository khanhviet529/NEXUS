'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { customersControllerCreate } from '@nexus/api-client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/form-field';
import { applyServerErrors, useCtrlS, useDirtyGuard } from '@/lib/form';
import { customerSchema, type CustomerFormValues } from './schema';

/**
 * [REF] Form §5.8 — khuôn cho mọi form sau:
 * RHF + zod (schema ở features/<domain>/schema.ts), map 422 vào đúng field,
 * dirty guard, Ctrl+S, chặn double-submit (isSubmitting), readonly dùng
 * LẠI form này qua prop.
 */
export function CustomerFormDialog({
  open,
  onOpenChange,
  readonly = false,
  defaultValues,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readonly?: boolean;
  defaultValues?: Partial<CustomerFormValues>;
}) {
  const qc = useQueryClient();
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { code: '', name: { vi: '', en: '' }, taxCode: '', ...defaultValues },
  });
  const { errors, isDirty, isSubmitting } = form.formState;

  useDirtyGuard(isDirty && open);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await customersControllerCreate({
        code: values.code,
        name: { vi: values.name.vi, ...(values.name.en ? { en: values.name.en } : {}) },
        ...(values.taxCode ? { taxCode: values.taxCode } : {}),
      });
      toast.success('Đã tạo khách hàng');
      void qc.invalidateQueries({ queryKey: ['customers'] });
      form.reset();
      onOpenChange(false);
    } catch (e) {
      applyServerErrors(form, e); // 422 → đúng field (§5.8)
    }
  });

  useCtrlS(() => {
    if (open && !readonly && !isSubmitting) void onSubmit();
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Chặn đóng overlay khi form dirty (§5.7) — bắt xác nhận thô sơ
        if (!next && isDirty && !window.confirm('Dữ liệu chưa lưu sẽ mất. Đóng?')) return;
        if (!next) form.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogTitle>{readonly ? 'Khách hàng' : 'Tạo khách hàng'}</DialogTitle>
        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          <fieldset disabled={readonly || isSubmitting} className="space-y-4">
            <FormField label="Mã khách hàng" required error={errors.code?.message}>
              <Input {...form.register('code')} placeholder="KH001" autoFocus />
            </FormField>
            <FormField label="Tên (tiếng Việt)" required error={errors.name?.vi?.message}>
              <Input {...form.register('name.vi')} placeholder="Công ty TNHH A" />
            </FormField>
            <FormField label="Tên (English)" error={errors.name?.en?.message}>
              <Input {...form.register('name.en')} placeholder="A Co., Ltd" />
            </FormField>
            <FormField label="Mã số thuế" error={errors.taxCode?.message}>
              <Input {...form.register('taxCode')} placeholder="0312345678" />
            </FormField>
          </fieldset>
          {!readonly && (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Huỷ
              </Button>
              {/* isSubmitting chặn double-submit (§5.8) */}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Đang lưu…' : 'Lưu (Ctrl+S)'}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
