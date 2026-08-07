/* ============================================================================
 * ACTION REGISTRY — bản tham khảo
 * Stack giả định: React 19 + TanStack Query + shadcn/ui (Radix) + sonner
 *
 * Ý tưởng: hành động là DỮ LIỆU. Khai báo một lần, render ở nhiều nơi.
 * Chia làm 4 phần:
 *   1. types.ts        — định nghĩa ActionDef
 *   2. resolve.ts      — tính visible/enabled/label theo context
 *   3. use-run-action  — pipeline: confirm → gọi API → toast → invalidate
 *   4. renderers.tsx   — Toolbar / Menu / ContextMenu / Bulk / Cmd+K
 * ==========================================================================*/


/* ----------------------------------------------------------------------------
 * 1. TYPES
 * -------------------------------------------------------------------------*/

import type { LucideIcon } from 'lucide-react'
import type { QueryKey } from '@tanstack/react-query'

/** true = cho phép. string = bị chặn, và string chính là lý do hiển thị trong tooltip. */
export type Enabled = true | string

export interface ConfirmSpec {
  title: string
  description?: string
  confirmLabel?: string
  variant?: 'default' | 'danger'
  /** Bắt gõ đúng chuỗi này mới cho bấm — dùng cho hành động huỷ diệt. */
  typeToConfirm?: string
  /** Ô nhập lý do. required = true thì không nhập không cho bấm. */
  reason?: { required: boolean; label?: string; placeholder?: string }
  /** Checkbox tuỳ chọn kèm theo, ví dụ "xoá cả dữ liệu liên quan". */
  options?: Array<{ key: string; label: string; defaultChecked?: boolean }>
}

/** Dữ liệu người dùng nhập trong dialog confirm, truyền tiếp vào run(). */
export interface ConfirmResult {
  reason?: string
  options?: Record<string, boolean>
}

export interface ActionDef<TCtx> {
  /** Định danh duy nhất, dạng '<resource>.<action>'. Dùng cho analytics và test. */
  id: string

  label: string | ((ctx: TCtx) => string)
  description?: string | ((ctx: TCtx) => string)
  icon?: LucideIcon
  variant?: 'default' | 'danger'

  /** Nhóm để chèn separator trong menu. Cùng group nằm cạnh nhau. */
  group?: string
  order?: number

  /** Phím tắt, cú pháp của thư viện hotkey. VD 'mod+shift+a'. */
  shortcut?: string

  /** Có hiện trong command palette không. Mặc định: có, nếu không phải action theo row. */
  inPalette?: boolean

  // --- Điều kiện hiển thị -------------------------------------------------
  /** Quyền yêu cầu. Thiếu quyền => ẩn hoàn toàn (khác với enabled). */
  permission?: string | string[]
  /** Ẩn hẳn khỏi UI. Dùng khi action không liên quan tới bản ghi này. */
  visible?: (ctx: TCtx) => boolean
  /**
   * Cho phép chạy hay không. Trả string = disable + tooltip lý do.
   * Ưu tiên dùng cái này thay vì visible: user thấy nút mờ + biết vì sao
   * tốt hơn nhiều so với nút biến mất không dấu vết.
   */
  enabled?: (ctx: TCtx) => Enabled

  // --- Thực thi -----------------------------------------------------------
  /** Trả undefined để bỏ qua bước confirm. */
  confirm?: (ctx: TCtx) => ConfirmSpec | undefined
  run: (ctx: TCtx, input: ConfirmResult) => Promise<unknown>

  // --- Sau khi chạy -------------------------------------------------------
  success?: string | ((ctx: TCtx, result: unknown) => string)
  invalidates?: (ctx: TCtx) => QueryKey[]
  onSuccess?: (ctx: TCtx, result: unknown) => void

  /**
   * CỬA THOÁT. Action nào không vừa khuôn (mở wizard nhiều bước, cần state
   * riêng, form phức tạp) thì tự render, bỏ qua toàn bộ pipeline trên.
   * Không có cái này thì registry sẽ trở thành nhà tù.
   */
  render?: (ctx: TCtx, resolved: ResolvedAction<TCtx>) => React.ReactNode
}

