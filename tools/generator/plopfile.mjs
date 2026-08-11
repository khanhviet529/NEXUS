/**
 * [CORE] GĐ9 — module generator (§10 GĐ9, cookbook §2):
 *   pnpm gen:module <tên-số-ít>     (vd: pnpm gen:module invoice)
 *
 * Sinh BE (module/controller/repository) + FE (schema/actions/page) THEO
 * KHUÔN modules/orders — kèm tenant (repository qua PrismaService extension),
 * locale (name JSONB + *_search), delete guard (@References), audit
 * (AuditRepository trong mọi đường ghi), @RequirePermission mọi endpoint.
 *
 * Generator KHÔNG tự sửa registry dùng chung (schema.prisma, permissions.ts,
 * TENANCY_POLICY, ma trận §6.5) — in checklist để dev làm tay có kiểm soát,
 * và các check kiến trúc (tools/checks) sẽ ĐỎ nếu quên.
 */
export default function (plop) {
  plop.setGenerator('module', {
    description: 'Module CRUD đủ BE+FE theo khuôn [REF] orders',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Tên module (số ít, kebab-case, vd: invoice):',
        validate: (v) =>
          /^[a-z][a-z0-9-]*$/.test(v) || 'kebab-case, bắt đầu bằng chữ thường',
      },
    ],
    actions: [
      // ---- BE ----
      {
        type: 'add',
        path: '../../apps/api/src/modules/{{dashCase name}}s/{{dashCase name}}s.module.ts',
        templateFile: 'templates/be-module.hbs',
      },
      {
        type: 'add',
        path: '../../apps/api/src/modules/{{dashCase name}}s/{{dashCase name}}s.controller.ts',
        templateFile: 'templates/be-controller.hbs',
      },
      {
        type: 'add',
        path: '../../apps/api/src/modules/{{dashCase name}}s/{{dashCase name}}s.repository.ts',
        templateFile: 'templates/be-repository.hbs',
      },
      // ---- FE ----
      {
        type: 'add',
        path: '../../apps/web/src/features/{{dashCase name}}s/schema.ts',
        templateFile: 'templates/fe-schema.hbs',
      },
      {
        type: 'add',
        path: '../../apps/web/src/features/{{dashCase name}}s/actions.ts',
        templateFile: 'templates/fe-actions.hbs',
      },
      {
        type: 'add',
        path: '../../apps/web/src/app/(dashboard)/{{dashCase name}}s/page.tsx',
        templateFile: 'templates/fe-page.hbs',
      },
      // ---- Test skeleton ----
      {
        type: 'add',
        path: '../../apps/api/test/{{dashCase name}}s.spec.ts',
        templateFile: 'templates/be-test.hbs',
      },
      (answers) => {
        const n = plop.getHelper('dashCase')(answers.name);
        return [
          '',
          '✅ Đã sinh module. CHECKLIST BẮT BUỘC còn lại (cookbook §2):',
          `  1. schema.prisma: thêm model ${plop.getHelper('pascalCase')(n)} (copy khuôn Customer — §6.2/§6.4:`,
          '     TenantAuditedBase + @@unique([tenantId, id]) + composite FK nếu có bảng con)',
          `  2. packages/shared/src/permissions.ts: ${n}:read|create|update|delete`,
          `  3. packages/shared/src/tenancy-policy.ts: thêm '${plop.getHelper('pascalCase')(n)}' vào TENANT`,
          '     (+ soft-delete-models.ts nếu có deletedAt)',
          '  4. docs/permission-matrix.md + boilerplate-spec.md §6.5: thêm dòng',
          `  5. apps/api/src/app.module.ts: import ${plop.getHelper('pascalCase')(n)}sModule`,
          '  6. Migration SQL tay theo khuôn migrations/ gần nhất',
          '  7. pnpm gen:api → sinh lại api-client + thêm export vào src/index.ts',
          `  8. Nhãn cắt gọt: module sinh ra mang [OPT]; đổi thành [CORE] ở`,
          `     modules/${n}s/${n}s.module.ts nếu dự án không cắt được nó, rồi`,
          '     node tools/checks/check-cut-table.mjs --fix   (in lại bảng §11)',
          '  9. node tools/checks/run-all.mjs && pnpm test — check kiến trúc sẽ ĐỎ nếu thiếu bước 3/4/8',
          '',
        ].join('\n');
      },
    ],
  });
}
