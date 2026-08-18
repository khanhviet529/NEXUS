import { randomUUID } from 'node:crypto';
import { ENTITY_TYPES } from '@nexus/shared';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../src/infra/prisma/prisma.service';
import type { RequestContextService } from '../../src/infra/cls/request-context';
import { CryptoService } from '../../src/infra/crypto/crypto.service';

/**
 * Secret của webhook trong DB là BẢN MÃ AES-GCM (§4.11) — fixture ghi thẳng
 * bằng Prisma nên phải tự mã hoá đúng định dạng. Shim config đọc process.env
 * = cùng đường suy ra key với app (fallback dev khi không đặt ENV).
 *
 * Bài học R1: bản cũ ghi secret PLAINTEXT 'u6-secret'. Dòng đó nằm lại DB,
 * `deliverDue()` (quét XUYÊN tenant) của file test khác nuốt phải →
 * decrypt ném → flaky theo THỨ TỰ FILE. Fixture ghi tắt qua Prisma thì phải
 * ghi ĐÚNG bất biến dữ liệu mà tầng service vẫn giữ.
 */
const fixtureCrypto = new CryptoService({
  get: (k: string) => process.env[k],
} as ConfigService);

/**
 * Fixture cho ca U6 — test-catalog §2.3.
 *
 * U6: gọi route bằng token của tenant A với `id` của một entity thuộc tenant B
 * → phải nhận **404**, không phải 403. Spec §3.6: "không tồn tại" và "ngoài
 * phạm vi" trả cùng một mã, vì 403 tiết lộ rằng bản ghi đó CÓ tồn tại.
 *
 * Vì sao cần fixture chứ không lọc `path.includes(':id')` rồi bắn bừa — catalog
 * §2.3 nêu bốn nhóm làm cách thô đó thành vô nghĩa:
 *
 *   1. Entity GLOBAL (`/admin/tenants/:id`) — không có tenant để "ngoại lai"
 *   2. Tài nguyên của CHÍNH người gọi (`/me/sessions/:id`) — không thuộc tenant
 *   3. Action cần body (`version` cho optimistic lock) — thiếu body thì **422
 *      TRƯỚC KHI chạm DB**, test không kiểm được gì
 *   4. Action cần đúng TRẠNG THÁI — sai trạng thái thì **409** trước khi kiểm tenant
 *
 * Luật: route có `:id` mà THIẾU fixture ở đây → test ĐỎ kèm tên route. Nhờ vậy
 * thêm endpoint mới không thể lọt qua U6 một cách im lặng.
 */
export type Ownership =
  /** Entity thuộc tenant — U6 áp dụng */
  | 'tenant'
  /** Entity toàn hệ thống, không thuộc tenant nào — U6 không áp */
  | 'global'
  /** Tài nguyên của chính người gọi (phiên, ưa thích) — U6 không áp */
  | 'self'
  /** `:id` không phải khoá của hàng DB (mã báo cáo trong registry) — U6 không áp */
  | 'not-entity';

export interface SeededEntity {
  id: string;
  /** Optimistic locking: action nào cần `version` trong body thì phải trả về */
  version?: number;
  /** Tham số đường dẫn khác ngoài `:id` */
  extraParams?: Record<string, string>;
}

export interface FixtureCtx {
  prisma: PrismaService;
  ctx: RequestContextService;
  /** Chạy trong context tenant chỉ định — extension tự chèn tenantId khi create */
  inTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T>;
  tenantB: string;
  /** membershipId của một user thuộc tenant B — vài bảng bắt buộc có */
  membershipB: string;
}

export interface RouteFixture {
  ownership: Ownership;
  /** BẮT BUỘC khi ownership !== 'tenant' — để "loại khỏi U6" luôn có lý do đọc được */
  why?: string;
  /** Tạo entity ở tenant CHỈ ĐỊNH, ở ĐÚNG trạng thái để action chạy được */
  seed?(c: FixtureCtx): Promise<SeededEntity>;
  /** Actor phải ĐỦ QUYỀN — thiếu quyền thì nhận 403 chứ không phải 404 */
  actor?: 'staff' | 'manager' | 'admin';
  /** Body hợp lệ — thiếu thì 422 trước khi chạm tầng tenant */
  body?(e: SeededEntity): unknown;
}

const iso = (d: string) => new Date(d);

/** Seed dùng lại cho nhiều route của cùng một entity */
const seedOrder =
  (status: 'DRAFT' | 'PENDING' = 'DRAFT') =>
  async (c: FixtureCtx): Promise<SeededEntity> =>
    c.inTenant(c.tenantB, async () => {
      const customer = await c.prisma.client.customer.create({
        data: { tenantId: c.tenantB, code: `U6-KH-${Date.now()}`, name: { vi: 'KH U6' } },
      });
      const order = await c.prisma.client.order.create({
        data: {
          tenantId: c.tenantB,
          code: `U6-DH-${Date.now()}`,
          customerId: customer.id,
          status,
          subtotal: '0',
          discountTotal: '0',
          taxTotal: '0',
          total: '0',
          createdById: null,
        },
      });
      return { id: order.id, version: order.version };
    });

