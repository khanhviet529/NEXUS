import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

/**
 * [CORE] Hạ tầng test — spec §8.3: Testcontainers Postgres THẬT (partition,
 * ltree, pg_trgm chạy được), không mock DB.
 *
 * Luồng: container → prisma db push (schema) → manual-ddl.sql (partial unique,
 * ltree, partition) → export DATABASE_URL/REDIS_URL cho toàn bộ test.
 */
let pg: StartedPostgreSqlContainer;
let redis: StartedTestContainer;

export async function setup(): Promise<void> {
  [pg, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
  ]);

  const dbUrl = pg.getConnectionUri();
  process.env.DATABASE_URL = dbUrl;
  process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  process.env.JWT_SECRET = 'test-secret-0123456789-0123456789-abc';
  process.env.NODE_ENV = 'test';

  // Áp schema
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'inherit',
  });

  // Áp DDL thủ công — cùng file với migration thật, không lệch nhau
  const ddl = readFileSync(resolve(__dirname, '../../prisma/sql/manual-ddl.sql'), 'utf8');
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(ddl);
  } finally {
    await client.end();
  }
}

export async function teardown(): Promise<void> {
  await Promise.all([pg?.stop(), redis?.stop()]);
}
