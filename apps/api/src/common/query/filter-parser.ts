import { AppException } from '../errors/app.exception';
import {
  DEFAULT_OPERATORS,
  type FieldConfig,
  type FilterOperator,
  type QueryConfig,
} from './query-config';
import { normalizeSearch, searchColumnFor, type Locale } from './localized';

/**
 * [CORE] FilterParser — spec §3.5. Cú pháp filter[<field>][<op>]=<value>
 * → Prisma.WhereInput. Whitelist BẮT BUỘC; field ngoài whitelist → 400.
 *
 * Localized field: chạy trên cột <field>_<locale>_search (đã fallback ở
 * write time §3.10) — cùng resolve với sort và q (quyết định #51).
 * `contains` không phân biệt hoa thường VÀ KHÔNG DẤU nhờ normalizeSearch.
 */
export class FilterParser {
  constructor(
    private readonly config: QueryConfig,
    private readonly locale: Locale,
    /** Field bị cấm theo quyền (§4.4c) — sort/filter đều loại */
    private readonly forbiddenFields: ReadonlySet<string> = new Set(),
  ) {}

  /**
   * @param query raw query object của express (đã qua ValidationPipe cho các
   *              key khai báo; filter[...] đọc thô từ req.query)
   */
  parse(query: Record<string, unknown>): Record<string, unknown> {
    const conditions: Record<string, unknown>[] = [];

    const filter = query['filter'];
    if (filter && typeof filter === 'object') {
      for (const [field, ops] of Object.entries(filter as Record<string, unknown>)) {
        const cfg = this.assertAllowed(field);
        if (typeof ops === 'object' && ops !== null) {
          for (const [op, raw] of Object.entries(ops as Record<string, unknown>)) {
            conditions.push(this.buildCondition(field, cfg, op as FilterOperator, String(raw)));
          }
        } else {
          // filter[status]=pending — op mặc định eq (§3.5)
          conditions.push(this.buildCondition(field, cfg, 'eq', String(ops)));
        }
      }
    }

    const q = query['q'];
    if (typeof q === 'string' && q.trim() !== '') {
      conditions.push(this.buildQuickSearch(q.trim()));
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  private assertAllowed(field: string): FieldConfig {
    const cfg = this.config.filterable[field];
    if (!cfg || this.forbiddenFields.has(field)) {
      throw new AppException('COMMON.BAD_REQUEST', {
        message: `Trường filter không hợp lệ: ${field}`,
      });
    }
    return cfg;
  }

  private buildCondition(
    field: string,
    cfg: FieldConfig,
    op: FilterOperator,
    raw: string,
  ): Record<string, unknown> {
    const allowed = cfg.operators ?? DEFAULT_OPERATORS[cfg.kind];
    if (!allowed.includes(op)) {
      throw new AppException('COMMON.BAD_REQUEST', {
        message: `Toán tử ${op} không áp dụng được cho ${field}`,
      });
    }

    // Localized → cột search + giá trị normalize (§3.10)
    const isLocalized = cfg.kind === 'localized';
    const column = isLocalized
      ? searchColumnFor(field, this.locale)
      : (cfg.path ?? field);
    const parse = (v: string): unknown => this.coerce(cfg, isLocalized ? (normalizeSearch(v) ?? '') : v);

    let clause: Record<string, unknown>;
    switch (op) {
      case 'eq':
        clause = { equals: parse(raw) };
        break;
      case 'ne':
        clause = { not: parse(raw) };
        break;
      case 'in':
        clause = { in: raw.split(',').map(parse) };
        break;
      case 'nin':
        clause = { notIn: raw.split(',').map(parse) };
        break;
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        clause = { [op]: parse(raw) };
        break;
      case 'between': {
        const [a, b] = raw.split(',');
        if (a === undefined || b === undefined) {
          throw new AppException('COMMON.BAD_REQUEST', {
            message: `between cần dạng "a,b" cho ${field}`,
          });
        }
        clause = { gte: parse(a), lte: parse(b) };
        break;
      }
      case 'contains':
        clause = isLocalized
          ? { contains: parse(raw) } // cột search đã lower+bỏ dấu
          : { contains: raw, mode: 'insensitive' };
        break;
      case 'startsWith':
        clause = isLocalized ? { startsWith: parse(raw) } : { startsWith: raw, mode: 'insensitive' };
        break;
      case 'isNull':
        return raw === 'true' ? { [column]: null } : { NOT: { [column]: null } };
      default:
        throw new AppException('COMMON.BAD_REQUEST', { message: `Toán tử lạ: ${op}` });
    }
    return this.nest(column, clause);
  }

  /** field lồng nhau dùng dấu chấm: customer.name (§3.5) */
  private nest(path: string, clause: Record<string, unknown>): Record<string, unknown> {
    const parts = path.split('.');
    let node: Record<string, unknown> = clause;
    for (let i = parts.length - 1; i >= 0; i--) node = { [parts[i]!]: node };
    return node;
  }

  private coerce(cfg: FieldConfig, v: unknown): unknown {
    if (typeof v !== 'string') return v;
    switch (cfg.kind) {
      case 'number':
        if (Number.isNaN(Number(v))) {
          throw new AppException('COMMON.BAD_REQUEST', { message: `Giá trị số không hợp lệ: ${v}` });
        }
        return Number(v);
      case 'date': {
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) {
          throw new AppException('COMMON.BAD_REQUEST', { message: `Ngày không hợp lệ: ${v}` });
        }
        return d;
      }
      case 'boolean':
        return v === 'true';
      default:
        return v;
    }
  }

  private buildQuickSearch(q: string): Record<string, unknown> {
    const needle = normalizeSearch(q) ?? q;
    const ors = this.config.quickSearch.map((col) => {
      // Cột *Search: quét bằng giá trị normalize; cột thường: insensitive
      if (col.endsWith('Search')) return this.nest(col, { contains: needle });
      return this.nest(col, { contains: q, mode: 'insensitive' });
    });
    return { OR: ors };
  }
}

/**
 * [CORE] SortParser — spec §3.4: `-createdAt,code`, whitelist, id tie-breaker.
 * Localized field sort trên cột search (cùng resolve #51).
 */
export function parseSort(
  raw: string | undefined,
  config: QueryConfig,
  locale: Locale,
  forbiddenFields: ReadonlySet<string> = new Set(),
): Array<Record<string, 'asc' | 'desc'>> {
  const spec = raw && raw.trim() !== '' ? raw : config.defaultSort;
  const orderBy: Array<Record<string, 'asc' | 'desc'>> = [];
  for (const token of spec.split(',').filter(Boolean)) {
    const dir: 'asc' | 'desc' = token.startsWith('-') ? 'desc' : 'asc';
    const field = token.replace(/^-/, '');
    if (!config.sortable.includes(field) || forbiddenFields.has(field)) {
      throw new AppException('COMMON.BAD_REQUEST', {
        message: `Trường sort không hợp lệ: ${field}`,
      });
    }
    const cfg = config.filterable[field];
    const column = cfg?.kind === 'localized' ? searchColumnFor(field, locale) : (cfg?.path ?? field);
    orderBy.push({ [column]: dir });
  }
  orderBy.push({ id: 'asc' }); // tie-breaker để phân trang ổn định (§3.4)
  return orderBy;
}
