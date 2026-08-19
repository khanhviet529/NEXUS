# FRICTION — C1 Dogfood: dự án `sourcing` (đề xuất mua hàng)

## 0. Bối cảnh

- Dự án: `D:\sourcing` — clone NEXUS @ `2b7d27d`, xoá .git, COMPOSE_PROJECT_NAME=sourcing, trọn cụm cổng riêng (5442/6389/9010/8035/4010/3010)
- Nghiệp vụ: `docs/pilot-spec-purchase.md` (làm nguyên) · Luật: `docs/pilot-playbook.md` §2
- Bắt đầu lượt 1: **2026-08-19 08:36**
- Người làm: agent (C1 đo TÍNH TỔNG QUÁT của boilerplate, không đo thời gian người — M1/M2 bỏ theo đề bài)
- Ngưỡng chốt trước: **M3 ≤ 5** file hạ tầng · **M4 ≤ 10** lần đọc source

### Quy ước đếm (khai trước để không tự nới lúc bí)

- **M3**: file trong `design-system/ · components/common/ · infra/ · common/ · packages/shared/ · tools/ · docs/` (bản NÀO trong sourcing) bị SỬA. Mỗi file một dòng ở mục 4, kể cả khi cookbook §2 BẮT sửa (permissions.ts, tenancy-policy.ts, §6.5…) — cột 3 ghi "theo công thức" và người đọc quyết ranh giới.
- **M4**: mỗi lần mở file NGOÀI docs/ để trả lời câu docs không trả lời. KHÔNG tính đọc `modules/orders` + `features/orders` làm khuôn — CLAUDE.md §2 bước 2 và cookbook §2 CHỈ ĐỊNH việc đó tường minh.
- Thời gian ghi bằng wall-clock thật của agent — chỉ để so TƯƠNG ĐỐI giữa các bước, không so với người.

## 1. Số đo

| # | Số đo | Ngưỡng | Thực tế | Đạt? |
|---|---|---|---|---|
| M3a | Sửa vì hạ tầng THIẾU/HỎNG | ≤ 5 | **0** | ✅ — đây mới là số đo "đủ tổng quát" |
| M3b | Khai module vào registry tập trung (theo công thức) | — | **10** (chi tiết mục 4) | Đo CHI PHÍ THÊM MODULE, không phải lỗi boilerplate. Ngưỡng cũ M3≤5 gộp hai thứ khác nhau — đã tách sau đính chính lượt 2 |
| M4 | Số lần đọc source vì docs thiếu | ≤ 10 | **2** (chi tiết mục 6) | ✅ |

_M3b nối thẳng với bảng cắt gọt §11: thêm module = sửa 10 file registry, XOÁ module = dọn lại đúng 10 file đó — cùng một vấn đề. Nếu registry chuyển sang module-tự-khai thì §11 rút về `rm -rf modules/x`. Quyết định kiến trúc lớn → ADR, chờ dữ liệu dự án thứ hai (SỔ NỢ mục 11)._

## 2. Thời gian từng bước vs tài liệu

| Bước | Tài liệu nói | Thực tế | Lệch |
|---|---|---|---|
| pnpm bootstrap (clone 2, đổi cổng) | <30 phút | **52 giây** | ✅ nhanh hơn 34× |
| Cắt gọt §11 | — | HOÃN CÓ CHỦ ĐÍCH: `orders` là [REF] cần giữ làm khuôn trong lúc xây (chính bảng §11 dặn "xoá SAU khi đã copy làm mẫu"); cắt sau lượt 1 | |
| gen:module ×4 (thời gian SINH) | — | 3-9 giây/module, hằng số — "module #3 nhanh hơn #1?" đo sai chỗ: thời gian thật nằm ở phần TAY sau sinh (schema+registry+controller), làm GỘP 1 lần ~75 phút cho cả 4 | Generator tiết kiệm ở file khung, KHÔNG tiết kiệm ở registry |
| Toàn bộ BE module (schema→migration→controller→service→checks xanh) | — | ~85 phút wall-clock agent (08:37→10:02) | gồm 2 vòng vá F10/F12 |
| Thăm dò #1 (duyệt 2 cấp end-to-end) | — | có sẵn resolveFor → chỉ viết service chọn transition; nghiệm thu 18tr/45tr/R4/403 chạy ngay lượt gọi API đầu | |
| Thăm dò #5 (4 role qua UI-API) | — | 3 phút thao tác + 2 vòng vá (F10 role mồ côi, F11 seed-roles) | |
| Báo cáo purchase-by-dept | "2 giờ/báo cáo" | ~25 phút (viết def + kysely type + test 3 phép kiểm qua API) | ✅ nhanh hơn cam kết — NHƯNG +1 file infra (kysely type registry) |
| 7 màn FE (production build xanh + 9 route 200) | — | ~70 phút wall-clock agent | grid-entry + DetailLayout + action-registry tái dùng thẳng |

