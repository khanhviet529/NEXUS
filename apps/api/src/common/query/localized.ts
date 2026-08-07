/**
 * [CORE] Đa ngôn ngữ tầng dữ liệu — spec §3.10, quyết định #41/#51.
 *
 * MỘT hàm resolve, dùng ở BỐN nơi (response, filter, sort, quick search) —
 * lệch nhau là ra bug "hiển thị thấy mà tìm không ra".
 *
 * Chiến lược cột (đã chốt #41): chuẩn hoá Ở TẦNG ỨNG DỤNG ghi vào cột thường
 *   <field>ViSearch = normalize(vi)
 *   <field>EnSearch = normalize(en ?? vi)   ← fallback ở TẦNG DỮ LIỆU
 * Filter/sort/q chạy trên cột search (đã fallback sẵn); display resolve từ
 * JSONB với fallback vi. KHÔNG dùng unaccent() trong index/generated column.
 */

export const SUPPORTED_LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export interface LocalizedText {
  vi?: string;
  en?: string;
  [k: string]: string | undefined;
}

/** Bỏ dấu + lower — String.normalize('NFD'), KHÔNG phụ thuộc unaccent (§3.10) */
export function normalizeSearch(v: string | undefined | null): string | null {
  if (!v) return null;
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // dấu thanh/dấu mũ
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** Nơi 1 — RESPONSE: giải quyết theo locale, fallback vi (§3.10) */
export function resolveLocalizedValue(
  value: unknown,
  locale: Locale,
): string | null {
  if (value === null || value === undefined || typeof value !== 'object') return null;
  const obj = value as LocalizedText;
  return obj[locale] ?? obj.vi ?? null;
}

/** Nơi 2/3/4 — FILTER/SORT/Q: tên cột search Prisma theo locale (đã fallback ở write) */
export function searchColumnFor(field: string, locale: Locale): string {
  return `${field}${locale === 'vi' ? 'Vi' : 'En'}Search`;
}

/** Repository gọi trên MỌI đường ghi (§3.10) — tính cả hai cột search */
export function buildSearchColumns(
  field: string,
  value: LocalizedText | undefined,
): Record<string, string | null> {
  if (!value) return {};
  return {
    [searchColumnFor(field, 'vi')]: normalizeSearch(value.vi),
    [searchColumnFor(field, 'en')]: normalizeSearch(value.en ?? value.vi),
  };
}
