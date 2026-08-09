'use client';

import { useProjectUI } from '../use-project-ui';
import type { ShellId } from '../registry';
import { SidebarShell } from './sidebar-shell';
import type { ShellComponent, ShellProps } from './types';

/**
 * Router shell — fe-preset-system §5.2. Hai luật, cả hai đều là bẫy im lặng:
 *
 * 1. `SHELLS` CHỈ chứa shell có trong `ShellId`. Không `NotImplementedShell`,
 *    không ném lỗi runtime — thứ chưa dùng được thì TYPE không cho chọn. Mở
 *    rộng `ShellId` và thêm entry ở CÙNG MỘT PR với việc implement shell đó.
 *
 * 2. Đọc `ui.behavior.shell`, KHÔNG đọc `PRESETS[id].behavior.shell`. Đọc
 *    preset gốc thì `PROJECT_UI.overrides.shell` vô tác dụng: cấu hình đúng,
 *    không có hiệu lực, và không có gì đỏ.
 */
const SHELLS = {
  sidebar: SidebarShell,
} satisfies Record<ShellId, ShellComponent>;

export function AppShell(props: ShellProps) {
  const ui = useProjectUI();
  const Shell = SHELLS[ui.behavior.shell];
  return <Shell {...props} />;
}
