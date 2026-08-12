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
      memberships: [{ id: 'tenant-a', code: 'TENANT-A', name: 'Tenant A' }],
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
          // §3.10: name ĐÃ resolve theo locale (contract đổi ở V9)
          customer: { id: 'cus-1', code: 'KH001', name: 'Công ty A' },
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

  // ---- V9: trang chi tiết đơn ----
  http.get(`${API}/api/v1/orders/:id`, ({ params }) =>
    HttpResponse.json({
      id: String(params.id),
      code: 'ORD-2026-00001',
      status: 'PENDING',
      currency: 'VND',
      customer: { id: 'cus-1', code: 'KH001', name: 'Công ty A' },
      subtotal: '245000',
      discountTotal: '5000',
      taxTotal: '24500',
      total: '269500',
      margin: '45000', // có mặt = user có field:cost — BE quyết (§4.4c)
      version: 2,
      approvedAt: null,
      createdById: 'user-1',
      createdAt: '2026-08-05T00:00:00.000Z',
      items: [
        {
          id: 'item-1',
          productId: 'prd-1',
          productNameSnapshot: 'Sản phẩm A',
          quantity: '2',
          uom: 'CAI',
          unitPrice: '100000',
          discountPercent: '0',
          taxRate: '10',
          amount: '220000',
          lineNo: 1,
        },
        {
          id: 'item-2',
          productId: 'prd-2',
          productNameSnapshot: 'Sản phẩm B (đã đổi tên sau khi tạo đơn)',
          quantity: '1',
          uom: 'HOP',
          unitPrice: '50000',
          discountPercent: '10',
          taxRate: '10',
          amount: '49500',
          lineNo: 2,
        },
      ],
    }),
  ),

  http.get(`${API}/api/v1/audit-logs`, () =>
    HttpResponse.json(
      paginated([
        {
          id: 'aud-2',
          entity: 'Order',
          entityId: 'ord-1',
          action: 'SUBMIT',
          actorId: 'user-1',
          actorName: 'Nhân viên A',
          before: { status: 'DRAFT' },
          after: { status: 'PENDING' },
          traceId: 't-2',
          createdAt: '2026-08-05T01:00:00.000Z',
        },
        {
          id: 'aud-1',
          entity: 'Order',
          entityId: 'ord-1',
          action: 'CREATE',
          actorId: 'user-1',
          actorName: 'Nhân viên A',
          before: null,
          after: { code: 'ORD-2026-00001' },
          traceId: 't-1',
          createdAt: '2026-08-05T00:00:00.000Z',
        },
      ]),
    ),
  ),

  http.get(`${API}/api/v1/files/by-entity/:entity/:entityId`, () =>
    HttpResponse.json([
      {
        attachmentId: 'att-1',
        fileId: 'file-1',
        filename: 'bao-gia.pdf',
        mime: 'application/pdf',
        size: 245_760,
        category: null,
        createdAt: '2026-08-05T00:30:00.000Z',
      },
    ]),
  ),

  http.get(`${API}/api/v1/search`, () => HttpResponse.json({ groups: [] })),

  // Phase 4b — inventory + import wizard
  http.get(`${API}/api/v1/inventory/balances`, () =>
    HttpResponse.json([
      {
        warehouseId: 'wh-1',
        warehouseCode: 'KHO-A',
        productId: 'prd-1',
        productCode: 'SP-001',
        productName: 'Sản phẩm A',
        lotId: '00000000-0000-0000-0000-000000000000',
        onHand: '10',
        reserved: '2',
        available: '8',
        inTransit: '0',
        version: 3,
      },
    ]),
  ),
  http.get(`${API}/api/v1/inventory/warehouses`, () =>
    HttpResponse.json([{ id: 'wh-1', code: 'KHO-A', name: 'Kho trung tâm' }]),
  ),
  http.post(`${API}/api/v1/inventory/receipts`, () =>
    HttpResponse.json({ movementId: 'mv-1', duplicate: false }, { status: 201 }),
  ),
  http.post(`${API}/api/v1/inventory/issues`, () =>
    HttpResponse.json({ movementId: 'mv-2', duplicate: false }, { status: 201 }),
  ),
  http.post(`${API}/api/v1/products/import`, () =>
    HttpResponse.json({ jobId: 'job-1', totalRows: 2 }, { status: 202 }),
  ),
  http.get(`${API}/api/v1/import-jobs/:id`, () =>
    HttpResponse.json({
      id: 'job-1',
      status: 'COMPLETED',
      totalRows: 2,
      validRows: 2,
      errorRows: 0,
      lastProcessedRow: 2,
    }),
  ),
  http.get(`${API}/api/v1/import-jobs/:id/errors`, () => HttpResponse.json([])),

  // Phase 4a — reports
  http.get(`${API}/api/v1/reports`, () =>
    HttpResponse.json([{ id: 'sales-by-customer', name: 'Doanh thu theo khách hàng' }]),
  ),
  http.get(`${API}/api/v1/reports/:id/meta`, () =>
    HttpResponse.json({
      id: 'sales-by-customer',
      name: 'Doanh thu theo khách hàng',
      params: [{ key: 'period', type: 'dateRange', label: 'Khoảng ngày', required: true }],
      columns: [
        { key: 'customerCode', label: 'Mã KH' },
        { key: 'customerName', label: 'Khách hàng' },
        { key: 'revenue', label: 'Doanh thu', type: 'money', summary: 'sum' },
      ],
    }),
  ),
  http.post(`${API}/api/v1/reports/:id/run`, () =>
    HttpResponse.json({
      columns: [
        { key: 'customerCode', label: 'Mã KH' },
        { key: 'customerName', label: 'Khách hàng' },
        { key: 'revenue', label: 'Doanh thu', type: 'money', summary: 'sum' },
      ],
      rows: [
        { customerCode: 'KH-01', customerName: 'Khách A', revenue: '1200000' },
        { customerCode: 'KH-02', customerName: 'Khách B', revenue: '800000' },
      ],
      summary: { revenue: '2000000' },
      drilldowns: ['/orders?filter[customerId][eq]=c-1', null],
      cached: false,
    }),
  ),

  // Phase 2b — admin/tenants + tenants/current + me/sessions
  http.get(`${API}/api/v1/admin/tenants`, () =>
    HttpResponse.json([
      {
        id: 'tenant-a',
        code: 'TENANT-A',
        name: 'Tenant A',
        status: 'ACTIVE',
        memberCount: 5,
        createdAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 'tenant-b',
        code: 'TENANT-B',
        name: 'Tenant B',
        status: 'SUSPENDED',
        memberCount: 2,
        createdAt: '2026-08-02T00:00:00.000Z',
      },
    ]),
  ),
  http.get(`${API}/api/v1/tenants/current`, () =>
    HttpResponse.json({
      id: 'tenant-a',
      code: 'TENANT-A',
      name: 'Tenant A',
      status: 'ACTIVE',
      defaultLocale: 'vi',
      defaultTimezone: 'Asia/Ho_Chi_Minh',
      branding: { primaryColor: '#0ea5e9' },
      features: [
        { featureKey: 'module.approvals', enabled: true, quota: null },
        { featureKey: 'module.webhooks', enabled: false, quota: null },
      ],
    }),
  ),
  http.get(`${API}/api/v1/me/sessions`, () =>
    HttpResponse.json([
      {
        id: 'ses-1',
        device: 'Chrome trên Windows',
        ip: '203.0.113.10',
        userAgent: 'Mozilla/5.0',
        createdAt: '2026-08-10T08:00:00.000Z',
        lastSeenAt: '2026-08-11T07:00:00.000Z',
        revokedAt: null,
      },
      {
        id: 'ses-2',
        device: 'Safari trên iPhone',
        ip: '203.0.113.99',
        userAgent: 'Mobile Safari',
        createdAt: '2026-08-01T00:00:00.000Z',
        lastSeenAt: '2026-08-05T00:00:00.000Z',
        revokedAt: null,
      },
    ]),
  ),

  // Phase 2a — roles + permissions registry + org-units
  http.get(`${API}/api/v1/roles`, () =>
    HttpResponse.json([
      {
        id: 'role-admin',
        code: 'TENANT_ADMIN',
        name: 'Quản trị tenant',
        isSystem: true,
        permissions: [{ permissionCode: 'order:read', scope: 'all' }],
      },
      {
        id: 'role-custom',
        code: 'KE_TOAN',
        name: 'Kế toán',
        isSystem: false,
        permissions: [
          { permissionCode: 'order:read', scope: 'department' },
          { permissionCode: 'order:approve', scope: 'department' },
        ],
      },
    ]),
  ),
  http.get(`${API}/api/v1/permissions`, () =>
    HttpResponse.json([
      { code: 'order:read', resource: 'order', action: 'read', description: 'Xem đơn hàng' },
      { code: 'order:approve', resource: 'order', action: 'approve', description: 'Duyệt đơn' },
      { code: 'user:read', resource: 'user', action: 'read', description: 'Xem người dùng' },
    ]),
  ),
  http.get(`${API}/api/v1/org-units`, () =>
    HttpResponse.json([
      { id: 'ou-root', code: 'ROOT', name: 'Công ty', parentId: null, version: 1 },
      { id: 'ou-kd', code: 'PB-KD', name: 'Phòng Kinh doanh', parentId: 'ou-root', version: 1 },
      { id: 'ou-kd-1', code: 'KD-1', name: 'Nhóm KD 1', parentId: 'ou-kd', version: 2 },
    ]),
  ),

  // V13 — personalization + notifications (mặc định rỗng; test cần dữ liệu tự server.use)
  http.put(`${API}/api/v1/recent-items`, () => HttpResponse.json({ ok: true })),
  http.get(`${API}/api/v1/recent-items`, () => HttpResponse.json([])),
  http.get(`${API}/api/v1/favorite-items`, () => HttpResponse.json([])),
  http.get(`${API}/api/v1/notifications/unread-count`, () => HttpResponse.json({ count: 0 })),
  http.get(`${API}/api/v1/notifications`, () => HttpResponse.json(paginated([]))),
  http.post(`${API}/api/v1/notifications/read-all`, () => HttpResponse.json({ updated: 0 })),
  http.post(`${API}/api/v1/notifications/:id/read`, () => HttpResponse.json({ ok: true })),
];
