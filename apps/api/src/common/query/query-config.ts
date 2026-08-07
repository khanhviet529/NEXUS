/**
 * [CORE] Khai báo whitelist cho MỖI endpoint danh sách — spec §3.4, §3.5.
 * Field ngoài whitelist → 400. Whitelist chỉ chứa field ĐÃ CÓ INDEX.
 * Field nhạy cảm bị LOẠI theo quyền (§4.4c) — truyền qua forbiddenFields.
 */

export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'in'
  | 'nin'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'contains'
  | 'startsWith'
  | 'isNull';

export type FieldKind = 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'localized';

export interface FieldConfig {
  kind: FieldKind;
  /** Đường dẫn Prisma nếu khác tên field (vd 'user.email' cho quan hệ) */
  path?: string;
  /** Toán tử cho phép — mặc định theo kind */
  operators?: FilterOperator[];
}

export interface QueryConfig {
  /** field → cấu hình. Có mặt = được filter */
  filterable: Record<string, FieldConfig>;
  /** field được sort (phải có index) */
  sortable: string[];
  /** q quét những cột nào (cột search cho localized) */
  quickSearch: string[];
  /** sort mặc định */
  defaultSort: string;
}

export const DEFAULT_OPERATORS: Record<FieldKind, FilterOperator[]> = {
  string: ['eq', 'ne', 'in', 'nin', 'contains', 'startsWith', 'isNull'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'isNull'],
  date: ['eq', 'gt', 'gte', 'lt', 'lte', 'between', 'isNull'],
  boolean: ['eq'],
  enum: ['eq', 'ne', 'in', 'nin'],
  localized: ['contains', 'startsWith', 'eq'], // chạy trên cột *_search
};
