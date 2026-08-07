import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { Client } from 'pg';
import { createTestApp, type TestHarness } from './setup/test-app';

/**
 * GĐ9 — test §8.2 #30: BACKUP RESTORE THẬT. "Restore thật vào môi trường
 * sạch + smoke test. Chạy trước mỗi lần go-live."
 *
 * pg_dump/pg_restore chạy qua container postgres:16-alpine DÙNG MỘT LẦN
 * (image đã có sẵn vì Testcontainers dùng đúng image này) — không phụ thuộc
 * pg_dump trên máy dev. DB nguồn là chính test DB (2 tenant + dữ liệu các
 * spec khác đã bơm); đích là database MỚI TINH trong cùng instance.
 */
describe('GĐ9 — backup → restore vào DB sạch → smoke test (§8.2 #30)', () => {
  let h: TestHarness;
  const RESTORE_DB = 'nexus_restore_check';

  /** localhost → host.docker.internal để container tạm gọi ngược ra host */
  const dockerizeUrl = (url: string): string =>
    url.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal');

  beforeAll(async () => {
    h = await createTestApp(); // đảm bảo seed + schema đã ở trong DB nguồn
  });
  afterAll(async () => {
    await h.close();
  });

  it('#30 pg_dump -Fc → pg_restore → đủ tenant/user/migration, app query được', async () => {
    const sourceUrl = process.env.DATABASE_URL!;

    // 1. BACKUP — custom format qua stdout
    const dump = execFileSync(
      'docker',
      ['run', '--rm', '--add-host=host.docker.internal:host-gateway',
        'postgres:16-alpine', 'pg_dump', '-Fc', '--no-owner', dockerizeUrl(sourceUrl)],
      { maxBuffer: 512 * 1024 * 1024 },
    );
    expect(dump.length).toBeGreaterThan(10_000); // dump rỗng = backup hỏng

    // 2. MÔI TRƯỜNG SẠCH — database mới tinh trong cùng instance
    const admin = new Client({ connectionString: sourceUrl });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${RESTORE_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${RESTORE_DB}`);
    await admin.end();

    const restoreUrl = sourceUrl.replace(/\/[^/?]+(\?|$)/, `/${RESTORE_DB}$1`);

    // 3. RESTORE — nạp dump qua stdin
    execFileSync(
      'docker',
      ['run', '--rm', '-i', '--add-host=host.docker.internal:host-gateway',
        'postgres:16-alpine', 'pg_restore', '--no-owner', '--exit-on-error',
        '-d', dockerizeUrl(restoreUrl)],
      { input: dump, maxBuffer: 512 * 1024 * 1024 },
    );

    // 4. SMOKE TEST trên DB đã restore — so với DB nguồn
    const source = new Client({ connectionString: sourceUrl });
    const restored = new Client({ connectionString: restoreUrl });
    await source.connect();
    await restored.connect();
    try {
      const [srcTenants, dstTenants] = await Promise.all([
        source.query('SELECT count(*)::int AS n FROM tenants'),
        restored.query('SELECT count(*)::int AS n FROM tenants'),
      ]);
      expect(dstTenants.rows[0].n).toBe(srcTenants.rows[0].n);
      expect(dstTenants.rows[0].n).toBeGreaterThanOrEqual(2); // fixture 2 tenant §8.3

      const [srcOrders, dstOrders] = await Promise.all([
        source.query('SELECT count(*)::int AS n FROM orders'),
        restored.query('SELECT count(*)::int AS n FROM orders'),
      ]);
      expect(dstOrders.rows[0].n).toBe(srcOrders.rows[0].n);

      // Migration version khớp — restore đúng schema đời mới nhất
      const [srcMig, dstMig] = await Promise.all([
        source.query(
          'SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1',
        ),
        restored.query(
          'SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1',
        ),
      ]);
      expect(dstMig.rows[0].migration_name).toBe(srcMig.rows[0].migration_name);

      // Partition + trigger sống sót qua restore (điểm hay vỡ nhất)
      const partitions = await restored.query(
        `SELECT count(*)::int AS n FROM pg_class WHERE relname LIKE 'audit_logs_2026%'`,
      );
      expect(partitions.rows[0].n).toBeGreaterThanOrEqual(1);
      const trigger = await restored.query(
        `SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE '%audit%'`,
      );
      expect(trigger.rows[0].n).toBeGreaterThanOrEqual(1);

      // Ghi trạng thái backup gần nhất cho màn ops (§5C.8)
      await source.query(
        `INSERT INTO settings (id, updated_at, key, value)
         VALUES (gen_random_uuid(), now(), 'ops.lastBackupAt', $1::jsonb)
         ON CONFLICT DO NOTHING`,
        [JSON.stringify({ at: new Date().toISOString(), method: 'pg_dump -Fc' })],
      );
    } finally {
      await source.end();
      await restored.end();
      const cleanup = new Client({ connectionString: sourceUrl });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS ${RESTORE_DB} WITH (FORCE)`);
      await cleanup.end();
    }
  }, 240_000);
});
