import { http, HttpResponse } from 'msw';

/**
 * [CORE] Tầng 2 — MSW: chặn ở TẦNG NETWORK, không mock module api-client.
 * Lý do: mock module thì đổi tên hàm sinh tự động là test xanh giả; chặn
 * network thì test đi đúng đường axios + interceptor + error mapping (§3.6).
 *
 * Hình dạng response PHẢI khớp contract §3.2/§3.6 — sai chỗ này thì test
 * xanh mà production đỏ.
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const paginated = <T>(data: T[], page = 1, limit = 20) => ({
  data,
  meta: {
    page,
    limit,
    total: data.length,
    totalPages: Math.max(1, Math.ceil(data.length / limit)),
    hasNext: false,
  },
});

/** Lỗi chuẩn §3.6 — dùng cho test map 422 vào field */
export const apiError = (
  code: string,
  status: number,
  details?: Record<string, string[]>,
) =>
  HttpResponse.json(
    {
      code,
      message: 'Lỗi kiểm thử',
      details: details ?? null,
      traceId: 'test-trace-id',
      timestamp: new Date().toISOString(),
    },
    { status },
  );

export const handlers = [
  http.get(`${API}/api/v1/me`, () =>
    HttpResponse.json({
      id: 'user-1',
      email: 'staff@tenant-a.local',
      fullName: 'Nhân viên A',
      membershipId: 'mem-1',
      tenant: { id: 'tenant-a', code: 'TENANT-A', name: 'Tenant A' },
      orgUnit: null,
      roles: [{ code: 'STAFF', name: 'STAFF' }],
      permissions: ['order:read', 'order:create', 'customer:read', 'customer:create'],
    }),
  ),

  http.get(`${API}/api/v1/customers`, () =>
    HttpResponse.json(
      paginated([
        { id: 'cus-1', code: 'KH001', name: 'Công ty A', taxCode: '0312345678', version: 1, createdAt: '2026-08-01T00:00:00.000Z' },
        { id: 'cus-2', code: 'KH002', name: 'Công ty B', taxCode: null, version: 1, createdAt: '2026-08-02T00:00:00.000Z' },
      ]),
    ),
  ),

  http.get(`${API}/api/v1/products`, () =>
    HttpResponse.json(
      paginated([
        { id: 'prd-1', code: 'SP001', name: 'Sản phẩm A', baseUom: 'CAI', version: 1, createdAt: '2026-08-01T00:00:00.000Z' },
      ]),
    ),
  ),

  http.get(`${API}/api/v1/orders`, () =>
    HttpResponse.json(
      paginated([
        {
          id: 'ord-1',
          code: 'ORD-2026-00001',
          status: 'PENDING',
          currency: 'VND',
          customer: { id: 'cus-1', code: 'KH001', name: { vi: 'Công ty A' } },
          subtotal: '200000',
          discountTotal: '0',
          taxTotal: '20000',
          total: '220000',
          version: 2,
          approvedAt: null,
          createdById: 'user-1',
          createdAt: '2026-08-05T00:00:00.000Z',
          items: [],
        },
      ]),
    ),
  ),
];
