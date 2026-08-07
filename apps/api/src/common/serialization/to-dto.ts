import { plainToInstance } from 'class-transformer';
import { FIELD_GROUPS } from '@nexus/shared';
import type { ClassConstructor } from 'class-transformer';

/**
 * plainToInstance KHÔNG truyền groups sẽ RƠI field có @Expose({groups}) ngay
 * từ controller — SerializeInterceptor phía sau không thể hồi sinh field đã mất.
 *
 * Quy ước: controller dùng toDto() (giữ ĐỦ field — groups superset);
 * việc CHE theo quyền là của SerializeInterceptor (§4.4c) — một nơi duy nhất.
 */
const ALL_GROUPS = Object.keys(FIELD_GROUPS);

export function toDto<T, V>(cls: ClassConstructor<T>, plain: V[]): T[];
export function toDto<T, V>(cls: ClassConstructor<T>, plain: V): T;
export function toDto<T, V>(cls: ClassConstructor<T>, plain: V | V[]): T | T[] {
  return plainToInstance(cls, plain as object, { groups: ALL_GROUPS }) as T | T[];
}
