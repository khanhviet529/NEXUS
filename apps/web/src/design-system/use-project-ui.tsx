'use client';

import * as React from 'react';
import type { ResolvedUI } from './registry';

/**
 * [CORE] Cửa DUY NHẤT để component đọc cấu hình UI (fe-preset-system §12).
 *
 * Trả về `ResolvedUI` — đã áp overrides và user preference. Component KHÔNG
 * được import `PROJECT_UI` trực tiếp: làm vậy thì Storybook và trang preview
 * không override được, và `?preset=` mất tác dụng.
 *
 * Cũng KHÔNG rẽ nhánh theo id preset (`if (preset === 'enterprise')`). Đọc
 * `ui.behavior.table.rowHeight` — thêm preset thứ hai mới không phải sửa
 * component nào.
 */
const ProjectUIContext = React.createContext<ResolvedUI | null>(null);

export function ProjectUIProvider({
  value,
  children,
}: {
  value: ResolvedUI;
  children: React.ReactNode;
}) {
  return <ProjectUIContext.Provider value={value}>{children}</ProjectUIContext.Provider>;
}

export function useProjectUI(): ResolvedUI {
  const ui = React.useContext(ProjectUIContext);
  if (!ui) {
    throw new Error(
      'useProjectUI phải nằm trong <ProjectUIProvider>. ' +
        'Ở test dùng renderWithProviders (src/test/render.tsx); ở story dùng decorator mặc định.',
    );
  }
  return ui;
}
