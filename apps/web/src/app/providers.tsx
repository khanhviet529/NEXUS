'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OverlayProvider } from '@/providers/overlay';
import { CommandPaletteProvider } from '@/providers/command-palette';
import { ProjectUIProvider } from '@/design-system/use-project-ui';
import type { ResolvedUI } from '@/design-system/registry';

export function Providers({ children, ui }: { children: React.ReactNode; ui: ResolvedUI }) {
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
        <ProjectUIProvider value={ui}>
          <TooltipProvider delayDuration={200}>
            <OverlayProvider>
              <CommandPaletteProvider>{children}</CommandPaletteProvider>
            </OverlayProvider>
          </TooltipProvider>
        </ProjectUIProvider>
      </QueryClientProvider>
    </NuqsAdapter>
  );
}
