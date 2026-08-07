#!/usr/bin/env node
/**
 * [CORE] Build-time codegen — spec §4.4b, quyết định #57.
 * Đọc schema.prisma → sinh danh sách model + model có deleted_at, để
 * assertExhaustiveTenancyPolicy / assertExhaustiveSoftDeletePolicy chạy được
 * lúc khởi động mà KHÔNG phụ thuộc API nội bộ Prisma (Prisma.dmmf).
 *
 * Chạy: node tools/checks/gen-model-list.mjs
 * CI chạy lại và diff — file .gen.ts lệch schema là đỏ.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const schemaPath = resolve(root, 'apps/api/prisma/schema.prisma');
const outPath = resolve(root, 'apps/api/src/infra/prisma/model-registry.gen.ts');

const schema = readFileSync(schemaPath, 'utf8');

// Tách từng block model { ... }
const modelBlocks = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
const models = modelBlocks.map(([, name]) => name);
const softDeleteModels = modelBlocks
  .filter(([, , body]) => /^\s*deletedAt\s/m.test(body))
  .map(([, name]) => name);

if (models.length === 0) {
  console.error('gen-model-list: không tìm thấy model nào trong schema.prisma');
  process.exit(1);
}

const header = `// ============================================================
// SINH TỰ ĐỘNG từ apps/api/prisma/schema.prisma — KHÔNG SỬA TAY.
// Chạy lại: node tools/checks/gen-model-list.mjs
// ============================================================
`;

const content = `${header}
/** Toàn bộ model trong schema — nguồn cho assertExhaustiveTenancyPolicy (§4.4b) */
export const ALL_MODELS = ${JSON.stringify(models, null, 2)} as const;

/** Model có cột deletedAt — nguồn cho assertExhaustiveSoftDeletePolicy (§4.5) */
export const MODELS_WITH_DELETED_AT = ${JSON.stringify(softDeleteModels, null, 2)} as const;
`;

writeFileSync(outPath, content, 'utf8');
console.log(
  `gen-model-list: ${models.length} model, ${softDeleteModels.length} soft-delete → ${outPath}`,
);
