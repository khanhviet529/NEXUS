import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * [CORE] Chặn ở tầng endpoint — spec §4.4.
 * MỌI endpoint không @Public phải có decorator này — CI check #5 quét metadata
 * toàn bộ route và đỏ nếu thiếu.
 */
export const RequirePermission = (permission: string) =>
  SetMetadata(PERMISSION_KEY, permission);
