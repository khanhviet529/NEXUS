'use client';

import * as React from 'react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export const DropdownMenu = Dropdown.Root;
export const DropdownMenuTrigger = Dropdown.Trigger;

export function DropdownMenuContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Dropdown.Content>) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content
        sideOffset={4}
        className={cn(
          'min-w-44 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md',
          className,
        )}
        style={{ zIndex: 'var(--z-dropdown)' as never }}
        {...props}
      />
    </Dropdown.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Dropdown.Item>) {
  return (
    <Dropdown.Item
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Dropdown.Separator>) {
  return <Dropdown.Separator className={cn('my-1 h-px bg-border', className)} {...props} />;
}
