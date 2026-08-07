'use client';

import * as React from 'react';
import { Loader2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DisabledTooltip } from '@/components/common/disabled-tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useRegisterCommands } from '@/providers/command-palette';
import type { ResolvedAction } from './types';

/** Chèn separator giữa các group khác nhau (§5.9) */
function withSeparators<TCtx>(items: ResolvedAction<TCtx>[]) {
  const out: Array<ResolvedAction<TCtx> | 'sep'> = [];
  let lastGroup: string | undefined;
  for (const it of items) {
    if (lastGroup !== undefined && it.def.group !== lastGroup) out.push('sep');
    out.push(it);
    lastGroup = it.def.group;
  }
  return out;
}

/** Nơi 1 — Toolbar (trang detail / đầu trang list) */
export function ActionToolbar<TCtx>({
  actions,
  ctx,
  max = 3,
}: {
  actions: ResolvedAction<TCtx>[];
  ctx: TCtx;
  max?: number;
}) {
  const visible = actions.filter((a) => a.visible);
  const primary = visible.slice(0, max);
  const overflow = visible.slice(max);
  return (
    <div className="flex items-center gap-2">
      {primary.map((a) =>
        a.def.render ? (
          <span key={a.def.id}>{a.def.render(ctx, a)}</span>
        ) : (
          <DisabledTooltip key={a.def.id} reason={a.reason}>
            <Button
              variant={a.def.variant === 'danger' ? 'destructive' : 'default'}
              disabled={a.disabled}
              onClick={() => void a.run()}
            >
              {a.pending ? <Loader2 className="animate-spin" /> : a.def.icon && <a.def.icon />}
              {a.label}
            </Button>
          </DisabledTooltip>
        ),
      )}
      {overflow.length > 0 && <ActionMenu actions={overflow} />}
    </div>
  );
}

/** Nơi 2 — Menu ⋯ theo từng dòng */
export function ActionMenu<TCtx>({ actions }: { actions: ResolvedAction<TCtx>[] }) {
  const visible = actions.filter((a) => a.visible);
  if (visible.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Hành động">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {withSeparators(visible).map((it, i) =>
          it === 'sep' ? (
            <DropdownMenuSeparator key={`sep-${i}`} />
          ) : (
            <DisabledTooltip key={it.def.id} reason={it.reason} side="left">
              <DropdownMenuItem
                disabled={it.disabled}
                onSelect={(e) => {
                  e.preventDefault();
                  void it.run();
                }}
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
  );
}

/** Nơi 3 — Context menu chuột phải trên row */
export function ActionContextMenu<TCtx>({
  actions,
  children,
}: {
  actions: ResolvedAction<TCtx>[];
  children: React.ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {actions
          .filter((a) => a.visible)
          .map((a) => (
            <ContextMenuItem
              key={a.def.id}
              disabled={a.disabled}
              onSelect={() => void a.run()}
              className={a.def.variant === 'danger' ? 'text-destructive' : undefined}
            >
              {a.def.icon && <a.def.icon />}
              {a.label}
            </ContextMenuItem>
          ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Chuẩn hoá 'mod+shift+a' → so với KeyboardEvent */
function matchShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts[parts.length - 1]!;
  const needMod = parts.includes('mod');
  const needShift = parts.includes('shift');
  const needAlt = parts.includes('alt');
  return (
    e.key.toLowerCase() === key &&
    (!needMod || e.ctrlKey || e.metaKey) &&
    (!needShift || e.shiftKey) &&
    (!needAlt || e.altKey)
  );
}

/** Nơi 4 — Cmd+K + phím tắt: palette chỉ là MỘT renderer nữa (§5.9) */
export function useActionShortcuts<TCtx>(actions: ResolvedAction<TCtx>[]): void {
  const withKeys = actions.filter((a) => a.def.shortcut && a.visible && !a.disabled);

  React.useEffect(() => {
    if (withKeys.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const hit = withKeys.find((a) => matchShortcut(e, a.def.shortcut!));
      if (hit) {
        e.preventDefault();
        void hit.run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [withKeys]);

  useRegisterCommands(
    'actions',
    actions
      .filter((a) => a.visible && a.def.inPalette !== false)
      .map((a) => ({
        id: a.def.id,
        label: a.label,
        icon: a.def.icon,
        disabled: a.disabled,
        onSelect: () => void a.run(),
      })),
  );
}
