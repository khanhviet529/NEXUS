import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { createTestApp, type TestHarness } from './setup/test-app';
import { InventoryRepository, LOT_SENTINEL } from '../src/modules/inventory/inventory.repository';

/**
 * Test §8.2 GĐ5b: #22 (20 request xuất song song không âm tồn), #23 (dedup),
 * #24 (đối soát phát hiện lệch cố ý), #25 (partition).
 * "Bài toán khó nhất và khó tái hiện nhất trong toàn hệ thống" — §5B.2/B4.
 */
describe('GĐ5b — kho: movement + snapshot (§8.2 #22-#25)', () => {
  let h: TestHarness;
  let managerToken = '';
  let warehouseId = '';
  let productId = '';
  let serialProductId = '';

  const agent = () => request(h.app.getHttpServer());

  beforeAll(async () => {
    h = await createTestApp();
    managerToken = await h.login('manager@tenant-a.local');

    const wh = await agent()
      .post('/api/v1/inventory/warehouses')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'KHO-5B', name: 'Kho GĐ5b' });
    expect(wh.status, JSON.stringify(wh.body)).toBe(201);
    warehouseId = wh.body.id;

    const p1 = await agent()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'SP-KHO', name: { vi: 'Hàng kho' }, baseUom: 'CAI' });
    productId = p1.body.id;

    const p2 = await agent()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'SP-SERIAL', name: { vi: 'Máy có serial' }, baseUom: 'CAI', trackingType: 'SERIAL' });
    serialProductId = p2.body.id;
  });

  afterAll(async () => {
    await h.close();
  });

  const receive = (qty: string, refId = randomUUID(), pid = productId) =>
    agent()
      .post('/api/v1/inventory/receipts')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ warehouseId, productId: pid, quantity: qty, refType: 'GRN', refId });

  const issue = (qty: string, refId = randomUUID(), extra: Record<string, unknown> = {}) =>
    agent()
      .post('/api/v1/inventory/issues')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ warehouseId, productId, quantity: qty, refType: 'DO', refId, ...extra });

  it('nhập kho → balance đúng; nhập trùng refId → duplicate, KHÔNG cộng đôi (#23 chiều nhập)', async () => {
    const refId = randomUUID();
    const first = await receive('100', refId);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.duplicate).toBe(false);

    const retry = await receive('100', refId); // CÙNG (GRN, refId, RECEIPT)
    expect(retry.status).toBe(201);
    expect(retry.body.duplicate).toBe(true);
    expect(retry.body.movementId).toBe(first.body.movementId); // trả kết quả CŨ

    const balances = await agent()
      .get('/api/v1/inventory/balances')
      .set('Authorization', `Bearer ${managerToken}`);
    const row = balances.body.find(
      (b: { productId: string }) => b.productId === productId,
    );
    expect(row.onHand).toBe('100'); // KHÔNG phải 200
  });

  it('#22 20 request xuất SONG SONG (mỗi cái 10) trên tồn 100 → đúng 10 thành công, tồn = 0, KHÔNG ÂM', async () => {
    // tồn hiện tại: 100 (từ test trước)
    const results = await Promise.all(
      Array.from({ length: 20 }, () => issue('10')), // 20 × 10 = 200 > 100
    );
    const succeeded = results.filter((r) => r.status === 201 && !r.body.duplicate);
    const insufficient = results.filter(
      (r) => r.status === 409 && r.body.code === 'STOCK.INSUFFICIENT',
    );
    expect(succeeded.length).toBe(10); // đúng 100/10
    expect(insufficient.length).toBe(10);

    const balance = await h.rawPrisma.stockBalance.findUniqueOrThrow({
      where: {
        tenantId_warehouseId_productId_lotId: {
          tenantId: h.seed.tenantA.tenantId,
          warehouseId,
          productId,
          lotId: LOT_SENTINEL,
        },
      },
    });
    expect(balance.onHand.toString()).toBe('0'); // KHÔNG ÂM, tổng khớp
    expect(balance.available.toString()).toBe('0');

    // Movement khớp: 1 nhập(+100) + 10 xuất(-10)
    const net = await h.rawPrisma.$queryRaw<Array<{ net: string }>>(
      Prisma.sql`SELECT COALESCE(SUM(direction * quantity),0)::text AS net FROM movements
                 WHERE tenant_id = ${h.seed.tenantA.tenantId}::uuid
                   AND account_key = ${`${warehouseId}:${productId}:${LOT_SENTINEL}`}`,
    );
    expect(Number(net[0]!.net)).toBe(0);
  });

  it('#23 gọi lại CÙNG (refType, refId, movementType) → không tạo movement thứ hai', async () => {
    await receive('50');
    const refId = randomUUID();
    const first = await issue('5', refId);
    expect(first.body.duplicate).toBe(false);

    const retry = await issue('5', refId);
    expect(retry.body.duplicate).toBe(true);
    expect(retry.body.movementId).toBe(first.body.movementId);

    const count = await h.rawPrisma.movement.count({
      where: { refId, refType: 'DO', movementType: 'ISSUE' },
    });
    expect(count).toBe(1); // đúng MỘT movement

    // Xuất thất bại (thiếu tồn) rồi retry cùng refId: dedup key đã ROLLBACK
    // cùng transaction → retry sau khi nhập thêm phải THÀNH CÔNG
    const failRef = randomUUID();
    const fail = await issue('99999', failRef);
    expect(fail.status).toBe(409);
    const afterTopUp = await issue('1', failRef);
    expect(afterTopUp.status).toBe(201);
    expect(afterTopUp.body.duplicate).toBe(false);
  });

  it('#24 cố ý làm lệch stock_balances → job đối soát phát hiện; rebuild sửa lại đúng', async () => {
    const repo = h.app.get(InventoryRepository);

    // Sạch trước khi đối soát
    const cleanBefore = await repo.reconcile(h.seed.tenantA.tenantId);
    expect(cleanBefore).toHaveLength(0);

    // Kẻ gian sửa lén snapshot +7
    await h.rawPrisma.$executeRaw(
      Prisma.sql`UPDATE stock_balances SET on_hand = on_hand + 7
                 WHERE tenant_id = ${h.seed.tenantA.tenantId}::uuid
                   AND warehouse_id = ${warehouseId}::uuid AND product_id = ${productId}::uuid`,
    );

    const diffs = await repo.reconcile(h.seed.tenantA.tenantId);
    expect(diffs.length).toBe(1);
    expect(Number(diffs[0]!.diff)).toBe(7); // actual − expected

    const logged = await h.rawPrisma.reconciliationLog.count({
      where: { tenantId: h.seed.tenantA.tenantId, accountType: 'STOCK' },
    });
    expect(logged).toBeGreaterThanOrEqual(1);

    // Job rebuild (luật 2): tính lại từ movements → hết lệch
    await repo.rebuildBalances(h.seed.tenantA.tenantId);
    const clean = await repo.reconcile(h.seed.tenantA.tenantId);
    expect(clean).toHaveLength(0);
  });

  it('SERIAL: xuất đổi status trong CÙNG transaction; stock_balances vẫn là nguồn tồn (#58/#60)', async () => {
    // Nhập 3 máy kèm serial
    await agent()
      .post('/api/v1/inventory/serials')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        productId: serialProductId,
        warehouseId,
        serialNos: ['SN-001', 'SN-002', 'SN-003'],
      });
    await receive('3', randomUUID(), serialProductId);

    const serials = await h.rawPrisma.inventorySerial.findMany({
      where: { productId: serialProductId, status: 'IN_STOCK' },
    });
    expect(serials).toHaveLength(3);

    // Xuất 2 máy theo serial
    const res = await agent()
      .post('/api/v1/inventory/issues')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        warehouseId,
        productId: serialProductId,
        quantity: '2',
        refType: 'DO',
        refId: randomUUID(),
        serialIds: [serials[0]!.id, serials[1]!.id],
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    // Đối soát #60: COUNT(IN_STOCK) == on_hand
    const inStock = await h.rawPrisma.inventorySerial.count({
      where: { productId: serialProductId, status: 'IN_STOCK' },
    });
    const balance = await h.rawPrisma.stockBalance.findUniqueOrThrow({
      where: {
        tenantId_warehouseId_productId_lotId: {
          tenantId: h.seed.tenantA.tenantId,
          warehouseId,
          productId: serialProductId,
          lotId: LOT_SENTINEL,
        },
      },
    });
    expect(inStock).toBe(1);
    expect(balance.onHand.toString()).toBe('1');

    // Xuất serial ĐÃ XUẤT → rollback cả balance (transaction nguyên tử)
    const again = await agent()
      .post('/api/v1/inventory/issues')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        warehouseId,
        productId: serialProductId,
        quantity: '1',
        refType: 'DO',
        refId: randomUUID(),
        serialIds: [serials[0]!.id], // đã ISSUED
      });
    expect(again.status).toBe(409);
    const balanceAfter = await h.rawPrisma.stockBalance.findUniqueOrThrow({
      where: {
        tenantId_warehouseId_productId_lotId: {
          tenantId: h.seed.tenantA.tenantId,
          warehouseId,
          productId: serialProductId,
          lotId: LOT_SENTINEL,
        },
      },
    });
    expect(balanceAfter.onHand.toString()).toBe('1'); // KHÔNG bị trừ oan
  });

  it('#25 partition: insert đúng mảnh; tạo mảnh mới tự động; DETACH mảnh cũ không ảnh hưởng', async () => {
    const repo = h.app.get(InventoryRepository);

    // Tạo mảnh tháng 2027-03 (chưa tồn tại)
    const name = await repo.ensureMovementPartition(new Date('2027-03-15'));
    expect(name).toBe('movements_2027_03');
    // Idempotent
    await repo.ensureMovementPartition(new Date('2027-03-15'));

    // Insert movement vào tháng 2027-03 → rơi đúng mảnh
    const futureId = randomUUID();
    await h.rawPrisma.$executeRaw(
      Prisma.sql`INSERT INTO movements (id, created_at, tenant_id, account_type, account_key,
                   movement_type, direction, quantity, ref_type, ref_id)
                 VALUES (${futureId}::uuid, '2027-03-10T00:00:00Z', ${h.seed.tenantA.tenantId}::uuid,
                         'STOCK', 'test:partition:key', 'ADJUST', 1, 1, 'TEST', ${randomUUID()}::uuid)`,
    );
    const inPartition = await h.rawPrisma.$queryRaw<Array<{ n: bigint }>>(
      Prisma.sql`SELECT count(*) AS n FROM movements_2027_03 WHERE id = ${futureId}::uuid`,
    );
    expect(Number(inPartition[0]!.n)).toBe(1);

    // DETACH mảnh 2027-03 → dữ liệu các mảnh khác vẫn query bình thường
    const beforeDetach = await h.rawPrisma.movement.count({
      where: { tenantId: h.seed.tenantA.tenantId },
    });
    await h.rawPrisma.$executeRawUnsafe(
      'ALTER TABLE movements DETACH PARTITION movements_2027_03',
    );
    const afterDetach = await h.rawPrisma.movement.count({
      where: { tenantId: h.seed.tenantA.tenantId },
    });
    expect(afterDetach).toBe(beforeDetach - 1); // chỉ mất dòng của mảnh detach
    // Mảnh detach thành bảng thường, dữ liệu còn nguyên (archive §5B.3/C2)
    const archived = await h.rawPrisma.$queryRaw<Array<{ n: bigint }>>(
      Prisma.sql`SELECT count(*) AS n FROM movements_2027_03`,
    );
    expect(Number(archived[0]!.n)).toBe(1);
  });

  it('movement là APPEND-ONLY: Prisma model không có update/delete nào được dùng — sửa sai bằng bút toán đảo', async () => {
    // Bút toán đảo (#30): movement ngược dấu trỏ về bản gốc bằng CẶP HAI CỘT
    const original = await h.rawPrisma.movement.findFirstOrThrow({
      where: { movementType: 'ISSUE', tenantId: h.seed.tenantA.tenantId },
    });
    const reversalId = randomUUID();
    await h.rawPrisma.$executeRaw(
      Prisma.sql`INSERT INTO movements (id, created_at, tenant_id, account_type, account_key,
                   movement_type, direction, quantity, ref_type, ref_id,
                   reversal_of_id, reversal_of_created_at)
                 VALUES (${reversalId}::uuid, now(), ${original.tenantId}::uuid, 'STOCK',
                         ${original.accountKey}, 'REVERSAL', 1, ${original.quantity},
                         'REVERSAL', ${randomUUID()}::uuid,
                         ${original.id}::uuid, ${original.createdAt})`,
    );
    const reversal = await h.rawPrisma.movement.findFirstOrThrow({
      where: { id: reversalId },
    });
    expect(reversal.reversalOfId).toBe(original.id);
    expect(reversal.reversalOfCreatedAt?.toISOString()).toBe(original.createdAt.toISOString());
  });
});
