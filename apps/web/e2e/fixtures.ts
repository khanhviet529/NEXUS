import { test as base, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:4100';

/**
 * Chặn API ở tầng network của trình duyệt — cùng triết lý MSW ở tầng vitest:
 * không mock module, để request đi đúng đường axios + cookie + interceptor.
 */
export async function mockApi(page: Page): Promise<void> {
  // ⚠️ Playwright ưu tiên route ĐĂNG KÝ SAU → catch-all phải khai TRƯỚC,
  // nếu không nó nuốt hết các mock cụ thể bên dưới.
  await page.route(`${API}/api/v1/**`, (route) =>
    route.fulfill({
      status: 500,
      json: { code: 'TEST.UNHANDLED_ROUTE', message: `Chưa mock: ${route.request().url()}` },
    }),
  );

  await page.route(`${API}/api/v1/me`, (route) =>
    route.fulfill({
      json: {
        id: 'user-1',
        email: 'staff@tenant-a.local',
        fullName: 'Nhân viên A',
        membershipId: 'mem-1',
        tenant: { id: 'tenant-a', code: 'TENANT-A', name: 'Tenant A' },
        orgUnit: null,
        roles: [{ code: 'STAFF', name: 'STAFF' }],
        permissions: ['order:read', 'order:create', 'customer:read', 'customer:create'],
      },
    }),
  );

  await page.route(`${API}/api/v1/notifications/unread-count`, (route) =>
    route.fulfill({ json: { count: 2 } }),
  );

  await page.route(new RegExp(`${API}/api/v1/orders(\\?.*)?$`), (route) =>
    route.fulfill({
      json: {
        data: [
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
        ],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false },
      },
    }),
  );

}

export const test = base.extend({
  page: async ({ page }, use) => {
    await mockApi(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
