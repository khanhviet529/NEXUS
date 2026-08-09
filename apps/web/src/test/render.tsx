import * as React from 'react';
import {
  render as rtlRender,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OverlayProvider } from '@/providers/overlay';
import { ProjectUIProvider } from '@/design-system/use-project-ui';
import { resolveProjectUI } from '@/design-system/resolve-project-ui';
import { PROJECT_UI } from '@/config/project-ui';
import type { UserUIPrefs } from '@/design-system/registry';
import messages from '@/messages/vi.json';

/**
 * [CORE] Helper render dùng chung — bọc ĐÚNG các provider của app thật
 * (query, i18n, tooltip, overlay). Test không tự dựng provider rời rạc,
 * vì lệch provider là nguồn của "test xanh nhưng app đỏ".
 *
 * KHÔNG bọc CommandPaletteProvider mặc định: nó tự gọi /search: test nào cần
 * thì bọc riêng.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderOptions & { queryClient?: QueryClient; userPrefs?: UserUIPrefs },
): RenderResult & { queryClient: QueryClient } {
  const queryClient =
    options?.queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });

  // Dùng CHÍNH chuỗi phân giải của app (§2.3). Test truyền `userPrefs` để kiểm
  // hành vi ở density khác — không tự dựng ResolvedUI giả, vì object giả sẽ
  // không phát hiện được khi chuỗi phân giải đổi.
  const resolvedUI = resolveProjectUI(PROJECT_UI, options?.userPrefs);

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <NextIntlClientProvider locale="vi" messages={messages}>
        <QueryClientProvider client={queryClient}>
          <ProjectUIProvider value={resolvedUI}>
            <TooltipProvider>
              <OverlayProvider>{children}</OverlayProvider>
            </TooltipProvider>
          </ProjectUIProvider>
        </QueryClientProvider>
      </NextIntlClientProvider>
    );
  }

  return { queryClient, ...rtlRender(ui, { wrapper: Wrapper, ...options }) };
}

export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