export interface ResolvedAction<TCtx> {
  def: ActionDef<TCtx>
  label: string
  visible: boolean
  disabled: boolean
  /** Lý do bị disable, để đổ vào tooltip. */
  reason?: string
  run: () => Promise<void>
  pending: boolean
}


/* ----------------------------------------------------------------------------
 * 2. RESOLVE — tính trạng thái của action theo context
 * -------------------------------------------------------------------------*/

import { useMemo } from 'react'
import { useCan } from '@/lib/auth/use-can'

function evalLabel<TCtx>(v: ActionDef<TCtx>['label'], ctx: TCtx): string {
  return typeof v === 'function' ? v(ctx) : v
}

/** Sắp xếp: theo group rồi order rồi id, để thứ tự menu luôn ổn định. */
function sortActions<TCtx>(a: ActionDef<TCtx>, b: ActionDef<TCtx>) {
  const g = (a.group ?? '').localeCompare(b.group ?? '')
  if (g !== 0) return g
  const o = (a.order ?? 100) - (b.order ?? 100)
  return o !== 0 ? o : a.id.localeCompare(b.id)
}


/* ----------------------------------------------------------------------------
 * 3. PIPELINE — confirm → gọi API → toast → invalidate → xử lý lỗi
 * -------------------------------------------------------------------------*/

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useConfirm } from '@/providers/overlay'
import { getApiError } from '@/lib/api/error'

/**
 * Hook chính. Trả về danh sách action đã resolve, sẵn sàng render.
 *
 *   const actions = useActions(orderActions, { record, me })
 *   <ActionMenu actions={actions} />
 */
export function useActions<TCtx>(
  defs: ActionDef<TCtx>[],
  ctx: TCtx,
): ResolvedAction<TCtx>[] {
  const can = useCan()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const execute = useCallback(
    async (def: ActionDef<TCtx>) => {
      // 3.1 — Confirm (nếu có)
      let input: ConfirmResult = {}
      if (def.confirm) {
        const spec = def.confirm(ctx)
        if (spec) {
          const res = await confirm(spec)
          if (!res.ok) return // user bấm Huỷ
          input = { reason: res.reason, options: res.options }
        }
      }

      // 3.2 — Chạy, với loading state để nút tự disable
      setPendingId(def.id)
      try {
        const result = await def.run(ctx, input)

        // 3.3 — Toast thành công
        const msg =
          typeof def.success === 'function' ? def.success(ctx, result) : def.success
        if (msg) toast.success(msg)

        // 3.4 — Invalidate cache
        def.invalidates?.(ctx).forEach((key) => qc.invalidateQueries({ queryKey: key }))
        def.onSuccess?.(ctx, result)
      } catch (e) {
        // 3.5 — Xử lý lỗi tập trung, đúng theo bảng ánh xạ ở docs/ui-conventions.md
        const err = getApiError(e)
        if (err.status === 403) {
          toast.error('Bạn không có quyền thực hiện thao tác này')
        } else if (err.status === 409) {
          // optimistic locking: bản ghi đã bị người khác sửa
          toast.error('Dữ liệu đã thay đổi, vui lòng tải lại trang')
          def.invalidates?.(ctx).forEach((k) => qc.invalidateQueries({ queryKey: k }))
        } else if (err.code) {
          toast.error(err.message) // lỗi nghiệp vụ có code từ BE
        } else {
          toast.error('Đã xảy ra lỗi', {
            description: `Mã tra cứu: ${err.traceId}`,
            action: { label: 'Copy', onClick: () => navigator.clipboard.writeText(err.traceId) },
          })
        }
      } finally {
        setPendingId(null)
      }
    },
    [ctx, confirm, qc],
  )

  return useMemo(() => {
    return [...defs].sort(sortActions).map((def) => {
      // Thiếu quyền => ẩn hẳn. Không đủ điều kiện nghiệp vụ => disable + lý do.
      const hasPerm = !def.permission || can(def.permission)
      const visible = hasPerm && (def.visible?.(ctx) ?? true)
      const enabled = def.enabled?.(ctx) ?? true

      return {
        def,
        label: evalLabel(def.label, ctx),
        visible,
        disabled: enabled !== true || pendingId === def.id,
        reason: enabled === true ? undefined : enabled,
        pending: pendingId === def.id,
        run: () => execute(def),
      }
    })
  }, [defs, ctx, can, execute, pendingId])
}


