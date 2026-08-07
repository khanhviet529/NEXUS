import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Sinh openapi.json KHÔNG cần DB/Redis — spec §2.4.
 * Luồng: openapi.json → orval → packages/api-client → apps/web.
 * CI diff file này để bắt thay đổi contract (§8.1 Contract test).
 */
process.env.GEN_OPENAPI = '1';
process.env.DATABASE_URL ??= 'postgresql://gen:gen@localhost:5432/gen';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_SECRET ??= 'gen-openapi-only-not-a-real-secret-0000';

async function main(): Promise<void> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { buildSwaggerDocument } = await import('../src/bootstrap');

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api/v1');
  const document = buildSwaggerDocument(app);

  const out = resolve(__dirname, '../openapi.json');
  writeFileSync(out, JSON.stringify(document, null, 2), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`openapi.json → ${out} (${Object.keys(document.paths).length} path)`);
  await app.close();
}

void main();
