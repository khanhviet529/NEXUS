import type { Kysely } from 'kysely';
import type { PermissionCode } from '@nexus/shared';
import type { ReportDatabase } from '../../infra/kysely/kysely.service';
import type { Locale } from '../../common/query/localized';
import type { Scope } from '../auth/permission-resolver.service';

/**
 * [CORE] A1 — Report framework (§5B.1/A1): báo cáo là DỮ LIỆU.
 * Khai một lần → tự sinh: endpoint meta/run/export, kiểm quyền, scope,
 * cache, dòng tổng, drill-down. "Khai báo 1 báo cáo mới dưới 2 giờ."
 */

export type ReportParamType = 'dateRange' | 'select' | 'orgUnit' | 'text';

export interface ReportParamDef {
  key: string;
  type: ReportParamType;
  label: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
}

export interface ReportColumnDef {
  key: string;
  label: string;
  type?: 'text' | 'money' | 'number' | 'date';
  /** Dòng tổng cộng ở footer (§5.5) */
  summary?: 'sum' | 'count' | 'avg';
  /** §4.4c nơi 3: cột chỉ hiện khi user có field:<group> */
  fieldGroup?: string;
}

export interface ReportQueryContext {
  tenantId: string;
  userId: string;
  /** ĐÃ resolve từ Ability — nhúng vào WHERE, không lọc sau (§4.4) */
  scope: Scope;
  orgUnitIds: string[] | null; // descendants đã tính sẵn; null = không giới hạn
  /** Locale request (CLS §3.1c) — display resolve qua resolveLocaleExpr (§12 #51) */
  locale: Locale;
  params: Record<string, unknown>;
  db: Kysely<ReportDatabase>;
}

export interface ReportDef {
  id: string;
  name: string;
  /** PHẢI có trong packages/shared/src/permissions.ts — registry là nguồn duy nhất */
  permission: PermissionCode;
  params: ReportParamDef[];
  columns: ReportColumnDef[];
  /** Kysely/raw — CHỈ ĐỌC (§4.9), PHẢI áp scope từ ctx (cookbook §7 ⚠️) */
  query: (ctx: ReportQueryContext) => Promise<Array<Record<string, unknown>>>;
  /** Link bấm được từ mỗi dòng → màn danh sách đã filter */
  drilldown?: (row: Record<string, unknown>) => string;
  /** Cache theo (tenant, params) — giây */
  cacheTtlSeconds?: number;
}

export const dateRange = (key: string, label = 'Khoảng ngày'): ReportParamDef => ({
  key,
  type: 'dateRange',
  label,
  required: true,
});

export const orgUnit = (key = 'orgUnitId', label = 'Đơn vị'): ReportParamDef => ({
  key,
  type: 'orgUnit',
  label,
});

export const select = (
  key: string,
  label: string,
  options: Array<{ value: string; label: string }>,
): ReportParamDef => ({ key, type: 'select', label, options });