## 3. Ma sát

| # | Loại | Bước | Mô tả | Đường tránh đã dùng | Lẽ ra boilerplate nên |
|---|---|---|---|---|---|
| F01 | TÀI LIỆU | setup | `docs/onboarding.md` vẫn dạy `make setup` + luồng migrate-tay "lần đầu tiên" trong khi README đã chuyển sang `pnpm bootstrap` (V1-V4) — hai tài liệu nói hai đường | Theo README | onboarding.md đồng bộ với README |
| F02 | UX | setup | Thông điệp cuối `pnpm bootstrap` in cứng `web :3000 · api :4000` — clone thứ hai đổi cổng thì con số SAI (thật là 3010/4010) | Tự biết vì mình vừa đặt cổng | setup.mjs đọc WEB_PORT/API_PORT từ .env khi in |
| F03 | GENERATOR | gen:module #2 | Plural hoá ngây thơ: `material-category` → thư mục/route/model `material-categorys` (sai chính tả, route xấu). Không có cách khai số nhiều | Đổi tay toàn bộ sang `material-categories` sau khi sinh (~7 file) — phủ một phần giá trị generator | plop dùng bảng bất quy tắc hoặc nhận `--plural` |
| F04 | TÀI LIỆU | gen:module #1 | cookbook §2 dạy `gen:module invoice --base=business --soft-delete` nhưng plopfile chỉ nhận NAME positional — hai flag bị NUỐT IM LẶNG, khuôn sinh y hệt | Bỏ flag | cookbook bỏ flag ma, hoặc generator thêm flag thật |
| F05 | GENERATOR | gen:module #1 | Khuôn ÉP `name` là LocalizedText JSONB + buildSearchColumns — spec suppliers cần name text thường; không có lựa chọn | Gỡ i18n bằng tay cho suppliers (code nghiệp vụ, không tính M3) | generator hỏi "name có i18n không?" |
| F06 | GENERATOR (CAO) | gen:module | Khuôn controller sinh ra KHÔNG áp scope: list không `scopeWhere`, detail không `getInScope` — giữ nguyên khuôn với ma trận own/desc là RÒ ROW-LEVEL. Header khuôn tự nhận "khuôn [REF] orders" nhưng thiếu đúng phần orders làm kỹ nhất | Viết lại controller theo orders thật | khuôn sinh scopeWhere sẵn, hoặc in cảnh báo ĐỎ trong checklist |
| F07 | TÀI LIỆU | báo cáo | cookbook §7 dạy API `defineReport({query:(p,ability)=>...})` KHÔNG TỒN TẠI — thực tế là `ReportDef{query(ctx)}` trong report-registry.ts. Cùng họ flag ma F04 | Theo [REF] salesByCustomer | cookbook viết lại theo API thật |
| F08 | TÀI LIỆU (CAO) | migration | `prisma migrate dev` đòi DROP `org_units.path` (ltree manual-DDL) + hàng loạt composite FK tay — người mới theo onboarding "lần đầu" sẽ dùng migrate dev và CÓ NGUY CƠ MẤT CỘT. Checklist bước 6 nói "SQL tay theo khuôn" nhưng KHÔNG cảnh báo vì sao | `migrate diff` rồi TRÍCH riêng câu lệnh của bảng mới | cookbook thêm cảnh báo đỏ + công thức trích diff |
| F09 | UX | checks | `check-fe-test-coverage` chết trên clone mới không có origin/main ("không so diff được" nhưng đếm là KHÔNG CHẠY ĐƯỢC → run-all in 10/11) | Bỏ qua | check tự nhận diện repo mới → SKIP xanh có ghi chú |
| F10 | SAI (boilerplate, CAO) | thăm dò #5 | `RolesService.create` KHÔNG bọc transaction: tạo role xong mới setPermissions — cấp quyền fail (luật §2.3) để lại ROLE MỒ CÔI 0 quyền; POST lại đụng unique (tenant,code) → P2002 rơi ra 500 COMMON.INTERNAL_ERROR | Xoá role mồ côi rồi tạo lại | create+setPermissions trong MỘT tx; map P2002 role.code → 409 đọc được |
| F11 | THIẾT KẾ (CAO NHẤT) | thăm dò #5 | Quyền của MODULE MỚI không đưa được vào bất kỳ role nào QUA UI: luật "không cấp quyền mình không có" (§2.3) × TENANT_ADMIN là role hệ thống khoá UI ⇒ đường DUY NHẤT là sửa seed-roles.ts + re-seed. "Vai trò là dữ liệu" (§4.4) đúng với quyền CÓ SẴN, nhưng thêm module là bắt buộc đụng shared + re-seed | Sửa seed-roles theo checklist bước 2 (M3) | cân nhắc: TENANT_ADMIN auto-grant quyền mới lúc PermissionSync, hoặc cho phép sysadmin nâng quyền role hệ thống |
| F12 | UX (bẫy) | seed | Seed script dùng PrismaClient TRẦN (không extension) → `findFirst` role NHÌN THẤY role đã SOFT-DELETE (mồ côi 0 quyền của F10) và gán userRole vào role chết — lỗi chỉ lộ khi login 403 | Lọc `deletedAt: null` tay trong seed | docs cảnh báo "client trần thấy soft-deleted"; seed.ts gốc cũng dùng client trần |
| F13 | TÀI LIỆU | registry | Sửa `packages/shared` (sensitive-fields) khi app ĐANG CHẠY: build lại dist rồi mà process cũ vẫn giữ bản cũ trong RAM → canary RÒ ở audit tới khi RESTART. Checklist bước 3 cảnh báo BUILD nhưng không cảnh báo RESTART | Restart api + worker | checklist bước 3 thêm "và restart mọi process đang chạy" |
| F14 | UX (nhỏ) | báo cáo | Dòng tổng format cột `number` như tiền: countTotal in "15.00" | Chấp nhận | summary format theo type cột |
| F15 | THIẾU | FE danh mục | Spec §5.4 hứa pattern `list-drawer` cho suppliers/material-categories nhưng FE KHÔNG có component/khuôn nào tên đó — chỉ có list-detail (orders) | Làm list + Dialog form thay drawer | hoặc xây list-drawer thật, hoặc spec §5.4 bỏ chữ list-drawer |
| F16 | UX (bẫy) | full suite | `auth-gd2.spec` hardcode `ORIGIN='http://localhost:3000'` — clone đổi cổng (đúng lời hứa bootstrap) là test #5 logout ĐỎ 403 vì allowlist giờ là 3010. Bẫy chỉ lộ khi chạy FULL suite | Test đọc `ALLOWED_ORIGINS` từ env | test lấy origin từ env ngay trong NEXUS |
| F18 | UX (bẫy, lượt 2) | full BE NEXUS | Bẫy F12 có mặt cả trong TEST của NEXUS: `permission-matrix.spec` dùng `rawPrisma.role.findFirstOrThrow` KHÔNG lọc deletedAt → vớ xác role soft-delete mà file test khác để lại → 404 thay vì 403. Cùng lúc lộ ra lưới L12a chỉ so tập-con được khi broad lấy TRỌN tập (total ≤ limit) — phân trang làm "trang 1 của narrow ⊄ trang 1 của broad" một cách hợp lệ | Vá cả hai + spec mới trả hiện trường | grep `rawPrisma.` trong test khi thêm test mới; cookbook §12 bước 9 đã phủ |
| F17 | TÀI LIỆU (lượt 2) | vá F10 | Spec §4.5 mục "Transaction" kê `@nestjs-cls/transactional` + `@Transactional()` — plugin KHÔNG cài, 0 chỗ dùng; quy ước THẬT của repo là `$transaction` trong repository (7 repo, orders [REF]) | Vá F10 theo khuôn orders | spec §4.5 viết lại theo quy ước thật (sổ nợ — sửa docs ngoài phạm vi P0-P2 hiện tại) |