/* ----------------------------------------------------------------------------
 * 4. RENDERERS
 * -------------------------------------------------------------------------*/

import { Button } from '@/components/ui/button'
import { DisabledTooltip } from '@/components/common/disabled-tooltip'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
} from '@/components/ui/context-menu'
import { MoreHorizontal, Loader2 } from 'lucide-react'

/** Chèn separator giữa các group khác nhau. */
function withSeparators<TCtx>(items: ResolvedAction<TCtx>[]) {
  const out: Array<ResolvedAction<TCtx> | 'sep'> = []
  let lastGroup: string | undefined
  for (const it of items) {
    if (lastGroup !== undefined && it.def.group !== lastGroup) out.push('sep')
    out.push(it)
    lastGroup = it.def.group
  }
  return out
}

/** 4a. Toolbar — trang detail, thanh nút phía trên. */
export function ActionToolbar<TCtx>({
  actions, ctx, max = 3,
}: { actions: ResolvedAction<TCtx>[]; ctx: TCtx; max?: number }) {
  const visible = actions.filter((a) => a.visible)
  const primary = visible.slice(0, max)
  const overflow = visible.slice(max)

  return (
    <div className="flex items-center gap-2">
      {primary.map((a) =>
        a.def.render ? (
          <span key={a.def.id}>{a.def.render(ctx, a)}</span>
        ) : (
          // DisabledTooltip bọc <span> bên trong — Radix không bắt được
          // event trên <button disabled>, đây là bug kinh điển.
          <DisabledTooltip key={a.def.id} reason={a.reason}>
            <Button
              variant={a.def.variant === 'danger' ? 'destructive' : 'default'}
              disabled={a.disabled}
              onClick={a.run}
            >
              {a.pending ? <Loader2 className="animate-spin" /> : a.def.icon && <a.def.icon />}
              {a.label}
            </Button>
          </DisabledTooltip>
        ),
      )}
      {overflow.length > 0 && <ActionMenu actions={overflow} ctx={ctx} />}
    </div>
  )
}

