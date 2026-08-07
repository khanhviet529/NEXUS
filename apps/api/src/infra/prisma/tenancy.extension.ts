import { Prisma } from '@prisma/client';
import { classifyTenancy } from '@nexus/shared';

/**
 * [CORE] Tenancy extension — spec §4.4b, quyết định #36/#37/#44.
 *
 * Query extension ($extends, KHÔNG dùng $use — deprecated) tự chèn tenantId
 * từ CLS vào MỌI query top-level. Không tin service tự nhớ.
 *
 *   GLOBAL  → passthrough
 *   HYBRID  → read: tenant_id = current OR IS NULL · create: mặc định current
 *   TENANT  → BẮT BUỘC inject; không có tenantId trong context → THROW (fail-closed)
 *
 * Giới hạn đã biết (spec §6.4 — ba lớp):
 *   - Lớp 1 (file này): chỉ chặn query TOP-LEVEL. Extension không có hook riêng
 *     cho nested operation.
 *   - Lớp 2 (repository): nested create truyền tenant qua COMPOSITE FK RELATION
 *     (Prisma tự set cả hai cột FK từ bản ghi cha — đây chính là lý do §6.4 bắt
 *     buộc composite FK). Repository gọi validateNestedTenancy() để chặn
 *     tenantId lạ cài trong cây data.
 *   - Lớp 3 (DB): tenant_id NOT NULL + composite FK — lưới cuối, test #3b.
 *   - Raw SQL không đi qua đây — repository tự thêm WHERE tenant_id (§4.9).
 */

export interface TenancyContext {
  tenantId?: string;
  bypass: boolean;
}

/** Op có `where` là WhereUniqueInput — inject field trực tiếp (extendedWhereUnique, Prisma ≥5) */
const UNIQUE_WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'delete',
  'upsert',
]);

/** Op có `where` là WhereInput thường — bọc AND */
const FILTER_WHERE_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'updateMany',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn']);

interface MutableArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
}

function injectCreateData(
  data: Record<string, unknown> | Record<string, unknown>[],
  tenantId: string,
  model: string,
): void {
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows) {
    const existing = row['tenantId'];
    if (existing !== undefined && existing !== tenantId) {
      throw new Error(
        `[TENANCY] ${model}.create mang tenantId='${String(existing)}' khác tenant hiện hành — từ chối (spec §4.4b)`,
      );
    }
    row['tenantId'] = tenantId;
  }
}

export function createTenancyExtension(getCtx: () => TenancyContext) {
  return Prisma.defineExtension({
    name: 'tenancy',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const cls = classifyTenancy(model);
          if (cls === undefined) {
            // Không thể xảy ra nếu assertExhaustiveTenancyPolicy đã chạy lúc boot,
            // nhưng fail-closed vẫn hơn
            throw new Error(`[TENANCY] Model ${model} chưa được phân loại trong TENANCY_POLICY`);
          }
          if (cls === 'GLOBAL') return query(args);

          const ctx = getCtx();
          if (ctx.bypass) return query(args);

          const a = args as MutableArgs;

          if (cls === 'HYBRID') {
            // tenant_id = current OR IS NULL (ưu tiên dòng có tenant xử lý ở service)
            if (FILTER_WHERE_OPS.has(operation)) {
              const scope = ctx.tenantId
                ? { OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] }
                : { tenantId: null };
              a.where = a.where ? { AND: [a.where, scope] } : scope;
            }
            if (CREATE_OPS.has(operation) && a.data && ctx.tenantId) {
              // HYBRID cho phép ghi dòng global (tenantId: null tường minh);
              // không khai gì → mặc định tenant hiện hành
              const rows = Array.isArray(a.data) ? a.data : [a.data];
              for (const row of rows) {
                if (!('tenantId' in row)) row['tenantId'] = ctx.tenantId;
              }
            }
            return query(args);
          }

          // ---- TENANT: fail-closed ----
          if (!ctx.tenantId) {
            throw new Error(
              `[TENANCY] ${model}.${operation} (TENANT) không có tenantId trong context — fail-closed (spec §4.4b). Worker/seed phải set CLS trước.`,
            );
          }
          const tenantId = ctx.tenantId;

          if (UNIQUE_WHERE_OPS.has(operation)) {
            // Ghi đè vô điều kiện — service truyền tenant khác cũng không thoát
            a.where = { ...(a.where ?? {}), tenantId };
          } else if (FILTER_WHERE_OPS.has(operation)) {
            a.where = a.where ? { AND: [a.where, { tenantId }] } : { tenantId };
          }

          if (CREATE_OPS.has(operation) && a.data) {
            injectCreateData(a.data, tenantId, model);
          }
          if (operation === 'upsert' && a.create) {
            injectCreateData(a.create, tenantId, model);
          }

          return query(args);
        },
      },
    },
  });
}

/**
 * Lớp 2 — repository gọi trước MỌI write có nested data (spec §6.4, #44).
 * Duyệt đệ quy cây data: tenantId tường minh khác tenant hiện hành ở bất kỳ
 * tầng nested nào → throw. (Việc TRUYỀN tenant xuống child do composite FK
 * relation của Prisma đảm nhiệm; việc của lớp này là chặn giá trị lạ.)
 */
export function validateNestedTenancy(
  data: unknown,
  tenantId: string,
  path = 'data',
): void {
  if (Array.isArray(data)) {
    data.forEach((item, i) => validateNestedTenancy(item, tenantId, `${path}[${i}]`));
    return;
  }
  if (data === null || typeof data !== 'object') return;

  const obj = data as Record<string, unknown>;
  const explicit = obj['tenantId'];
  if (typeof explicit === 'string' && explicit !== tenantId) {
    throw new Error(
      `[TENANCY] tenantId lạ '${explicit}' tại ${path} — nested write bị từ chối (spec §6.4)`,
    );
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && typeof value === 'object') {
      validateNestedTenancy(value, tenantId, `${path}.${key}`);
    }
  }
}
