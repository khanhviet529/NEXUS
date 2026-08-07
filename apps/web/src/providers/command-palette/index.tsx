'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { LucideIcon } from 'lucide-react';
import { CornerDownLeft, FileText, Package, ShoppingCart, User } from 'lucide-react';
import { searchControllerSearch } from '@nexus/api-client';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

/* ============================================================
 * Command palette (§5.9 + §5C.7) — GĐ8b.
 * Hai nguồn lệnh:
 *  1. Action đăng ký động qua useRegisterCommands (Action Registry)
 *  2. Global search /search — debounce, nhóm theo module, BE đã áp quyền
 * ============================================================ */

export interface PaletteCommand {
  id: string;
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
  onSelect: () => void;
}

interface PaletteContextValue {
  register: (scope: string, commands: PaletteCommand[]) => void;
  unregister: (scope: string) => void;
  open: () => void;
}

const PaletteContext = React.createContext<PaletteContextValue | null>(null);

/** Action Registry gọi hook này — palette chỉ là MỘT renderer nữa (§5.9) */
export function useRegisterCommands(scope: string | null, commands: PaletteCommand[]): void {
  const ctx = React.useContext(PaletteContext);
  if (!ctx) throw new Error('useRegisterCommands phải nằm trong <CommandPaletteProvider>');
  const { register, unregister } = ctx;
  // So sánh theo nội dung — commands là mảng mới mỗi render
  const key = JSON.stringify(commands.map((c) => [c.id, c.label, c.disabled]));
  React.useEffect(() => {
    if (!scope) return;
    register(scope, commands);
    return () => unregister(scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, key, register, unregister]);
}

export function useCommandPalette(): { open: () => void } {
  const ctx = React.useContext(PaletteContext);
  if (!ctx) throw new Error('useCommandPalette phải nằm trong <CommandPaletteProvider>');
  return { open: ctx.open };
}

const GROUP_ICON: Record<string, LucideIcon> = {
  Product: Package,
  Customer: User,
  Order: ShoppingCart,
  User: User,
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setV(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return v;
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('palette');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [scopes, setScopes] = React.useState<Record<string, PaletteCommand[]>>({});

  const register = React.useCallback((scope: string, commands: PaletteCommand[]) => {
    setScopes((s) => ({ ...s, [scope]: commands }));
  }, []);
  const unregister = React.useCallback((scope: string) => {
    setScopes((s) => {
      const { [scope]: _drop, ...rest } = s;
      return rest;
    });
  }, []);
  const openPalette = React.useCallback(() => setOpen(true), []);

  // Ctrl/Cmd+K — hotkey tay, không thêm dependency
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const debouncedQ = useDebounced(q, 250);
  const search = useQuery({
    queryKey: ['global-search', debouncedQ],
    queryFn: () => searchControllerSearch({ q: debouncedQ }),
    enabled: open && debouncedQ.trim().length >= 2,
    staleTime: 15_000,
  });

  const actionCommands = Object.values(scopes).flat();
  const filtered = q.trim()
    ? actionCommands.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase()))
    : actionCommands;
  const groups =
    (search.data as { groups?: Array<{ entity: string; items: Array<{ id: string; code: string; label: string; href: string }> }> } | undefined)
      ?.groups ?? [];

  return (
    <PaletteContext.Provider value={{ register, unregister, open: openPalette }}>
      {children}
      <CommandDialog open={open} onOpenChange={setOpen} title={t('placeholder')}>
        <CommandInput value={q} onValueChange={setQ} placeholder={t('placeholder')} />
        <CommandList>
          {filtered.length === 0 && groups.length === 0 && (
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              {t('hint')}
            </CommandEmpty>
          )}
          {filtered.length > 0 && (
            <CommandGroup heading={t('actions')}>
              {filtered.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  disabled={c.disabled}
                  onSelect={() => {
                    setOpen(false);
                    c.onSelect();
                  }}
                >
                  {c.icon ? <c.icon /> : <CornerDownLeft />}
                  {c.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {groups.map((g) => {
            const Icon = GROUP_ICON[g.entity] ?? FileText;
            return (
              <CommandGroup key={g.entity} heading={`${t('results')} · ${g.entity}`}>
                {g.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${g.entity}-${item.id}`}
                    onSelect={() => {
                      setOpen(false);
                      router.push(item.href);
                    }}
                  >
                    <Icon />
                    <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </PaletteContext.Provider>
  );
}
