#!/usr/bin/env node
/**
 * Check #2 + #4 (working-agreement §4.1):
 *   - Mọi model trong schema.prisma phải được phân loại trong TENANCY_POLICY
 *   - Mọi model có deletedAt phải nằm trong SOFT_DELETE_MODELS (và ngược lại)
 *   - model-registry.gen.ts phải khớp schema (chưa chạy lại codegen → đỏ)
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const schema = readFileSync(resolve(root, 'apps/api/prisma/schema.prisma'), 'utf8');
const policySrc = readFileSync(
  resolve(root, 'packages/shared/src/tenancy-policy.ts'),
  'utf8',
);
const softSrc = readFileSync(
  resolve(root, 'packages/shared/src/soft-delete-models.ts'),
  'utf8',
);
const genSrc = readFileSync(
  resolve(root, 'apps/api/src/infra/prisma/model-registry.gen.ts'),
  'utf8',
);

// --- schema ---
const modelBlocks = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
const models = modelBlocks.map(([, name]) => name);
const softDeleteInSchema = modelBlocks
  .filter(([, , body]) => /^\s*deletedAt\s/m.test(body))
  .map(([, name]) => name);

// --- policy (parse mảng chuỗi trong block GLOBAL/HYBRID/TENANT) ---
function parseArray(src, key) {
  const m = src.match(new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) return [];
  return [...m[1].matchAll(/'(\w+)'/g)].map(([, name]) => name);
}
const policy = [
  ...parseArray(policySrc, 'GLOBAL'),
  ...parseArray(policySrc, 'HYBRID'),
  ...parseArray(policySrc, 'TENANT'),
];
const softListMatch = softSrc.match(/SOFT_DELETE_MODELS\s*=\s*\[([\s\S]*?)\]/);
const softList = softListMatch
  ? [...softListMatch[1].matchAll(/'(\w+)'/g)].map(([, name]) => name)
  : [];

const errors = [];

const unclassified = models.filter((m) => !policy.includes(m));
if (unclassified.length)
  errors.push(`Model chưa phân loại tenancy: ${unclassified.join(', ')}`);

const stale = policy.filter((m) => !models.includes(m));
if (stale.length) errors.push(`TENANCY_POLICY có model không tồn tại: ${stale.join(', ')}`);

const dup = policy.filter((m, i) => policy.indexOf(m) !== i);
if (dup.length) errors.push(`Model bị phân loại HAI nhóm: ${[...new Set(dup)].join(', ')}`);

const softMissing = softDeleteInSchema.filter((m) => !softList.includes(m));
if (softMissing.length)
  errors.push(`Model có deletedAt chưa vào SOFT_DELETE_MODELS: ${softMissing.join(', ')}`);

const softStale = softList.filter((m) => !softDeleteInSchema.includes(m));
if (softStale.length)
  errors.push(`SOFT_DELETE_MODELS có model không có deletedAt: ${softStale.join(', ')}`);

// --- .gen.ts khớp schema ---
for (const m of models) {
  if (!genSrc.includes(`"${m}"`)) {
    errors.push(
      `model-registry.gen.ts thiếu ${m} — chạy: node tools/checks/gen-model-list.mjs`,
    );
  }
}

if (errors.length) {
  console.error('❌ check-tenancy-policy:');
  for (const e of errors) console.error('   - ' + e);
  process.exit(1);
}
console.log(`✅ check-tenancy-policy: ${models.length} model, ${softList.length} soft-delete`);
