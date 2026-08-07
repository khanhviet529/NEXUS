import type { LucideIcon } from 'lucide-react';
import type { QueryKey } from '@tanstack/react-query';
import type { ConfirmSpec } from '@/providers/overlay';

/**
 * [CORE] Action Registry — spec §5.9, chuyển thể từ docs/action-registry.tsx.
 * Hành động là DỮ LIỆU: khai một lần trong features/<domain>/actions.ts,
 * render ra toolbar / menu ⋯ / context menu / bulk bar / Cmd+K.
 */

/** true = cho phép. string = bị chặn, string là LÝ DO hiển thị trong tooltip. */
export type Enabled = true | string;

/** Dữ liệu user nhập trong dialog confirm, truyền tiếp vào run(). */
export interface ConfirmResult {
  reason?: string;
  options?: Record<string, boolean>;
}

export interface ActionDef<TCtx> {
  /** '<resource>.<action>' — dùng cho analytics và test */
  id: string;
  label: string | ((ctx: TCtx) => string);
  description?: string | ((ctx: TCtx) => string);
  icon?: LucideIcon;
  variant?: 'default' | 'danger';
  /** Cùng group nằm cạnh nhau, khác group chèn separator */
  group?: string;
  order?: number;
  /** 'mod+shift+a' — mod = Ctrl/Cmd */
  shortcut?: string;
  /** Có hiện trong Cmd+K không (mặc định: có) */
  inPalette?: boolean;

  // --- Điều kiện hiển thị (§5.9: thiếu permission → ẨN; enabled fail → MỜ + lý do)
  permission?: string | string[];
  visible?: (ctx: TCtx) => boolean;
  enabled?: (ctx: TCtx) => Enabled;

  // --- Thực thi
  confirm?: (ctx: TCtx) => ConfirmSpec | undefined;
  run: (ctx: TCtx, input: ConfirmResult) => Promise<unknown>;

  // --- Sau khi chạy
  success?: string | ((ctx: TCtx, result: unknown) => string);
  invalidates?: (ctx: TCtx) => QueryKey[];
  onSuccess?: (ctx: TCtx, result: unknown) => void;

  /** CỬA THOÁT (§5.9) — action không vừa khuôn thì tự render, khỏi pipeline */
  render?: (ctx: TCtx, resolved: ResolvedAction<TCtx>) => React.ReactNode;
}

export interface ResolvedAction<TCtx> {
  def: ActionDef<TCtx>;
  label: string;
  visible: boolean;
  disabled: boolean;
  /** Lý do bị disable — đổ vào DisabledTooltip */
  reason?: string;
  run: () => Promise<void>;
  pending: boolean;
}

export interface BulkResult {
  succeeded: number;
  failed: Array<{ id: string; label: string; reason: string }>;
}

export interface BulkActionDef<TRow> {
  id: string;
  label: string;
  icon?: LucideIcon;
  variant?: 'default' | 'danger';
  permission?: string | string[];
  /** Lọc dòng chạy được, kèm lý do loại trừ từng dòng */
  eligible?: (rows: TRow[]) => { ok: TRow[]; skipped: Array<{ row: TRow; reason: string }> };
  confirm?: (rows: TRow[]) => ConfirmSpec;
  /** BE trả kết quả TỪNG DÒNG (§5C.3), không fail toàn bộ */
  run: (rows: TRow[], input: ConfirmResult) => Promise<BulkResult>;
  invalidates?: () => QueryKey[];
}
