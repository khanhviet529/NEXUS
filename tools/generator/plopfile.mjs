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
/**
 * F03 (C1): số nhiều theo LUẬT, không phải +s ngây thơ.
 * category→categories, box→boxes… Tên bất quy tắc hơn nữa (person/people)
 * thì đặt tên module khác hoặc đổi tay sau khi sinh — khai rõ, không đoán.
 */
const pluralize = (w) => {
  if (/[^aeiouAEIOU]y$/.test(w)) return w.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/.test(w)) return w + 'es';
  return w + 's';
};

export default function (plop) {
  plop.setHelper('plural', pluralize);

  plop.setGenerator('module', {
    description: 'Module CRUD đủ BE+FE theo khuôn [REF] orders',
    // F04 (C1): flag là BYPASS chuẩn của plop — caller tự động (test #37, CI)
    // PHẢI truyền đủ: plop module <tên> --base tenant --softDelete true --i18n false
    // Người chạy tay không truyền thì được HỎI (mặc định an toàn).
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Tên module (số ít, kebab-case, vd: invoice):',
        validate: (v) =>
          /^[a-z][a-z0-9-]*$/.test(v) || 'kebab-case, bắt đầu bằng chữ thường',
      },
      {
        type: 'list',
        name: 'base',
        message: 'Base entity (§6.2)?',
        choices: ['tenant', 'business'],
        default: 'tenant',
      },
      {
        type: 'confirm',
        name: 'softDelete',
        message: 'Có soft-delete (deletedAt)?',
        default: true,
      },
      {
        // F05 (C1): phần lớn danh mục KHÔNG cần i18n — mặc định không
        type: 'confirm',
        name: 'i18n',
        message: 'Trường name có đa ngôn ngữ (JSONB vi/en + cột *_search)?',
        default: false,
      },
    ],
    actions: [
      // ---- BE ----
      {
        type: 'add',
        path: '../../apps/api/src/modules/{{plural (dashCase name)}}/{{plural (dashCase name)}}.module.ts',
        templateFile: 'templates/be-module.hbs',
      },
      {
        type: 'add',
        path: '../../apps/api/src/modules/{{plural (dashCase name)}}/{{plural (dashCase name)}}.controller.ts',
        templateFile: 'templates/be-controller.hbs',
      },
      {
        type: 'add',
        path: '../../apps/api/src/modules/{{plural (dashCase name)}}/{{plural (dashCase name)}}.repository.ts',
        templateFile: 'templates/be-repository.hbs',
      },
      // ---- FE ----
      {
        type: 'add',
        path: '../../apps/web/src/features/{{plural (dashCase name)}}/schema.ts',
        templateFile: 'templates/fe-schema.hbs',
      },
      {
        type: 'add',
        path: '../../apps/web/src/features/{{plural (dashCase name)}}/actions.ts',
        templateFile: 'templates/fe-actions.hbs',
      },
      {
        type: 'add',
        path: '../../apps/web/src/app/(dashboard)/{{plural (dashCase name)}}/page.tsx',
        templateFile: 'templates/fe-page.hbs',
      },
      // ---- Test skeleton ----
      {
        type: 'add',
        path: '../../apps/api/test/{{plural (dashCase name)}}.spec.ts',
        templateFile: 'templates/be-test.hbs',
      },
      (answers) => {
        const n = plop.getHelper('dashCase')(answers.name);
        const P = plop.getHelper('pascalCase')(n);
        const Pl = pluralize(P);
        // V10 vá 3 bước thiếu (progress.md "CHECKLIST generator thiếu 3 bước"):
        // (1a) cột *_search · (3b) build shared · (2b) gán quyền vào seed-roles
        return [
          '',
          '✅ Đã sinh module. CHECKLIST BẮT BUỘC còn lại (cookbook §2):',
          answers.base === 'business'
            ? `  1. schema.prisma: thêm model ${P} (copy khuôn Order — BusinessEntityBase:`
            : `  1. schema.prisma: thêm model ${P} (copy khuôn Customer — TenantAuditedBase:`,
          answers.base === 'business'
            ? '     có orgUnitId — BẮT BUỘC cho scope department/descendants (§4.4)'
            : '     KHÔNG có orgUnitId — grant scope department/descendants sẽ lỗi runtime',
          '     §6.2/§6.4: @@unique([tenantId, id]) + composite FK nếu có bảng con.',
          ...(answers.i18n
            ? [
                '     ⚠️ Field JSONB đa ngôn ngữ PHẢI kèm cột nameViSearch/nameEnSearch (String?)',
                '     — repository sinh ra GHI các cột này; thiếu thì typecheck XANH mà runtime 500 (§3.10)',
              ]
            : ['     name là String thường (đã chọn không i18n) — KHÔNG cần cột *_search']),
          `  2. packages/shared/src/permissions.ts: ${n}:read|create|update|delete`,
          `     VÀ gán vào vai trò trong seed-roles.ts (SEED_ROLE_PERMISSIONS) — quyền có`,
          '     trong registry mà không vai trò nào giữ thì MỌI request 403',
          `  3. packages/shared/src/tenancy-policy.ts: thêm '${P}' vào TENANT`,
          answers.softDelete
            ? '     + soft-delete-models.ts (đã chọn có deletedAt).'
            : '     (đã chọn KHÔNG soft-delete — đừng thêm vào soft-delete-models).',
          '     RỒI: pnpm --filter @nexus/shared build — app đọc DIST, check đọc SOURCE:',
          '     quên build là app chết lúc khởi động trong khi check kiến trúc VẪN XANH.',
          '     VÀ RESTART mọi process đang chạy (api, worker) — process cũ giữ dist CŨ',
          '     trong RAM: sensitive-fields sửa rồi mà audit vẫn rò tới khi restart (F13/C1)',
          '  4. docs/permission-matrix.md + boilerplate-spec.md §6.5: thêm dòng.',
          `     VÀ bảng cắt gọt §11: thêm dòng \`${P}\` — check-cut-table (V5) bắt`,
          '     mọi thư mục modules/ phải có mặt trong bảng. Cột "Màn hình" (R2)',
          '     phải là `API-only ...` hoặc đường dẫn `apps/web/...` CÓ THẬT',
          `  5. apps/api/src/app.module.ts: import ${Pl}Module`,
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
        path: '../../apps/web/src/features/{{plural (dashCase name)}}/schema.ts',
        templateFile: 'templates/fe-schema.hbs',
      },
      {
        type: 'add',
        path: '../../apps/web/src/features/{{plural (dashCase name)}}/actions.ts',
        templateFile: 'templates/fe-actions.hbs',
      },
      {
        type: 'add',
        path: '../../apps/web/src/app/(dashboard)/{{plural (dashCase name)}}/page.tsx',
        templateFile: 'templates/fe-page.hbs',
      },
      (answers) => {
        const n = plop.getHelper('dashCase')(answers.name);
        return [
          '',
          '✅ Đã sinh FE. CHECKLIST còn lại:',
          `  1. Thay apiAxios trong page bằng hook sinh tự động (${pluralize(plop.getHelper('camelCase')(n))}ControllerList)`,
          '     — ghi chú [GEN] trong file chỉ đúng chỗ',
          '  2. Bổ sung cột theo DTO thật + spec cho page (check #6 đỏ nếu thiếu test)',
          '  3. Nối vào sidebar/menu nếu màn là điểm đến chính (check #11 canh component mồ côi)',
          '',
        ].join('\n');
      },
    ],
  });
}