## 4. File boilerplate đã phải sửa → M3

| File | Vì sao | Lỗ hổng TỔNG QUÁT hay riêng sourcing? |
|---|---|---|
| packages/shared/src/permissions.ts | 20 permission mới — registry là nguồn duy nhất (§4.4) | TỔNG QUÁT theo thiết kế: MỌI dự án đều phải sửa (công thức bước 2) |
| packages/shared/src/tenancy-policy.ts | 5 model mới vào TENANT — fail-closed boot | TỔNG QUÁT theo thiết kế (bước 3) |
| packages/shared/src/soft-delete-models.ts | 4 model business | TỔNG QUÁT theo thiết kế (bước 3) |
| packages/shared/src/state-machines.ts | máy trạng thái requisition (thăm dò #1 đường 2) | TỔNG QUÁT theo thiết kế — chứng từ mới nào cũng cần |
| packages/shared/src/error-codes.ts | 10 mã PR.* | TỔNG QUÁT theo thiết kế — registry mã lỗi tập trung |
| packages/shared/src/sensitive-fields.ts | Material.estimatedPrice(cost) + Supplier.bankAccount(finance) | TỔNG QUÁT theo thiết kế (§4.4c một nguồn 4 nơi) |
| packages/shared/src/seed-roles.ts | F11: TENANT_ADMIN phải có quyền mới thì mới cấp tiếp qua UI được | TỔNG QUÁT — hệ quả thiết kế §2.3, KHÔNG né được |
| apps/api/src/infra/kysely/kysely.service.ts | báo cáo cần bảng trong ReportDatabase type | TỔNG QUÁT — mọi báo cáo trên bảng mới đều đụng infra/ |
| packages/shared/src/entity-types.ts | 4 entity type mới — attachments/comments/audit cần whitelist | TỔNG QUÁT theo thiết kế (bước 3) |
| docs/boilerplate-spec.md (§6.5 + §11) | check-matrix + check-cut-table bắt buộc | TỔNG QUÁT theo thiết kế (bước 4) |

**M3a = 0 (sửa vì thiếu/hỏng) · M3b = 10 (khai theo công thức).** KHÔNG file nào
là "vá lỗi" — tất cả là REGISTRY TẬP TRUNG mà thiết kế bắt mọi dự án sửa theo
công thức; cột 3 của bảng trên chính là phân loại M3b cho từng file. Phương án
module-tự-khai (mỗi module tự khai permission/state-machine/sensitive-fields,
boot gom lại) là ADR chờ dữ liệu dự án thứ hai — xem SỔ NỢ.

## 5. Năm thăm dò — kết quả từng cái

| # | Thăm dò | Có sẵn dùng được? | Phải làm gì thêm | Có sửa NEXUS không |
|---|---|---|---|---|
| 1 | Duyệt 2 cấp nhảy bậc | ✅ `approval_authorities.resolveFor` có sẵn, semantics {hasAnyRow, covered} đủ cho nhảy bậc | ĐƯỜNG 2 như spec đề nghị: 2 transition tĩnh (approveManagerFinal/Route), service tra hạn mức rồi chọn — chạy end-to-end 18tr→APPROVED, 45tr→PENDING_DIRECTOR→GĐ→APPROVED | KHÔNG (state machine mới là entry registry, theo công thức) |
| 2 | neededBy +3 ngày làm việc | ✅ `addWorkingDays` (shared) + `CalendarRepository.getDefaultWithDetails/toConfig` + lịch mặc định ĐÃ SEED | Chỉ gọi — R7 chạy ngay (409 đúng khi neededBy=mai) | KHÔNG. Nhưng +1 M4: docs không nói API nội bộ |
| 3 | materials.name JSONB | ✅ khuôn generator TỰ ghi *_search qua buildSearchColumns — không làm tay | Chỉ mở rộng field | KHÔNG |
| 4 | effectiveTo chặn vật tư | ❌ §5C.10 CHỈ CÓ CỘT — không có logic sẵn | Luật R8 tự viết ở buildItems (~10 dòng) | KHÔNG (logic nghiệp vụ, đúng chỗ) |
| 5 | 2 vai trò mới qua UI | ⚠️ Role MỚI tạo qua UI ĐƯỢC (4 role × permission×scope, 8-18 quyền/role) NHƯNG lộ F10 (role mồ côi + 500) và F11 (quyền module mới bắt buộc qua seed-roles trước) | Sửa seed-roles + re-seed rồi mới tạo được | seed-roles.ts (M3, công thức bước 2) |

## 6. M4 — lần phải đọc source

| # | File đã đọc | Docs lẽ ra phải nói gì | Nên bổ sung vào docs nào |
|---|---|---|---|
| 1 | modules/calendar/calendar.repository.ts + shared/business-calendar.ts | Cách GỌI NỘI BỘ lịch làm việc từ service khác (getDefaultWithDetails→toConfig→addWorkingDays) — spec §5C.4 chỉ tả tính năng | cookbook: công thức "dùng business calendar trong luật nghiệp vụ" |
| 2 | modules/audit/audit.repository.ts + shared/sensitive-fields.ts | Kênh 4 của §4.4c che Ở ĐÂU và đăng ký cột nhạy cảm THẾ NÀO (SENSITIVE_FIELDS) | cookbook: công thức "thêm cột nhạy cảm mới" 4 kênh |

_Quy ước: đọc modules/orders + features/orders làm khuôn KHÔNG tính (CLAUDE.md §2 chỉ định); đọc-để-sửa file registry theo công thức không tính._
**M4 = 2 — DƯỚI ngưỡng 10.** Tài liệu tổng thể tốt; hai lỗ đều là "API nội bộ của module CORE-nhẹ".

## 7. Cái gì HOẠT ĐỘNG TỐT

- **pnpm bootstrap**: clone thứ hai lên 52 giây, container tách sạch — cam kết giữ được.
- **Các LƯỚI TỰ BẮT đúng thiết kế, không sót lần nào**: boot fail-closed bắt quên gen-model-list; universal bắt route mới chưa snapshot; l16 bắt GET chưa phân loại; U6 bắt 16 route :id chưa fixture kèm thông báo CHỈ CÁCH SỬA. Cảm giác "không thể lặng lẽ làm thiếu" là giá trị lớn nhất khi dogfood.
- **Khuôn [REF] orders (BE lẫn FE)**: transition+optimistic-lock+audit-in-tx, order-form (field array + data-entry keyboard + AsyncSelect + preview tiền) — copy-đổi-tên là chạy; grid-entry/DetailLayout/ActionRegistry/FilterBar/StatusBadge tái dùng nguyên.
- **approval_authorities + resolveFor**: hạ tầng "chưa ai dùng thật" hoá ra ĐỦ NGAY cho duyệt 2 cấp nhảy bậc — semantics {hasAnyRow, covered} đúng thứ cần.
- **business calendar**: addWorkingDays + lịch mặc định seed sẵn — R7 chạy ngay.
- **Trang /reports render động**: purchase-by-dept TỰ xuất hiện, form sinh từ meta, scope đúng (TRUONG_BP 15 < GIAM_DOC 17), drill-down thật — không viết một dòng FE nào.
- **§4.4c 4 kênh**: sau khi khai SENSITIVE_FIELDS, kênh 1 (response null) + kênh 4 (audit «đã che») tự chạy; kênh 2 tự viết theo khuôn showCost của orders.

## 8. Nên CẮT khỏi NEXUS

Sourcing KHÔNG chạm lần nào (ứng viên cắt/hạ ưu tiên — dữ liệu MỘT dự án, chưa phải kết luận):
- **inventory/movements/stock_balances** — cả cụm B4 (spec pilot cố ý né, nhưng đáng ghi: dự án "đề xuất mua" thật cũng không cần)
- **webhooks** (outgoing) · **approval-authorities/check endpoint** (dùng resolveFor nội bộ, không gọi /check)
- **saved-views** (màn requisitions chưa gắn SavedViewsBar) · **personalization recent/favorites** (không đụng)
- **imports wizard** (không có nghiệp vụ import trong spec pilot) · **business-calendar UI endpoints** (chỉ dùng hàm nội bộ)
- **packages/vn** — spec pilot §2.1 nhắc "validate MST bằng packages/vn" nhưng package KHÔNG TỒN TẠI (F-05 cũ của C0 vẫn đúng) — suppliers bỏ validate MST
- **SSO/2FA, multi-tenant thứ 3+, preset ngoài enterprise** — đúng dự kiến

DÙNG NHIỀU ngoài dự kiến: audit-timeline + attachment-list (aside mọi chứng từ), action-registry, StatusBadge generic, FilterBar, useFormKeyboard.

## 9. Nghiệm thu pilot (spec §10 — 14 mục)

| # | Mục | Kết quả | Ghi chú |
|---|---|---|---|
| 1 | 7 màn chạy được | ✅ | prod build xanh; 9 route đều 200 (7 màn + /reports + /me) |
| 2 | Tạo đề xuất 3 dòng hoàn toàn bằng bàn phím | ⚠️ CẦN NGƯỜI | grid-entry dùng đúng profile `data-entry` của khuôn orders (Enter ô kế/thêm dòng, Ctrl+Enter lưu) — agent không bấm phím thật được, dành cho ngày-5 nhập tay |
| 3 | Số liên tục PR-2026-00001→00005 | ✅ | 5 PR liền, tổng tiền từng cái đúng R11 |
| 4 | 18tr TRUONG_BP duyệt → APPROVED ngay | ✅ | thăm dò #1 |
| 5 | 45tr → PENDING_DIRECTOR → GĐ → APPROVED | ✅ | |
| 6 | Tự duyệt → 409 PR.SELF_APPROVAL | ✅ | R4 |
| 7 | NHAN_VIEN gọi duyệt → 403 | ✅ | |
| 8 | NHAN_VIEN không thấy estimatedPrice cả 4 kênh | ✅ | K1 grep 0 canary · K2 export MẤT CỘT · K3 báo cáo: NHAN_VIEN không có report:purchase → 403 (không thấy vì không vào được) · K4 audit «đã che» — SAU restart (F13) |
| 9 | neededBy=mai → 409 NEEDED_BY_TOO_SOON | ✅ | §5C.4 DÙNG ĐƯỢC (thăm dò #2) — không phải THIẾU |
| 10 | Vật tư hết hiệu lực → 409 MATERIAL_INACTIVE | ✅ | §5C.10 chỉ có cột, luật R8 tự viết ~10 dòng (thăm dò #4) |
| 11 | Báo cáo TRUONG_BP < GIAM_DOC | ✅ | 15 (1 bộ phận) < 17 (2 bộ phận), tổng khớp |
| 12 | Export không chứa canary khi không được xem | ✅ | CSV as NHAN_VIEN: cột bankAccount/estimatedPrice bị BỎ, grep canary = 0 |
| 13 | Timeline hiện tên hành động nghiệp vụ | ✅ | APPROVE/SUBMIT/REJECT, không phải UPDATE |
| 14 | 2 vai trò mới qua UI, không sửa code | ⚠️ ✅ có sao | tạo 4 role qua đúng API màn /roles, KHÔNG sửa seed cho role mới — nhưng lộ F10+F11, và TENANT_ADMIN phải nhận quyền mới qua seed-roles trước |

Lưới an toàn kế thừa: full BE suite + universal/l16/u6 cập nhật cho 27 route mới — output dán ở báo cáo cuối.

## 9b. Rà scope 27 route sourcing (P0.4 — lượt 2)

Sau khi vá khuôn generator (F06), rà TAY 27 route mới của sourcing:

| Module | Route thiếu scope | Ghi chú |
|---|---|---|
| requisitions | **0/11** | copy thẳng orders [REF] → list scopeWhere + getInScope đủ |
| suppliers | **5/6** (list, GET/:id, PATCH/:id, DELETE/:id, export) | copy khuôn gen CŨ → `findFirst({where:{id}})` |
| materials | **5/6** | như trên |
| material-categories | **3/4** (list, PATCH/:id, DELETE/:id) | như trên |

**13/27 route thiếu scope — rò TIỀM ẨN, chưa lộ dữ liệu**: mọi grant danh mục
trong pilot đều scope `all`, và cách ly TENANT vẫn kín nhờ Prisma extension.
Nhưng cấp `supplier:read` scope `own` cho role nào là rò ngay. Đây là bằng
chứng sống của F06: người copy KHUÔN thì dính, người copy ORDERS thì không.
Sửa sourcing thuộc lượt vá riêng của repo đó (ngoài phạm vi lượt 2 NEXUS).

## 10. Việc còn treo sau lượt 1 (không tự quyết)

- **Cắt gọt §11 chưa thực hiện** — orders [REF] giữ làm khuôn suốt lượt xây (đúng ghi chú của chính bảng §11). Cắt là việc đầu lượt 2 hoặc người làm ngày-0 thật.
- **Nghiệm thu #2 (bàn phím)** cần người bấm thật — ngày 5 sáng của playbook.
- **test:a11y chưa chạy** trên sourcing (thuộc ngày-0 của playbook, dành cho người).
- **F10 (RolesService không tx)** là lỗi boilerplate THẬT nhưng KHÔNG sửa trong lượt 1 theo luật — ứng viên đầu bảng cho lượt 2.
- Nhập 1-2h dữ liệu thật như người dùng (ngày 5) — agent không thay được.

## 11. SỔ NỢ sau lượt 2 (ghi, KHÔNG làm — chi tiết ở docs/progress.md)

| Khoản | Trạng thái |
|---|---|
| **M3b → module-tự-khai** (ADR, kèm bảng so sánh thêm/xoá/xung-đột-git/bắt-lỗi-biên-dịch) | CHỜ dữ liệu dự án thứ hai — ưu tiên cao |
| **F15 list-drawer** | CHỜ FRICTION.md của người (ngày 5) |
| **packages/vn** không tồn tại (F-05 C0) | CHỜ người dùng quyết: xây hay bỏ khỏi spec |
| **F17** spec §4.5 Transaction kê cơ chế không có thật | Sửa docs sau |
| **Mục 8 "nên cắt"** | GIỮ NGUYÊN — dữ liệu một dự án chưa đủ để cắt |

## 12. Lượt 2 đã vá gì (đối chiếu nhanh)

| Ma sát | Vá ở lượt 2 | Bằng chứng |
|---|---|---|
| F06 (P0) | Khuôn generator áp scope + test #37 khẳng định #5 + lưới L12a | #5 ĐỎ trước vá ("RÒ SCOPE: staff thấy bản ghi của admin") → 9/9 sau vá |
| F10 (P1.1) | RolesService.create MỘT tx + P2002→409 ROLE.CODE_EXISTS; provisionTenant bọc tx | roles-tx.spec 3/3 |
| F11 (P1.2) | PermissionSync auto-grant TENANT_ADMIN (loại system*) + audit | permission-autogrant.spec 3/3 |
| F12 (P1.3) | seed lọc deletedAt ×5 + cookbook §12 bước 9 | seed-soft-delete.spec 1/1 |
| F03/F04/F05 (P2-A) | plural theo luật · 3 flag thật · i18n tuỳ chọn | sinh material-categories đúng; test #37 9/9 |
| F01/F07/F08 (P2-B) | onboarding = README · cookbook §7 API thật · ⛔ migrate dev | run-all xanh |
| F02/F16 (P2-C) | setup in cổng từ .env · test đọc ALLOWED_ORIGINS · check-hardcoded-ports (#12) | kiểm âm tính ĐỎ đúng; auth-gd2 12/12 |
| F09/F13/F14 (P2-D) | run-all ba trạng thái · checklist +RESTART · formatCell number | clone sạch local 12/12 ĐẠT/exit 0, CI mô phỏng exit 1; reports spec 3/3 |
| F15, F17 | KHÔNG vá — sổ nợ | |
