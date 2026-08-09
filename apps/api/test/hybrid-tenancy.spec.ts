import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp, type TestHarness } from './setup/test-app';

/**
 * test-catalog §3C — NHÓM HYBRID TENANCY, ưu tiên P0.
 *
 * `settings` và `feature_flags` là NGOẠI LỆ DUY NHẤT được phép đọc dòng không
 * thuộc tenant nào (`tenant_id IS NULL` = mặc định hệ thống). Chính vì là ngoại
 * lệ, nó là đường code nguy hiểm nhất của hệ tenancy: bug ở đây lọt qua mọi
 * test còn lại, vì mọi test khác đều nói về model TENANT thuần.
 *
 * Trước bộ này, hai bảng chỉ xuất hiện TÌNH CỜ ở gd7 và backup-restore — không
 * có một ca cách ly riêng nào.
 *
 * Oracle lấy từ test-catalog §3C (H1–H12), không lấy từ hành vi quan sát được.
 */
describe('HYBRID tenancy — settings & feature_flags (test-catalog §3C)', () => {
  let h: TestHarness;
  let A: string;
  let B: string;

  const inA = <T>(fn: () => Promise<T>) => h.ctx.runWith({ tenantId: A }, fn);
  const inB = <T>(fn: () => Promise<T>) => h.ctx.runWith({ tenantId: B }, fn);
  /** Ghi dữ liệu chuẩn bị — bypass extension để dựng được cả dòng global */
  const asSystem = <T>(fn: () => Promise<T>) => h.ctx.runWith({ tenancyBypass: true }, fn);

  beforeAll(async () => {
    h = await createTestApp();
    A = h.seed.tenantA.tenantId;
    B = h.seed.tenantB.tenantId;
  });
  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await asSystem(() => h.prisma.client.setting.deleteMany({ where: { key: { startsWith: 'h.' } } }));
    await asSystem(() =>
      h.prisma.client.featureFlag.deleteMany({ where: { key: { startsWith: 'h.' } } }),
    );
  });

  const seedSetting = (tenantId: string | null, key: string, value: unknown) =>
    asSystem(() => h.prisma.client.setting.create({ data: { tenantId, key, value: value as never } }));

  // ── H1 ────────────────────────────────────────────────────────────────────
  it('H1 chỉ có dòng global → tenant A đọc ra giá trị global', async () => {
    await seedSetting(null, 'h.currency', 'VND');
    const rows = await inA(() => h.prisma.client.setting.findMany({ where: { key: 'h.currency' } }));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tenantId).toBeNull();
    expect(rows[0]!.value).toBe('VND');
  });

  // ── H2 ────────────────────────────────────────────────────────────────────
  it('H2 global + override của A → A thấy CẢ HAI, B chỉ thấy global', async () => {
    await seedSetting(null, 'h.theme', 'light');
    await seedSetting(A, 'h.theme', 'dark');

    const inTenantA = await inA(() => h.prisma.client.setting.findMany({ where: { key: 'h.theme' } }));
    const inTenantB = await inB(() => h.prisma.client.setting.findMany({ where: { key: 'h.theme' } }));

    // Extension trả cả hai dòng; ưu tiên "dòng có tenant thắng global" là việc
    // của tầng service (xem chú thích trong tenancy.extension.ts).
    expect(inTenantA.map((r) => r.tenantId).sort()).toEqual([A, null].sort());
    expect(inTenantB).toHaveLength(1);
    expect(inTenantB[0]!.tenantId).toBeNull();
    expect(inTenantB[0]!.value).toBe('light');
  });

  // ── H3 ────────────────────────────────────────────────────────────────────
  it('H3 override A + override B → không bên nào thấy giá trị của bên kia', async () => {
    await seedSetting(A, 'h.limit', 100);
    await seedSetting(B, 'h.limit', 999);

    const rowsA = await inA(() => h.prisma.client.setting.findMany({ where: { key: 'h.limit' } }));
    const rowsB = await inB(() => h.prisma.client.setting.findMany({ where: { key: 'h.limit' } }));

    expect(rowsA.map((r) => r.value)).toEqual([100]);
    expect(rowsB.map((r) => r.value)).toEqual([999]);
  });

  // ── H4 ────────────────────────────────────────────────────────────────────
  it('H4 A update setting của B theo id → THẤT BẠI và dòng của B còn nguyên', async () => {
    // Ca nguy hiểm nhất nhóm. Không ràng buộc DB nào chặn được
    // `UPDATE settings SET value=... WHERE id='<của B>'` — chỉ extension chặn được.
    const target = await seedSetting(B, 'h.secret', 'của-B');

    await expect(
      inA(() =>
        h.prisma.client.setting.update({ where: { id: target.id }, data: { value: 'bị-A-sửa' } }),
      ),
    ).rejects.toThrow();

    const after = await asSystem(() =>
      h.prisma.client.setting.findUniqueOrThrow({ where: { id: target.id } }),
    );
    expect(after.value).toBe('của-B');
  });

  // ── H5 ────────────────────────────────────────────────────────────────────
  it('H5 A delete setting của B theo id → THẤT BẠI, dòng của B còn nguyên', async () => {
    const target = await seedSetting(B, 'h.keep', 1);

    await expect(inA(() => h.prisma.client.setting.delete({ where: { id: target.id } }))).rejects.toThrow();

    const still = await asSystem(() =>
      h.prisma.client.setting.findUnique({ where: { id: target.id } }),
    );
    expect(still).not.toBeNull();
  });

  // ── H6 ────────────────────────────────────────────────────────────────────
  it('H6 tenant thường KHÔNG sửa/xoá được dòng GLOBAL', async () => {
    // Dòng global ảnh hưởng MỌI tenant. Cho A ghi đè nó nghĩa là A đổi mặc
    // định của cả hệ thống — leo thang đặc quyền qua cửa sau.
    const global = await seedSetting(null, 'h.system', 'gốc');

    await expect(
      inA(() => h.prisma.client.setting.update({ where: { id: global.id }, data: { value: 'sửa' } })),
    ).rejects.toThrow();
    await expect(
      inA(() => h.prisma.client.setting.delete({ where: { id: global.id } })),
    ).rejects.toThrow();

    const after = await asSystem(() =>
      h.prisma.client.setting.findUniqueOrThrow({ where: { id: global.id } }),
    );
    expect(after.value).toBe('gốc');
  });

  // ── H7 ────────────────────────────────────────────────────────────────────
  it('H7 cách ly giữ ở MỌI op, không chỉ findMany', async () => {
    // Extension thường chỉ được test qua findMany; findUnique/count/upsert là
    // ba đường hay bị bỏ sót nhất.
    const ofB = await seedSetting(B, 'h.multi', 'B');
    await seedSetting(A, 'h.multi', 'A');

    expect(await inA(() => h.prisma.client.setting.findUnique({ where: { id: ofB.id } }))).toBeNull();

    expect(
      await inA(() => h.prisma.client.setting.findFirst({ where: { key: 'h.multi', value: { equals: 'B' } } })),
    ).toBeNull();

    expect(await inA(() => h.prisma.client.setting.count({ where: { key: 'h.multi' } }))).toBe(1);

    await expect(
      inA(() =>
        h.prisma.client.setting.upsert({
          where: { id: ofB.id },
          create: { key: 'h.multi', value: 'mới' },
          update: { value: 'A-ghi-đè-B' },
        }),
      ),
    ).rejects.toThrow();

    const untouched = await asSystem(() =>
      h.prisma.client.setting.findUniqueOrThrow({ where: { id: ofB.id } }),
    );
    expect(untouched.value).toBe('B');
  });

  // ── H8 ────────────────────────────────────────────────────────────────────
  it('H8 không có tenant context: ĐỌC chỉ thấy global, GHI không tạo được dòng global', async () => {
    // Kịch bản thật: job BullMQ quên runWith(ctx).
    // Đọc: chỉ global là fail-closed chấp nhận được (không rò tenant nào).
    // GHI thì KHÔNG: tạo dòng thiếu tenant = tạo mặc định cho TOÀN hệ thống,
    // im lặng, từ một job lẽ ra chỉ động tới một tenant.
    await seedSetting(null, 'h.job', 'global');
    await seedSetting(A, 'h.job', 'của-A');

    const seen = await h.ctx.runWith({}, () =>
      h.prisma.client.setting.findMany({ where: { key: 'h.job' } }),
    );
    expect(seen.map((r) => r.tenantId)).toEqual([null]);

    await expect(
      h.ctx.runWith({}, () =>
        h.prisma.client.setting.create({ data: { key: 'h.rogue', value: 1 } }),
      ),
    ).rejects.toThrow(/\[TENANCY\]/);
  });

  // ── H9 ────────────────────────────────────────────────────────────────────
  it('H9 A tạo setting trùng key với global → được, và A đọc ra giá trị của A', async () => {
    await seedSetting(null, 'h.dup', 'global');
    await inA(() => h.prisma.client.setting.create({ data: { key: 'h.dup', value: 'của-A' } }));

    const rows = await inA(() => h.prisma.client.setting.findMany({ where: { key: 'h.dup' } }));
    const ownRow = rows.find((r) => r.tenantId === A);
    expect(ownRow?.value).toBe('của-A');
    expect(rows).toHaveLength(2); // override + global cùng tồn tại
  });

  it('H9b create trong context A KHÔNG cài được tenantId của B', async () => {
    await expect(
      inA(() => h.prisma.client.setting.create({ data: { tenantId: B, key: 'h.evil', value: 1 } })),
    ).rejects.toThrow(/\[TENANCY\]/);
  });

  // ── H10 ───────────────────────────────────────────────────────────────────
  it('H10 feature flag bật ở A không ảnh hưởng B', async () => {
    await asSystem(() =>
      h.prisma.client.featureFlag.create({ data: { tenantId: A, key: 'h.beta', enabled: true } }),
    );

    const flagA = await inA(() => h.prisma.client.featureFlag.findFirst({ where: { key: 'h.beta' } }));
    const flagB = await inB(() => h.prisma.client.featureFlag.findFirst({ where: { key: 'h.beta' } }));

    expect(flagA?.enabled).toBe(true);
    expect(flagB).toBeNull();
  });

  it('H10b flag global bật, A tắt bằng override → B vẫn bật', async () => {
    await asSystem(() =>
      h.prisma.client.featureFlag.createMany({
        data: [
          { tenantId: null, key: 'h.export', enabled: true },
          { tenantId: A, key: 'h.export', enabled: false },
        ],
      }),
    );

    const rowsA = await inA(() =>
      h.prisma.client.featureFlag.findMany({ where: { key: 'h.export' } }),
    );
    const rowsB = await inB(() =>
      h.prisma.client.featureFlag.findMany({ where: { key: 'h.export' } }),
    );

    // Ưu tiên dòng có tenant là việc của service; ở đây kiểm A CÓ override còn
    // B thì KHÔNG thấy override của A.
    expect(rowsA.find((r) => r.tenantId === A)?.enabled).toBe(false);
    expect(rowsB.map((r) => r.tenantId)).toEqual([null]);
    expect(rowsB[0]!.enabled).toBe(true);
  });

  // ── H11 ───────────────────────────────────────────────────────────────────
  it('H11 cache setting phải mang tenantId — B không nhận giá trị đã cache của A', async () => {
    // Rò rỉ qua cache im lặng hơn rò rỉ qua query: không có dòng log nào bất
    // thường, và chỉ xảy ra khi hai tenant đọc cùng key gần nhau.
    await seedSetting(A, 'h.cached', 'của-A');
    await seedSetting(B, 'h.cached', 'của-B');

    const first = await inA(() => h.prisma.client.setting.findMany({ where: { key: 'h.cached' } }));
    const second = await inB(() => h.prisma.client.setting.findMany({ where: { key: 'h.cached' } }));

    expect(first.map((r) => r.value)).toEqual(['của-A']);
    expect(second.map((r) => r.value)).toEqual(['của-B']);
  });
});
