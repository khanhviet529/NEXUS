'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useProjectUI } from '@/design-system/use-project-ui';
import { cn } from '@/lib/utils';

/**
 * [CORE] DetailLayout — nửa "detail" của page pattern `list-detail`
 * (fe-preset-system §6, §11 GĐ A).
 *
 * Khung chung cho MỌI trang chi tiết chứng từ: đường lui về danh sách, tiêu đề
 * + trạng thái, hàng action, thân chia section, cột phụ (meta/lịch sử).
 *
 * Vì sao là component chứ không phải "mỗi module tự dựng": bố cục trang chi
 * tiết là kiến trúc thông tin (§2.1). Module A dùng tab còn module B dùng
 * section cho cùng loại nội dung thì người dùng mất phương hướng.
 *
 * `formLayout` mặc định lấy từ preset. Enterprise là 'sections'.
 */
export interface DetailSection {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function DetailLayout({
  backHref,
  backLabel = 'Quay lại danh sách',
  title,
  subtitle,
  status,
  actions,
  sections,
  aside,
  layout,
}: {
  backHref: string;
  backLabel?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Badge trạng thái — đặt cạnh tiêu đề, không nhét vào bảng meta */
  status?: React.ReactNode;
  actions?: React.ReactNode;
  sections: DetailSection[];
  aside?: React.ReactNode;
  layout?: 'sections' | 'two-column' | 'single-column';
}) {
  const ui = useProjectUI();
  const resolved = layout ?? (ui.behavior.defaultFormLayout === 'two-column'
    ? 'two-column'
    : ui.behavior.defaultFormLayout === 'single-column'
      ? 'single-column'
      : 'sections');

  return (
    <div className="min-w-0" style={{ padding: 'var(--card-padding)' }}>
      <Link
        href={backHref}
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" /> {backLabel}
      </Link>

      <header className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {status}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </header>

      <div className={cn('gap-4', aside ? 'grid lg:grid-cols-[minmax(0,1fr)_320px]' : 'block')}>
        <div
          className={cn(
            'min-w-0',
            resolved === 'two-column' ? 'grid gap-4 md:grid-cols-2' : 'space-y-4',
          )}
        >
          {sections.map((s) => (
            <section
              key={s.id}
              aria-labelledby={`section-${s.id}`}
              style={{
                border: 'var(--card-border)',
                borderRadius: 'var(--card-radius)',
                boxShadow: 'var(--card-shadow)',
                padding: 'var(--card-padding)',
                background: 'var(--surface-raised)',
              }}
            >
              <h2 id={`section-${s.id}`} className="mb-1 font-medium">
                {s.title}
              </h2>
              {s.description && (
                <p className="mb-3 text-sm text-muted-foreground">{s.description}</p>
              )}
              {s.children}
            </section>
          ))}
        </div>
        {aside && <aside className="min-w-0 space-y-4">{aside}</aside>}
      </div>
    </div>
  );
}

/** Cặp nhãn–giá trị cho khối meta. Nhãn rộng cố định theo --form-label-w. */
export function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 py-1 text-sm">
      <dt className="shrink-0 text-muted-foreground" style={{ width: 'var(--form-label-w)' }}>
        {label}
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