/** 4b. Menu ⋯ — dùng cho từng dòng trong DataTable. */
export function ActionMenu<TCtx>({
  actions, ctx,
}: { actions: ResolvedAction<TCtx>[]; ctx: TCtx }) {
  const visible = actions.filter((a) => a.visible)
  if (visible.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon"><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {withSeparators(visible).map((it, i) =>
          it === 'sep' ? (
            <DropdownMenuSeparator key={`sep-${i}`} />
          ) : (
            <DisabledTooltip key={it.def.id} reason={it.reason} side="left">
              <DropdownMenuItem
                disabled={it.disabled}
                onSelect={(e) => { e.preventDefault(); it.run() }}
                className={it.def.variant === 'danger' ? 'text-destructive' : undefined}
              >
                {it.def.icon && <it.def.icon />}
                {it.label}
                {it.def.shortcut && (
                  <kbd className="ml-auto text-xs opacity-60">{it.def.shortcut}</kbd>
                )}
              </DropdownMenuItem>
            </DisabledTooltip>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 4c. Context menu — chuột phải trên row. Dân nghiệp vụ quen desktop rất thích. */
export function ActionContextMenu<TCtx>({
  actions, children,
}: { actions: ResolvedAction<TCtx>[]; children: React.ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {actions.filter((a) => a.visible).map((a) => (
          <ContextMenuItem key={a.def.id} disabled={a.disabled} onSelect={a.run}>
            {a.def.icon && <a.def.icon />}
            {a.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}


/* ----------------------------------------------------------------------------
 * 5. BULK ACTION — chạy trên nhiều bản ghi, báo lỗi từng dòng
 * -------------------------------------------------------------------------*/

export interface BulkResult {
  succeeded: number
  failed: Array<{ id: string; label: string; reason: string }>
}

export interface BulkActionDef<TRow> {
  id: string
  label: string
  icon?: LucideIcon
  variant?: 'default' | 'danger'
  permission?: string | string[]

  /** Lọc ra những dòng thực sự chạy được, kèm lý do loại trừ. */
  eligible?: (rows: TRow[]) => { ok: TRow[]; skipped: Array<{ row: TRow; reason: string }> }

  confirm?: (rows: TRow[]) => ConfirmSpec
  /** BE nên trả về kết quả từng dòng thay vì fail toàn bộ. */
  run: (rows: TRow[], input: ConfirmResult) => Promise<BulkResult>
  invalidates?: () => QueryKey[]
}

/**
 * Điểm mấu chốt: bulk action KHÔNG được chỉ toast "thành công".
 * Xoá 23 dòng mà 3 dòng thất bại thì phải mở result dialog liệt kê rõ
 * dòng nào hỏng vì lý do gì — nếu không user sẽ tưởng đã xoá hết.
 */
export function useBulkAction<TRow>(def: BulkActionDef<TRow>) {
  const confirm = useConfirm()
  const showResult = useBulkResultDialog()
  const qc = useQueryClient()

  return useCallback(
    async (rows: TRow[]) => {
      const { ok, skipped } = def.eligible?.(rows) ?? { ok: rows, skipped: [] }
      if (ok.length === 0) {
        toast.error('Không có bản ghi nào hợp lệ để thực hiện')
        return
      }

      if (def.confirm) {
        const res = await confirm(def.confirm(ok))
        if (!res.ok) return
      }

      const result = await def.run(ok, {})
      def.invalidates?.().forEach((k) => qc.invalidateQueries({ queryKey: k }))

      if (result.failed.length === 0 && skipped.length === 0) {
        toast.success(`Đã xử lý ${result.succeeded} bản ghi`)
      } else {
        await showResult({ ...result, skipped })
      }
    },
    [def, confirm, showResult, qc],
  )
}


/* ----------------------------------------------------------------------------
 * 6. ĐĂNG KÝ VÀO COMMAND PALETTE + PHÍM TẮT
 *    Gần như miễn phí: palette chỉ là một renderer nữa của cùng danh sách.
 * -------------------------------------------------------------------------*/

import { useHotkeys } from 'react-hotkeys-hook'
import { useRegisterCommands } from '@/providers/command-palette'

export function useActionShortcuts<TCtx>(actions: ResolvedAction<TCtx>[]) {
  const withKeys = actions.filter((a) => a.def.shortcut && a.visible && !a.disabled)

  useHotkeys(
    withKeys.map((a) => a.def.shortcut!).join(','),
    (_e, handler) => {
      const hit = withKeys.find((a) => a.def.shortcut === handler.keys?.join('+'))
      hit?.run()
    },
    { enableOnFormTags: false },
    [withKeys],
  )

  useRegisterCommands(
    withKeys.length > 0 ? 'actions' : null,
    actions
      .filter((a) => a.visible && a.def.inPalette !== false)
      .map((a) => ({
        id: a.def.id,
        label: a.label,
        icon: a.def.icon,
        disabled: a.disabled,
        onSelect: a.run,
      })),
  )
}


/* ============================================================================
 * VÍ DỤ SỬ DỤNG
 * ==========================================================================*/

/* --- features/orders/actions.ts -------------------------------------------
export interface OrderCtx { record: Order; me: CurrentUser }

export const orderActions: ActionDef<OrderCtx>[] = [
  {
    id: 'order.approve',
    label: 'Duyệt đơn',
    icon: CheckCircle,
    group: '1-workflow',
    order: 10,
    shortcut: 'mod+shift+a',
    permission: 'order:approve',
    enabled: ({ record, me }) =>
      record.status !== 'pending'      ? 'Đơn không ở trạng thái chờ duyệt'
      : record.createdById === me.id   ? 'Không thể tự duyệt đơn của mình'
      : record.total > me.approvalLimit ? `Vượt hạn mức duyệt (${fmt(me.approvalLimit)})`
      : true,
    confirm: ({ record }) => ({
      title: `Duyệt đơn ${record.code}?`,
      description: `Tổng giá trị ${fmt(record.total)}`,
      reason: { required: false, label: 'Ghi chú duyệt' },
    }),
    run: ({ record }, { reason }) => api.orders.approve(record.id, { reason }),
    success: 'Đã duyệt đơn',
    invalidates: ({ record }) => [['orders'], ['orders', record.id]],
  },
  {
    id: 'order.reject',
    label: 'Từ chối',
    icon: XCircle,
    variant: 'danger',
    group: '1-workflow',
    order: 20,
    permission: 'order:approve',
    enabled: ({ record }) => record.status === 'pending' || 'Đơn không ở trạng thái chờ duyệt',
    confirm: () => ({
      title: 'Từ chối đơn hàng?',
      variant: 'danger',
      // Bắt buộc nhập lý do — nghiệp vụ VN gần như luôn yêu cầu
      reason: { required: true, label: 'Lý do từ chối' },
    }),
    run: ({ record }, { reason }) => api.orders.reject(record.id, { reason: reason! }),
    success: 'Đã từ chối đơn',
    invalidates: ({ record }) => [['orders'], ['orders', record.id]],
  },
  {
    id: 'order.export-pdf',
    label: 'Xuất PDF',
    icon: FileDown,
    group: '2-export',
    permission: 'order:read',
    run: ({ record }) => api.orders.exportPdf(record.id),
  },
  {
    id: 'order.delete',
    label: 'Xoá',
    icon: Trash2,
    variant: 'danger',
    group: '9-danger',
    permission: 'order:delete',
    enabled: ({ record }) =>
      record.status === 'draft' || 'Chỉ xoá được đơn ở trạng thái nháp',
    confirm: ({ record }) => ({
      title: 'Xoá đơn hàng?',
      variant: 'danger',
      typeToConfirm: record.code,   // bắt gõ đúng mã đơn
    }),
    run: ({ record }) => api.orders.remove(record.id),
    success: 'Đã chuyển vào thùng rác',
    invalidates: () => [['orders']],
  },
]
--------------------------------------------------------------------------- */

/* --- Trang detail ----------------------------------------------------------
function OrderDetailPage({ id }: { id: string }) {
  const { data: record } = useOrder(id)
  const me = useCurrentUser()
  const actions = useActions(orderActions, { record, me })
  useActionShortcuts(actions)

  return (
    <PageHeader title={record.code} extra={<ActionToolbar actions={actions} ctx={{ record, me }} />} />
  )
}
--------------------------------------------------------------------------- */

/* --- Cột action trong DataTable --------------------------------------------
{
  id: 'actions',
  cell: ({ row }) => {
    const ctx = { record: row.original, me }
    return <ActionMenu actions={useActions(orderActions, ctx)} ctx={ctx} />
  },
}
--------------------------------------------------------------------------- */

/* --- Test ma trận quyền phía FE --------------------------------------------
 * Registry là plain object nên test rất rẻ — đây là phiên bản FE của
 * test ma trận quyền ở BE.
 *
 * describe.each([
 *   ['admin',    'order.approve', { visible: true,  disabled: false }],
 *   ['staff',    'order.approve', { visible: false }],
 *   ['manager',  'order.approve', { visible: true,  disabled: true, reason: /hạn mức/ }],
 * ])('%s → %s', (role, actionId, expected) => { ... })
--------------------------------------------------------------------------- */
