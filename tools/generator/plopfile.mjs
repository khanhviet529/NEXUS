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
        const P = plop.getHelper('pascalCase')(n);
        // V10 vá 3 bước thiếu (progress.md "CHECKLIST generator thiếu 3 bước"):
        // (1a) cột *_search · (3b) build shared · (2b) gán quyền vào seed-roles
        return [
          '',
          '✅ Đã sinh module. CHECKLIST BẮT BUỘC còn lại (cookbook §2):',
          `  1. schema.prisma: thêm model ${P} (copy khuôn Customer — §6.2/§6.4:`,
          '     TenantAuditedBase + @@unique([tenantId, id]) + composite FK nếu có bảng con).',
          '     ⚠️ Field JSONB đa ngôn ngữ PHẢI kèm cột nameViSearch/nameEnSearch (String?)',
          '     — repository sinh ra GHI các cột này; thiếu thì typecheck XANH mà runtime 500 (§3.10)',
          `  2. packages/shared/src/permissions.ts: ${n}:read|create|update|delete`,
          `     VÀ gán vào vai trò trong seed-roles.ts (SEED_ROLE_PERMISSIONS) — quyền có`,
          '     trong registry mà không vai trò nào giữ thì MỌI request 403',
          `  3. packages/shared/src/tenancy-policy.ts: thêm '${P}' vào TENANT`,
          '     (+ soft-delete-models.ts nếu có deletedAt).',
          '     RỒI: pnpm --filter @nexus/shared build — app đọc DIST, check đọc SOURCE:',
          '     quên build là app chết lúc khởi động trong khi check kiến trúc VẪN XANH',
          '  4. docs/permission-matrix.md + boilerplate-spec.md §6.5: thêm dòng',
          `  5. apps/api/src/app.module.ts: import ${P}sModule`,
          '  6. Migration SQL tay theo khuôn migrations/ gần nhất',
          '  7. pnpm gen:api → sinh lại api-client + thêm export vào src/index.ts',
          '  8. node tools/checks/run-all.mjs && pnpm test — check kiến trúc sẽ ĐỎ nếu thiếu bước 3/4',
          '',
        ].join('\n');
      },
    ],
  });

  /**
   * V10 — biến thể FE-ONLY: cho module BE ĐÃ TỒN TẠI (products, roles…)
   * cần thêm màn hình. Generator `module` đầy đủ sẽ chết ở file BE trùng.
   * Tách generator riêng (không thêm prompt vào `module`) vì test #37 gọi
   * positional MỘT tham số — prompt mới sẽ làm CI treo chờ stdin.
   */
  plop.setGenerator('module-fe', {
    description: 'CHỈ phần FE (schema/actions/page) cho module BE có sẵn',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Tên module (số ít, kebab-case, BE phải có sẵn):',
        validate: (v) =>
          /^[a-z][a-z0-9-]*$/.test(v) || 'kebab-case, bắt đầu bằng chữ thường',
      },
    ],
    actions: [
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
      (answers) => {
        const n = plop.getHelper('dashCase')(answers.name);
        return [
          '',
          '✅ Đã sinh FE. CHECKLIST còn lại:',
          `  1. Thay apiAxios trong page bằng hook sinh tự động (${plop.getHelper('camelCase')(n)}sControllerList)`,
          '     — ghi chú [GEN] trong file chỉ đúng chỗ',
          '  2. Bổ sung cột theo DTO thật + spec cho page (check #6 đỏ nếu thiếu test)',
          '  3. Nối vào sidebar/menu nếu màn là điểm đến chính (check #11 canh component mồ côi)',
          '',
        ].join('\n');
      },
    ],
  });
}
