import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ALL_CANARIES, CANARY_SEVERITY } from './canary';

/**
 * TẦNG 2 — INTERCEPTOR (C0.0). Tám bất biến chạy trên MỌI response JSON.
 *
 * Vì sao không bấm rồi nhìn: mắt người bỏ sót đúng những lỗi nguy hiểm nhất.
 * Một số tiền trả về kiểu `number` thay vì chuỗi trông y hệt nhau trên màn
 * hình; một dòng của tenant khác lẫn giữa 50 dòng đúng cũng vậy.
 *
 * KHÔNG throw. Ghi rồi đi tiếp — mục tiêu là ĐẾM HẾT, không dừng ở cái đầu.
 */
export interface Violation {
  ts: string;
  method: string;
  url: string;
  status: number;
  invariant: string;
  expected: string;
  actual: string;
  snippet: string;
}

const MONEY_KEY = /amount|total|price|salary|cost|balance/i;
const DATE_KEY = /At$|Date$/;
const ISO_Z = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

/** Dấu vết không được lộ ở 5xx (§4.10) */
const LEAK_MARKERS = [
  /\bat\s+\w+\s+\(.*:\d+:\d+\)/, // stack trace
  /SELECT\s+.+\s+FROM\s+/i, // câu SQL
  /[A-Za-z]:\\[\w\\.-]+/, // đường dẫn Windows
  /\/(home|Users|app)\/[\w/.-]+/, // đường dẫn Unix
];

function walk(node: unknown, path: string, visit: (p: string, v: unknown) => void): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      visit(`${path}[${i}]`, v);
      walk(v, `${path}[${i}]`, visit);
    });
    return;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    visit(path ? `${path}.${k}` : k, v);
    walk(v, path ? `${path}.${k}` : k, visit);
  }
}

export interface ResponseFacts {
  method: string;
  url: string;
  status: number;
  headers: Record<string, string>;
  bodyText: string;
  json: unknown;
  setCookies: string[];
}

export function checkInvariants(r: ResponseFacts): Violation[] {
  const out: Violation[] = [];
  const now = new Date().toISOString();
  const add = (invariant: string, expected: string, actual: string, snippet = '') =>
    out.push({
      ts: now,
      method: r.method,
      url: r.url,
      status: r.status,
      invariant,
      expected,
      actual,
      snippet: snippet.slice(0, 200),
    });

  const body = r.json as Record<string, unknown> | null;
  const isList = !!body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data);

  // ── I1 hình dạng danh sách (§3.2, §3.3) ─────────────────────────────────
  if (r.status === 200 && isList) {
    const meta = (body as { meta?: Record<string, unknown> }).meta;
    if (!meta) add('I1', 'có `meta`', 'thiếu `meta`');
    else {
      for (const k of ['page', 'limit', 'total', 'totalPages', 'hasNext']) {
        if (!(k in meta)) add('I1', `meta.${k}`, `thiếu meta.${k}`, JSON.stringify(meta));
      }
    }
  }

  // ── I2 hình dạng lỗi (§3.6) ─────────────────────────────────────────────
  if (r.status >= 400 && body) {
    for (const k of ['code', 'message', 'traceId']) {
      if (typeof (body as Record<string, unknown>)[k] !== 'string') {
        add('I2', `${k} là chuỗi`, `${k}=${typeof (body as Record<string, unknown>)[k]}`, r.bodyText);
      }
    }
    if (r.status === 422) {
      const d = (body as { details?: unknown }).details;
      const ok =
        d !== null &&
        typeof d === 'object' &&
        Object.values(d as Record<string, unknown>).every(
          (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
        );
      if (!ok) add('I2', '422 details: map field → mảng chuỗi', JSON.stringify(d), r.bodyText);
    }
  }

  // ── I3 tiền là CHUỖI (§3.7) · I4 ngày ISO-Z · I8 không dùng "" thay null ─
  walk(r.json, '', (p, v) => {
    const key = p.split('.').pop() ?? '';
    if (MONEY_KEY.test(key) && typeof v === 'number') {
      add('I3', 'tiền/số lượng là chuỗi', `${p} = number(${v})`);
    }
    if (DATE_KEY.test(key) && typeof v === 'string' && v && !ISO_Z.test(v)) {
      add('I4', 'ISO-8601 kết thúc Z', `${p} = "${v}"`);
    }
    if (v === '') add('I8', 'null khi không có giá trị', `${p} = "" (chuỗi rỗng)`);
  });

  // ── I5 canary ────────────────────────────────────────────────────────────
  for (const c of ALL_CANARIES) {
    if (r.bodyText.includes(c)) {
      add('I5', 'không có canary trong body', `${CANARY_SEVERITY[c]}: ${c}`, r.bodyText);
    }
  }

  // ── I6 header ────────────────────────────────────────────────────────────
  if (!r.headers['x-request-id']) add('I6', 'echo X-Request-Id', 'thiếu header');
  if (r.status === 429 && !r.headers['retry-after']) add('I6', '429 có Retry-After', 'thiếu');
  if (r.status >= 500) {
    for (const re of LEAK_MARKERS) {
      if (re.test(r.bodyText)) {
        add('I6', '5xx không lộ stack/SQL/đường dẫn', `khớp ${String(re)}`, r.bodyText);
        break;
      }
    }
  }

  // ── I7 cookie (§4.3b) ────────────────────────────────────────────────────
  for (const c of r.setCookies) {
    const name = c.split('=')[0]?.trim() ?? '';
    const httpOnly = /httponly/i.test(c);
    if (/access|refresh/i.test(name) && !httpOnly) {
      add('I7', `${name} phải HttpOnly`, c);
    }
    if (/csrf/i.test(name)) {
      if (httpOnly) add('I7', 'csrf_token KHÔNG được HttpOnly', c);
      if (!/samesite=lax/i.test(c)) add('I7', 'csrf_token SameSite=Lax', c);
    }
  }

  return out;
}

export function writeViolations(file: string, rows: Violation[]): void {
  if (rows.length === 0) return;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8');
}
