#!/usr/bin/env node
/**
 * Check #7 — kỷ luật ba tầng token (fe-preset-system §3.4, §4.3).
 *
 * Vì sao nó là "điều kiện sống của hệ bốn preset": preset chỉ có ý nghĩa nếu
 * MỌI hình thức đi qua token tầng 3. Một số màu rời rạc trong .tsx là một chỗ
 * preset không với tới được — và không ai phát hiện cho tới khi preset thứ hai
 * trông giống hệt preset thứ nhất ở đúng chỗ đó.
 *
 * Năm luật:
 *   1. appearance.tokens của preset không chứa token DERIVED
 *   2. .tsx không chứa oklch( / #hex / rgb( / hsl(
 *   3. mọi var(--x) dùng trong .tsx phải tồn tại ở semantic.css hoặc component.css
 *      (chặn dùng tầng 1 và chặn typo)
 *   4. không tồn tại themes/*.css — preset là TypeScript (§4.2)
 *   5. .tsx không dùng palette thô của Tailwind hay giá trị arbitrary hình thức
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const WEB = join(ROOT, 'apps/web/src');
const DS = join(WEB, 'design-system');
const errors = [];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(WEB);
const tsx = files.filter(
  (f) => f.endsWith('.tsx') && !f.endsWith('.spec.tsx') && !f.endsWith('.stories.tsx'),
);
const rel = (f) => relative(ROOT, f).replace(/\\/g, '/');

// ── Luật 4: không có themes/*.css ────────────────────────────────────────────
const themesDir = join(DS, 'themes');
if (existsSync(themesDir)) {
  errors.push(
    `❌ Luật 4 — tồn tại ${rel(themesDir)}. Preset là TypeScript (§4.2): themes/*.css ` +
      `tạo nguồn thứ hai cho cùng một thứ, và tên token trong CSS thì typo im lặng.`,
  );
}

// ── Luật 1: preset không đè token derived ────────────────────────────────────
const registrySrc = readFileSync(join(DS, 'registry.ts'), 'utf8');
const derivedBlock = registrySrc.match(/DERIVED_TOKENS = \[([\s\S]*?)\]/);
if (!derivedBlock) {
  errors.push('❌ Không đọc được DERIVED_TOKENS trong design-system/registry.ts');
}
const DERIVED = derivedBlock
  ? [...derivedBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  : [];

for (const f of walk(join(DS, 'presets'))) {
  if (!f.endsWith('.ts') || f.endsWith('.spec.ts')) continue;
  const src = readFileSync(f, 'utf8');
  const tokensBlock = src.match(/tokens:\s*\{([\s\S]*?)\}/);
  if (!tokensBlock) continue;
  for (const d of DERIVED) {
    if (new RegExp(`['"]?${d}['"]?\\s*:`).test(tokensBlock[1])) {
      errors.push(
        `❌ Luật 1 — ${rel(f)} đè token DERIVED "${d}". Token này sinh từ behavior; ` +
          `đặt tay ở đây là hai nguồn cho một component (§4.1).`,
      );
    }
  }
}

// ── Tập token hợp lệ cho .tsx: tầng 2 + tầng 3 ──────────────────────────────
const tokenNames = (file) => {
  const src = readFileSync(join(DS, 'tokens', file), 'utf8');
  return [...src.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]);
};
const ALLOWED_VARS = new Set([...tokenNames('semantic.css'), ...tokenNames('component.css')]);
const TIER1 = new Set(tokenNames('primitive.css'));

// ── Luật 2/3/5 trên từng .tsx ───────────────────────────────────────────────
const COLOR_LITERAL = /(oklch\(|hsl\(|rgba?\(|#[0-9a-fA-F]{3,8}\b)/;
const RAW_PALETTE =
  /\b(bg|text|border|ring|fill|stroke|from|to|via)-(red|blue|green|amber|yellow|slate|gray|grey|zinc|neutral|stone|indigo|violet|purple|pink|orange|teal|cyan|emerald|lime|sky|rose|fuchsia)-\d{2,3}\b/;
const ARBITRARY = /\b(?:bg|text|border|ring|p|px|py|pt|pb|pl|pr|m|mx|my|w|h|gap|rounded|shadow)-\[[^\]]+\]/;

/**
 * Miễn trừ — khai TƯỜNG MINH kèm lý do. Không phải nơi giấu nợ.
 */
const EXEMPT_FILES = [
  {
    re: /components\/ui\//,
    why: 'shadcn primitives — dùng theme name của Tailwind (bg-primary…), không phải palette thô',
  },
];

for (const f of tsx) {
  const src = readFileSync(f, 'utf8');
  const exempt = EXEMPT_FILES.find((e) => e.re.test(rel(f)));

  src.split('\n').forEach((line, i) => {
    const at = `${rel(f)}:${i + 1}`;
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');

    // Luật 2
    if (COLOR_LITERAL.test(code)) {
      errors.push(`❌ Luật 2 — ${at}: màu rời rạc trong .tsx. Dùng var(--token) tầng 2/3.`);
    }

    // Luật 3
    for (const m of code.matchAll(/var\((--[a-z0-9-]+)/g)) {
      const name = m[1];
      if (TIER1.has(name) && !ALLOWED_VARS.has(name)) {
        errors.push(
          `❌ Luật 3 — ${at}: dùng token TẦNG 1 "${name}". Component chỉ được dùng tầng 2/3 (§3.1).`,
        );
      } else if (!ALLOWED_VARS.has(name) && !TIER1.has(name)) {
        errors.push(
          `❌ Luật 3 — ${at}: token "${name}" không tồn tại ở semantic.css/component.css (gõ sai?).`,
        );
      }
    }

    // Luật 5
    if (!exempt) {
      if (RAW_PALETTE.test(code)) {
        errors.push(`❌ Luật 5 — ${at}: palette thô của Tailwind. Dùng token ngữ nghĩa.`);
      }
      if (ARBITRARY.test(code)) {
        errors.push(`❌ Luật 5 — ${at}: giá trị arbitrary hình thức. Thêm token tầng 3 thay vì.`);
      }
    }
  });
}

if (errors.length) {
  console.error(`❌ check-token-layers: ${errors.length} vi phạm\n`);
  for (const e of errors) console.error(`   ${e}`);
  console.error('\n   Đọc docs/fe-preset-system.md §3, §4.1, §4.3.');
  process.exit(1);
}

console.log(
  `✅ check-token-layers: ${tsx.length} .tsx, ${ALLOWED_VARS.size} token tầng 2/3, ${DERIVED.length} token derived`,
);
