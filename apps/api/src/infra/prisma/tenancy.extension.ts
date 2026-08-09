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

/**
 * HYBRID tách ĐỌC và GHI, vì hai bên có phạm vi khác nhau (test-catalog §3C).
 * `upsert` xếp vào nhóm GHI: nhánh update của nó sửa dòng đã có.
 */
const HYBRID_READ_UNIQUE_OPS = new Set(['findUnique', 'findUniqueOrThrow']);
const HYBRID_WRITE_UNIQUE_OPS = new Set(['update', 'delete', 'upsert']);
const HYBRID_WRITE_MANY_OPS = new Set(['updateMany', 'deleteMany']);

function requireTenant(
  tenantId: string | undefined,
  model: string,
  operation: string,
): asserts tenantId is string {
  if (!tenantId) {
    throw new Error(
      `[TENANCY] ${model}.${operation} (HYBRID) ghi mà không có tenantId trong context — fail-closed. ` +
        `Ghi dòng global phải đi qua bypass của SYSADMIN, không phải qua job quên runWith(ctx).`,
    );
  }
}

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
            /**
             * ĐỌC được nới, GHI thì không (test-catalog §3C).
             *
             * Bản đầu chỉ áp phạm vi cho FILTER_WHERE_OPS, nên `update`/`delete`/
             * `upsert`/`findUnique` theo `id` KHÔNG bị chặn gì cả: tenant A sửa
             * được setting của B chỉ cần biết id. Không ràng buộc DB nào cứu
             * được — composite FK và NOT NULL không biết caller thuộc tenant
             * nào. Extension là lớp DUY NHẤT chặn được (§3C/H12).
             *
             * Ba luật:
             *   đọc  → tenant hiện hành HOẶC global
             *   ghi  → CHỈ tenant hiện hành (sửa dòng global = đổi mặc định
             *          của mọi tenant, phải qua bypass của SYSADMIN)
             *   tạo  → không có tenant context thì THROW, không âm thầm tạo
             *          dòng global
             */
            const readScope = ctx.tenantId
              ? { OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] }
              : { tenantId: null };

            if (HYBRID_READ_UNIQUE_OPS.has(operation)) {
              a.where = { ...(a.where ?? {}), AND: [readScope] };
            } else if (HYBRID_WRITE_UNIQUE_OPS.has(operation)) {
              requireTenant(ctx.tenantId, model, operation);
              a.where = { ...(a.where ?? {}), tenantId: ctx.tenantId };
            } else if (HYBRID_WRITE_MANY_OPS.has(operation)) {
              requireTenant(ctx.tenantId, model, operation);
              const own = { tenantId: ctx.tenantId };
              a.where = a.where ? { AND: [a.where, own] } : own;
            } else if (FILTER_WHERE_OPS.has(operation)) {
              a.where = a.where ? { AND: [a.where, readScope] } : readScope;
            }

            if (CREATE_OPS.has(operation) && a.data) {
              requireTenant(ctx.tenantId, model, operation);
              injectCreateData(a.data, ctx.tenantId!, model);
            }
            if (operation === 'upsert' && a.create) {
              injectCreateData(a.create, ctx.tenantId!, model);
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
