'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OverlayProvider } from '@/providers/overlay';
import { CommandPaletteProvider } from '@/providers/command-palette';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <NuqsAdapter>
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={200}>
          <OverlayProvider>
            <CommandPaletteProvider>{children}</CommandPaletteProvider>
          </OverlayProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </NuqsAdapter>
  );
}