const seedProduct = async (c: FixtureCtx): Promise<SeededEntity> =>
  c.inTenant(c.tenantB, async () => {
    const p = await c.prisma.client.product.create({
      data: { tenantId: c.tenantB, code: `U6-SP-${Date.now()}`, name: { vi: 'SP U6' }, baseUom: 'CAI' },
    });
    return { id: p.id, version: p.version };
  });

const seedRole = async (c: FixtureCtx): Promise<SeededEntity> =>
  c.inTenant(c.tenantB, async () => {
    const r = await c.prisma.client.role.create({
      data: { tenantId: c.tenantB, code: `U6ROLE${Date.now()}`, name: 'Role U6' },
    });
    return { id: r.id };
  });

const seedOrgUnit = async (c: FixtureCtx): Promise<SeededEntity> =>
  c.inTenant(c.tenantB, async () => {
    const u = await c.prisma.client.orgUnit.create({
      data: { tenantId: c.tenantB, code: `U6OU${Date.now()}`, name: 'Đơn vị U6' },
    });
    return { id: u.id };
  });

/** User của tenant B = membership của B; route /users/:id nhận membershipId */
const seedMembership = async (c: FixtureCtx): Promise<SeededEntity> => ({ id: c.membershipB });

const seedFile = async (c: FixtureCtx): Promise<SeededEntity> =>
  c.inTenant(c.tenantB, async () => {
    const f = await c.prisma.client.file.create({
      data: {
        tenantId: c.tenantB,
        bucket: 'u6',
        objectKey: `u6/${Date.now()}`,
        filename: 'u6.txt',
        mime: 'text/plain',
        size: 3,
      },
    });
    return { id: f.id };
  });

const seedImportJob = async (c: FixtureCtx): Promise<SeededEntity> =>
  c.inTenant(c.tenantB, async () => {
    const j = await c.prisma.client.importJob.create({ data: { tenantId: c.tenantB, entity: 'Product' } });
    return { id: j.id };
  });

const seedWebhookEndpoint = async (c: FixtureCtx): Promise<SeededEntity> =>
  c.inTenant(c.tenantB, async () => {
    const e = await c.prisma.client.webhookEndpoint.create({
      data: { tenantId: c.tenantB, url: 'https://u6.invalid/hook', secret: fixtureCrypto.encrypt('u6-secret') },
    });
    return { id: e.id };
  });

const seedWebhookDelivery = async (c: FixtureCtx): Promise<SeededEntity> =>
  c.inTenant(c.tenantB, async () => {
    const e = await c.prisma.client.webhookEndpoint.create({
      data: { tenantId: c.tenantB, url: 'https://u6d.invalid/hook', secret: fixtureCrypto.encrypt('u6-secret') },
    });
    const d = await c.prisma.client.webhookDelivery.create({
      data: {
        tenantId: c.tenantB,
        endpointId: e.id,
        // eventId là cột UUID (khoá dedup outbox §4.8), không phải chuỗi tự do
        eventId: randomUUID(),
        eventType: 'order.created',
        payload: {},
      },
    });
    return { id: d.id };
  });

const seedSavedView = async (c: FixtureCtx): Promise<SeededEntity> =>
  c.inTenant(c.tenantB, async () => {
    const v = await c.prisma.client.savedView.create({
      data: { tenantId: c.tenantB, membershipId: c.membershipB, entity: 'order', name: 'U6', config: {} },
    });
    return { id: v.id };
  });

const seedApprovalAuthority = async (c: FixtureCtx): Promise<SeededEntity> =>
  c.inTenant(c.tenantB, async () => {
    // CHECK `num_nonnulls(membership_id, role_id, org_unit_id) >= 1`: hạn mức
    // phải gắn vào MỘT đích cụ thể, nếu không thì "ai được duyệt" vô nghĩa.
    const a = await c.prisma.client.approvalAuthority.create({
      data: {
        tenantId: c.tenantB,
        documentType: 'ORDER',
        effectiveFrom: iso('2020-01-01'),
        membershipId: c.membershipB,
      },
    });
    return { id: a.id };
  });

const seedHoliday = async (c: FixtureCtx): Promise<SeededEntity> =>
  c.inTenant(c.tenantB, async () => {
    const cal = await c.prisma.client.businessCalendar.findFirstOrThrow();
    const hd = await c.prisma.client.calendarHoliday.create({
      data: { tenantId: c.tenantB, calendarId: cal.id, date: iso('2031-01-01'), name: 'Nghỉ U6' },
    });
    return { id: hd.id };
  });

