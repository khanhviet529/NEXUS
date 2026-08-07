import { Prisma } from '@prisma/client';
import { isSoftDeleteModel } from '@nexus/shared';

/**
 * [CORE] Soft-delete extension — spec §4.5, quyết định #38/#46.
 *
 * CHỈ áp cho model trong SOFT_DELETE_MODELS (test #3d: model ngoài danh sách
 * thì extension KHÔNG can thiệp — chèn deletedAt vào mọi query sẽ vỡ trên
 * model không có cột đó).
 *
 * Quy ước cho repository (ba chế độ tường minh — spec §4.5):
 *   - Không nói gì                     → chỉ bản ghi sống (inject deletedAt: null)
 *   - where.deletedAt = { not: null }  → thùng rác
 *   - where.deletedAt = {}             → tất cả (sentinel "đừng inject")
 *
 * delete/deleteMany trên model soft-delete bị CHẶN — query extension không đổi
 * được operation, nên ngữ nghĩa xoá thuộc về repository:
 *   repository.softDelete() → update { deletedAt: now() }
 *   repository.hardDelete() → delete kèm marker HARD_DELETE (job dọn rác N ngày)
 */

export const HARD_DELETE = Symbol.for('nexus.hardDelete');

const READ_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'upsert',
]);

interface MutableArgs {
  where?: Record<string, unknown>;
  [HARD_DELETE]?: boolean;
}

export function createSoftDeleteExtension() {
  return Prisma.defineExtension({
    name: 'soft-delete',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!isSoftDeleteModel(model)) return query(args); // test #3d

          const a = args as MutableArgs;

          if (READ_OPS.has(operation)) {
            const where = (a.where ?? {}) as Record<string, unknown>;
            if (!('deletedAt' in where)) {
              a.where = { ...where, deletedAt: null };
            } else if (
              typeof where['deletedAt'] === 'object' &&
              where['deletedAt'] !== null &&
              Object.keys(where['deletedAt'] as object).length === 0
            ) {
              // sentinel {} = "tất cả" → gỡ khỏi where để không lọc gì
              const rest = { ...where };
              delete rest['deletedAt'];
              a.where = rest;
            }
            return query(args);
          }

          if (operation === 'delete' || operation === 'deleteMany') {
            if (a[HARD_DELETE] === true) {
              delete a[HARD_DELETE]; // gỡ marker trước khi tới engine
              return query(args);
            }
            throw new Error(
              `[SOFT_DELETE] ${model}.${operation} bị chặn — dùng repository.softDelete() (update deletedAt) hoặc hardDelete() có chủ đích (spec §4.5)`,
            );
          }

          return query(args);
        },
      },
    },
  });
}
