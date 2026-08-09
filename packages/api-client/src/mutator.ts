import axios, { type AxiosRequestConfig } from 'axios';
import type { ApiErrorBody } from '@nexus/shared';

/**
 * Axios instance dùng chung cho code sinh bởi orval.
 * - withCredentials: web dùng httpOnly cookie (§4.3b), KHÔNG đụng token ở JS
 * - openapi.json đã chứa prefix /api/v1 nên baseURL chỉ là origin
 * - Interceptor 401→refresh (single-flight §5.3) bổ sung ở GĐ2 cùng refresh token
 */
export const apiAxios = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export const apiMutator = <T>(config: AxiosRequestConfig): Promise<T> =>
  apiAxios.request<T>(config).then((r) => r.data);

/** Bóc ApiErrorBody từ lỗi axios — FE xử lý theo `code`, KHÔNG theo `message` (§3.6) */
export function getApiError(error: unknown): ApiErrorBody & { status: number } {
  if (axios.isAxiosError(error) && error.response) {
    const body = error.response.data as Partial<ApiErrorBody>;
    return {
      code: body.code ?? 'COMMON.INTERNAL_ERROR',
      message: body.message ?? 'Đã xảy ra lỗi',
      details: body.details ?? null,
      nextAction: body.nextAction, // §3.6 — mã việc nên làm tiếp
      traceId: body.traceId ?? 'no-trace',
      timestamp: body.timestamp ?? new Date().toISOString(),
      status: error.response.status,
    };
  }
  return {
    code: 'COMMON.INTERNAL_ERROR',
    message: 'Không kết nối được máy chủ',
    details: null,
    traceId: 'no-trace',
    timestamp: new Date().toISOString(),
    status: 0,
  };
}