/**
 * MỌI route có `:id` phải có mặt ở đây. Thiếu → U6 ĐỎ.
 * Khoá là `METHOD /path` đúng như route-inventory sinh ra.
 */
export const ROUTE_FIXTURES: Record<string, RouteFixture> = {
  // ── Orders ────────────────────────────────────────────────────────────────
  'GET /api/v1/orders/:id': { ownership: 'tenant', actor: 'manager', seed: seedOrder() },
  'PATCH /api/v1/orders/:id': {
    ownership: 'tenant',
    actor: 'manager',
    seed: seedOrder('DRAFT'),
    // Body phải qua ĐƯỢC ValidationPipe, nếu không 422 chặn trước tầng tenant
    // và test đo nhầm thứ. `items` rỗng bị DTO từ chối.
    body: (e) => ({
      version: e.version,
      items: [{ productId: randomUUID(), quantity: '1', unitPrice: '1000' }],
    }),
  },
  'DELETE /api/v1/orders/:id': {
    ownership: 'tenant',
    actor: 'admin',
    seed: seedOrder('DRAFT'), // chỉ DRAFT mới xoá được, nếu không là 409
  },
  'POST /api/v1/orders/:id/submit': {
    ownership: 'tenant',
    actor: 'manager',
    seed: seedOrder('DRAFT'),
    body: (e) => ({ version: e.version }),
  },
  'POST /api/v1/orders/:id/approve': {
    ownership: 'tenant',
    actor: 'admin',
    seed: seedOrder('PENDING'), // sai trạng thái là 409 trước khi kiểm tenant
    body: (e) => ({ version: e.version }),
  },
  'POST /api/v1/orders/:id/reject': {
    ownership: 'tenant',
    actor: 'admin',
    seed: seedOrder('PENDING'),
    body: (e) => ({ version: e.version }),
  },
  'POST /api/v1/orders/:id/cancel': {
    ownership: 'tenant',
    actor: 'manager',
    seed: seedOrder('DRAFT'),
    body: (e) => ({ version: e.version }),
  },

  // ── Products ──────────────────────────────────────────────────────────────
  'GET /api/v1/products/:id': { ownership: 'tenant', actor: 'manager', seed: seedProduct },
  'PATCH /api/v1/products/:id': {
    ownership: 'tenant',
    actor: 'manager',
    seed: seedProduct,
    body: (e) => ({ version: e.version, name: { vi: 'đổi' } }),
  },
  'DELETE /api/v1/products/:id': { ownership: 'tenant', actor: 'admin', seed: seedProduct },

  // ── Users (membership) ────────────────────────────────────────────────────
  'GET /api/v1/users/:id': { ownership: 'tenant', actor: 'admin', seed: seedMembership },
  'PATCH /api/v1/users/:id': {
    ownership: 'tenant',
    actor: 'admin',
    seed: seedMembership,
    body: () => ({ fullName: 'U6' }),
  },
  'GET /api/v1/users/:id/sessions': { ownership: 'tenant', actor: 'admin', seed: seedMembership },
  'DELETE /api/v1/users/:id/sessions': { ownership: 'tenant', actor: 'admin', seed: seedMembership },
  'POST /api/v1/users/:id/disable': { ownership: 'tenant', actor: 'admin', seed: seedMembership },
  'POST /api/v1/users/:id/unlock': { ownership: 'tenant', actor: 'admin', seed: seedMembership },
  'POST /api/v1/users/:id/offboard': {
    ownership: 'tenant',
    actor: 'admin',
    seed: seedMembership,
    body: () => ({ reason: 'U6' }),
  },
  'POST /api/v1/users/:id/roles': {
    ownership: 'tenant',
    actor: 'admin',
    seed: seedMembership,
    body: () => ({ roleIds: [randomUUID()] }),
  },
  'POST /api/v1/users/:id/transfer-org': {
    ownership: 'tenant',
    actor: 'admin',
    seed: seedMembership,
    body: () => ({ orgUnitId: randomUUID() }),
  },

  // ── Roles / org units ─────────────────────────────────────────────────────
  'PATCH /api/v1/roles/:id': {
    ownership: 'tenant',
    actor: 'admin',
    seed: seedRole,
    body: () => ({ name: 'U6' }),
  },
  'DELETE /api/v1/roles/:id': { ownership: 'tenant', actor: 'admin', seed: seedRole },
  'PATCH /api/v1/org-units/:id': {
    ownership: 'tenant',
    actor: 'admin',
    seed: seedOrgUnit,
    body: () => ({ version: 1, name: 'U6' }),
  },
  'DELETE /api/v1/org-units/:id': { ownership: 'tenant', actor: 'admin', seed: seedOrgUnit },

  // ── Hạn mức duyệt · lịch nghỉ ─────────────────────────────────────────────
  'DELETE /api/v1/approval-authorities/:id': {
    ownership: 'tenant',
    actor: 'admin',
    seed: seedApprovalAuthority,
  },
  'DELETE /api/v1/business-calendar/holidays/:id': {
    ownership: 'tenant',
    actor: 'admin',
    seed: seedHoliday,
  },

  // ── Import · file ─────────────────────────────────────────────────────────
  'GET /api/v1/import-jobs/:id': { ownership: 'tenant', actor: 'admin', seed: seedImportJob },
  'GET /api/v1/import-jobs/:id/errors': {
    ownership: 'tenant',
    actor: 'admin',
    seed: seedImportJob,
  },
  'GET /api/v1/files/:id': { ownership: 'tenant', actor: 'manager', seed: seedFile },
  'GET /api/v1/files/by-entity/:entity/:entityId': {
    ownership: 'tenant',
    actor: 'manager',
    // Ca thật: A hỏi tệp đính kèm của ĐƠN HÀNG thuộc B. `entity` phải đúng
    // giá trị trong ENTITY_TYPES ('Order', chữ hoa) — sai tên thì rơi vào
    // nhánh default fail-closed và test đo nhầm thứ.
    seed: async (c) => {
      const order = await seedOrder()(c);
      return { id: order.id, extraParams: { entity: ENTITY_TYPES.ORDER } };
    },
  },

  // ── Webhook ───────────────────────────────────────────────────────────────
  'POST /api/v1/webhooks/endpoints/:id/enable': {
    ownership: 'tenant',
    actor: 'admin',
    seed: seedWebhookEndpoint,
    body: () => ({ enabled: true }),
  },
  'POST /api/v1/webhooks/endpoints/:id/rotate-secret': {
    ownership: 'tenant',
    actor: 'admin',
    seed: seedWebhookEndpoint,
  },
  'POST /api/v1/webhooks/endpoints/:id/subscriptions': {
    ownership: 'tenant',
    actor: 'admin',
    seed: seedWebhookEndpoint,
    body: () => ({ eventType: 'order.created' }),
  },
  'POST /api/v1/webhooks/deliveries/:id/replay': {
    ownership: 'tenant',
    actor: 'admin',
    seed: seedWebhookDelivery,
  },

  // ── Saved views ───────────────────────────────────────────────────────────
  'PATCH /api/v1/saved-views/:id': {
    ownership: 'tenant',
    actor: 'manager',
    seed: seedSavedView,
    body: () => ({ name: 'U6' }),
  },
  'DELETE /api/v1/saved-views/:id': { ownership: 'tenant', actor: 'manager', seed: seedSavedView },

  // ── KHÔNG áp U6 — mỗi dòng phải có lý do đọc được ─────────────────────────
  'DELETE /api/v1/me/sessions/:id': {
    ownership: 'self',
    why: 'phiên của chính người gọi, không phải tài nguyên của tenant',
  },
  'DELETE /api/v1/favorite-items/:entity/:entityId': {
    ownership: 'self',
    why: 'mục ưa thích gắn với membership của chính người gọi',
  },
  'POST /api/v1/notifications/:id/read': {
    ownership: 'self',
    why: 'thông báo gửi riêng cho membership của người gọi',
  },
  'PATCH /api/v1/admin/tenants/:id/features': {
    ownership: 'global',
    why: 'entity Tenant là GLOBAL — không có tenant nào để làm "ngoại lai". Cách ly cross-tenant của /admin/* kiểm ở admin-gd3b.spec.ts',
  },
  'POST /api/v1/admin/tenants/:id/activate': {
    ownership: 'global',
    why: 'như trên — Tenant là entity GLOBAL',
  },
  'POST /api/v1/admin/tenants/:id/suspend': {
    ownership: 'global',
    why: 'như trên — Tenant là entity GLOBAL',
  },
  'DELETE /api/v1/admin/ops/cache/:tenantId': {
    ownership: 'global',
    why: ':tenantId là ĐỐI SỐ của thao tác vận hành, không phải id bản ghi bị truy cập',
  },
  'GET /api/v1/reports/:id/meta': {
    ownership: 'not-entity',
    why: ':id là mã báo cáo trong registry (dữ liệu tĩnh), không phải khoá hàng DB',
  },
  'POST /api/v1/reports/:id/run': {
    ownership: 'not-entity',
    why: 'như trên — mã báo cáo, không phải hàng DB',
  },
  'POST /api/v1/reports/:id/export': {
    ownership: 'not-entity',
    why: 'như trên — mã báo cáo, không phải hàng DB',
  },
};
