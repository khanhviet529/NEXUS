'use client';

import * as React from 'react';
import * as Ctx from '@radix-ui/react-context-menu';
import { cn } from '@/lib/utils';

export const ContextMenu = Ctx.Root;
export const ContextMenuTrigger = Ctx.Trigger;

export function ContextMenuContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Ctx.Content>) {
  return (
    <Ctx.Portal>
      <Ctx.Content
        className={cn(
          'min-w-44 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md',
          className,
        )}
        style={{ zIndex: 'var(--z-dropdown)' as never }}
        {...props}
      />
    </Ctx.Portal>
  );
}

export function ContextMenuItem({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Ctx.Item>) {
  return (
    <Ctx.Item
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  );
}
