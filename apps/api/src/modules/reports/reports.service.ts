import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AppException } from '../../common/errors/app.exception';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { KyselyService } from '../../infra/kysely/kysely.service';
import { RedisService } from '../../infra/redis/redis.service';
import { AbilityService } from '../auth/ability.service';
import { OrgTreeRepository } from '../auth/org-tree.repository';
import { REPORTS } from './report-registry';
import type { ReportDef } from './report.types';

export interface ReportRunResult {
  columns: Array<{ key: string; label: string; type?: string }>;
  rows: Array<Record<string, unknown>>;
  summary: Record<string, string>;
  drilldowns: Array<string | null>;
  cached: boolean;
}

/**
 * [CORE] A1 runtime — sinh tự động từ ReportDef: kiểm quyền, scope,
 * cache (tenant, params), dòng tổng, drill-down, LỌC CỘT theo field-level
 * (§4.4c nơi 3 — báo cáo tổng hợp cũng phải lọc cột).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly kysely: KyselyService,
    private readonly redis: RedisService,
    private readonly ability: AbilityService,
    private readonly orgTree: OrgTreeRepository,
  ) {}

  async listForUser(user: AuthUser): Promise<Array<{ id: string; name: string }>> {
    const ability = await this.ability.forUser(user);
    return REPORTS.filter((r) => ability.can(r.permission)).map((r) => ({
      id: r.id,
      name: r.name,
    }));
  }

  private async getAuthorized(user: AuthUser, reportId: string): Promise<ReportDef> {
    const def = REPORTS.find((r) => r.id === reportId);
    if (!def) throw new AppException('COMMON.NOT_FOUND');
    const ability = await this.ability.forUser(user);
    if (!ability.can(def.permission)) throw new AppException('AUTH.FORBIDDEN');
    return def;
  }

  async meta(user: AuthUser, reportId: string) {
    const def = await this.getAuthorized(user, reportId);
    const ability = await this.ability.forUser(user);
    const groups = ability.grantedFieldGroups();
    return {
      id: def.id,
      name: def.name,
      params: def.params,
      // §4.4c nơi 3: cột field-group user không có → KHÔNG trả cả định nghĩa
      columns: def.columns.filter((c) => !c.fieldGroup || groups.has(c.fieldGroup)),
    };
  }

  async run(
    user: AuthUser,
    reportId: string,
    params: Record<string, unknown>,
  ): Promise<ReportRunResult> {
    const def = await this.getAuthorized(user, reportId);
    const ability = await this.ability.forUser(user);
    const groups = ability.grantedFieldGroups();
    const visibleColumns = def.columns.filter(
      (c) => !c.fieldGroup || groups.has(c.fieldGroup),
    );

    const scope = ability.scopeOf(def.permission)!;
    // Cache key gồm CẢ scope + user (own khác nhau theo người) — không rò qua cache
    const cacheKey = this.redis.tenantKey(
      'report',
      user.tenantId,
      reportId,
      scope,
      scope === 'all' ? 'shared' : user.sub,
      createHash('sha256').update(JSON.stringify(params)).digest('hex').slice(0, 16),
    );
    if (def.cacheTtlSeconds) {
      try {
        const hit = await this.redis.client.get(cacheKey);
        if (hit) {
          const parsed = JSON.parse(hit) as Omit<ReportRunResult, 'cached'>;
          return { ...parsed, cached: true };
        }
      } catch {
        /* cache best-effort */
      }
    }

    const orgUnitIds =
      scope === 'department'
        ? user.orgUnitId
          ? [user.orgUnitId]
          : []
        : scope === 'descendants'
          ? user.orgUnitId
            ? await this.orgTree.getDescendantIds(user.tenantId, user.orgUnitId)
            : []
          : null;

    const rawRows = await def.query({
      tenantId: user.tenantId,
      userId: user.sub,
      scope,
      orgUnitIds,
      params,
      db: this.kysely.db,
    });

    // Lọc cột theo quyền TRƯỚC khi trả (kể cả khi query trả thừa)
    const keys = new Set(visibleColumns.map((c) => c.key).concat(['customerId']));
    const rows = rawRows.map((r) =>
      Object.fromEntries(Object.entries(r).filter(([k]) => keys.has(k))),
    );

    // Dòng tổng cộng (§5.5)
    const summary: Record<string, string> = {};
    for (const col of visibleColumns) {
      if (!col.summary) continue;
      if (col.summary === 'count') {
        summary[col.key] = String(rows.length);
      } else {
        const total = rawRows.reduce((s, r) => s + Number(r[col.key] ?? 0), 0);
        summary[col.key] =
          col.summary === 'avg' && rows.length > 0
            ? (total / rows.length).toFixed(2)
            : total.toFixed(2);
      }
    }

    const drilldowns = rawRows.map((r) => (def.drilldown ? def.drilldown(r) : null));
    const result = {
      columns: visibleColumns.map(({ key, label, type }) => ({ key, label, type })),
      rows,
      summary,
      drilldowns,
    };
    if (def.cacheTtlSeconds) {
      try {
        await this.redis.client.set(
          cacheKey,
          JSON.stringify(result),
          'EX',
          def.cacheTtlSeconds,
        );
      } catch {
        /* best-effort */
      }
    }
    return { ...result, cached: false };
  }

  /** Export CSV — dùng CHUNG kết quả run → field-level tự khớp (§4.4c nơi 2+3) */
  async exportCsv(
    user: AuthUser,
    reportId: string,
    params: Record<string, unknown>,
  ): Promise<string> {
    const result = await this.run(user, reportId, params);
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = result.columns.map((c) => esc(c.label)).join(',');
    const lines = result.rows.map((r) =>
      result.columns.map((c) => esc(r[c.key])).join(','),
    );
    const summaryLine = result.columns
      .map((c) => esc(result.summary[c.key] ?? ''))
      .join(',');
    return [header, ...lines, summaryLine].join('\n');
  }
}
