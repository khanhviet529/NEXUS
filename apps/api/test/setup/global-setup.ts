import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { execSync } from 'node:child_process';

import { resolve } from 'node:path';


/**
 * [CORE] Hạ tầng test — spec §8.3: Testcontainers Postgres THẬT (partition,
 * ltree, pg_trgm chạy được), không mock DB.
 *
 * Luồng: container → prisma db push (schema) → manual-ddl.sql (partial unique,
 * ltree, partition) → export DATABASE_URL/REDIS_URL cho toàn bộ test.
 */
let pg: StartedPostgreSqlContainer;
let redis: StartedTestContainer;
let minio: StartedTestContainer;

export async function setup(): Promise<void> {
  [pg, redis, minio] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    // GĐ7 — MinIO thật cho files/export (presigned PUT/GET không mock được)
    new GenericContainer('minio/minio:latest')
      .withCommand(['server', '/data'])
      .withEnvironment({
        MINIO_ROOT_USER: 'test-minio',
        MINIO_ROOT_PASSWORD: 'test-minio-secret',
      })
      .withExposedPorts(9000)
      .start(),
  ]);

  const dbUrl = pg.getConnectionUri();
  process.env.DATABASE_URL = dbUrl;
  process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  process.env.JWT_SECRET = 'test-secret-0123456789-0123456789-abc';
  process.env.NODE_ENV = 'test';
  process.env.S3_ENDPOINT = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
  process.env.S3_ACCESS_KEY = 'test-minio';
  process.env.S3_SECRET_KEY = 'test-minio-secret';
  process.env.S3_BUCKET = 'nexus-test';
  process.env.S3_REGION = 'us-east-1';

  // Tạo bucket test — SDK là dependency của @nexus/api
  const { S3Client, CreateBucketCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: 'us-east-1',
    credentials: { accessKeyId: 'test-minio', secretAccessKey: 'test-minio-secret' },
    forcePathStyle: true,
  });
  await s3.send(new CreateBucketCommand({ Bucket: 'nexus-test' }));
  s3.destroy();

  // Replay ĐÚNG lịch sử migration (gồm manual DDL + trigger audit) —
  // test DB giống production, và mỗi lần chạy test là một lần kiểm chứng migration
  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'inherit',
  });
}

export async function teardown(): Promise<void> {
  await Promise.all([pg?.stop(), redis?.stop(), minio?.stop()]);
}
