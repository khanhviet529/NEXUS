import { sql } from 'kysely';
import { resolveLocaleExpr } from '../../common/query/localized';
import { dateRange, type ReportDef } from './report.types';

/**
 * [REF] Báo cáo mẫu — khuôn cho mọi báo cáo sau (A1).
 * ⚠️ cookbook §7: PHẢI áp scope (ctx) — báo cáo là đường rò rỉ hay bị quên nhất.
 */
export const salesByCustomer: ReportDef = {
  id: 'sales-by-customer',
  name: 'Doanh thu theo khách hàng',
  permission: 'report:sales',
  params: [dateRange('period')],
  columns: [
    { key: 'customerCode', label: 'Mã KH' },
    { key: 'customerName', label: 'Khách hàng' },
    { key: 'orderCount', label: 'Số đơn', type: 'number', summary: 'sum' },
    { key: 'revenue', label: 'Doanh thu', type: 'money', summary: 'sum' },
    // §4.4c nơi 3: margin CHỈ hiện khi có field:cost
    { key: 'margin', label: 'Lãi gộp', type: 'money', summary: 'sum', fieldGroup: 'cost' },
  ],
  cacheTtlSeconds: 300,
  drilldown: (row) => `/orders?filter[customerId][eq]=${String(row['customerId'])}`,
  query: async (ctx) => {
    const period = ctx.params['period'] as { from: string; to: string };
    let q = ctx.db
      .selectFrom('orders')
      .innerJoin('customers', (join) =>
        join
          .onRef('customers.id', '=', 'orders.customer_id')
          .on('customers.tenant_id', '=', ctx.tenantId),
      )
      .select([
        'orders.customer_id as customerId',
        'customers.code as customerCode',
        resolveLocaleExpr('customers.name', ctx.locale).as('customerName'),
        sql<string>`count(*)::text`.as('orderCount'),
        sql<string>`COALESCE(sum(orders.total), 0)::text`.as('revenue'),
        sql<string>`COALESCE(sum(orders.margin), 0)::text`.as('margin'),
      ])
      // Tenant filter TỰ TAY — Kysely không qua extension (§4.4b)
      .where('orders.tenant_id', '=', ctx.tenantId)
      .where('orders.deleted_at', 'is', null)
      .where('orders.status', '=', 'APPROVED')
      .where('orders.approved_at', '>=', new Date(period.from))
      .where('orders.approved_at', '<=', new Date(period.to))
      .groupBy(['orders.customer_id', 'customers.code', 'customers.name']);

    // Row-level scope NHÚNG VÀO QUERY (§4.4) — không lọc sau
    if (ctx.scope === 'own') {
      q = q.where('orders.created_by_id', '=', ctx.userId);
    } else if (ctx.scope === 'department' || ctx.scope === 'descendants') {
      q = q.where('orders.org_unit_id', 'in', ctx.orgUnitIds ?? ['__none__']);
    }
    // Order theo biểu thức SỐ — alias 'revenue' đã ::text (tiền là chuỗi §3.7),
    // orderBy alias sẽ sort CHỮ ('5' > '30') → sai thứ tự
    return q.orderBy(sql`COALESCE(sum(orders.total), 0)`, 'desc').execute();
  },
};

/** Registry — thêm báo cáo = thêm MỘT phần tử (menu Báo cáo tự đăng ký) */
export const REPORTS: readonly ReportDef[] = [salesByCustomer];
