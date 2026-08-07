import { HttpException } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@nexus/shared';

/**
 * [CORE] Exception nghiệp vụ — spec §3.6.
 * Mã lỗi CHỈ lấy từ error-codes.ts (CLAUDE.md §3: không tự nghĩ mã lỗi).
 */
export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | Record<string, string[]> | null;

  constructor(
    code: ErrorCode,
    options?: {
      /** Ghi đè message mặc định — chỉ để hiển thị, FE không được rẽ nhánh theo nó */
      message?: string;
      details?: Record<string, unknown> | Record<string, string[]>;
    },
  ) {
    const def = ERROR_CODES[code];
    super(options?.message ?? def.message, def.status);
    this.code = code;
    this.details = options?.details ?? null;
  }
}
