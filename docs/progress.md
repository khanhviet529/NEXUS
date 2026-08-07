# Tiến độ theo giai đoạn

> Bốn trạng thái: `⬜ chưa` · `🔄 đang làm` · `🔍 chờ review` · `✅ xong`
> "Xong" = test §8.2 tương ứng XANH TRÊN CI (working-agreement §2), không phải "đã push".

## Tuần 2026-W32

| GĐ | Hạng mục | Người | Trạng thái | Test §8.2 | Ghi chú |
|----|----------|-------|-----------|-----------|------|
| 1 | Monorepo, ENV zod, docker-compose, CI | Claude | 🔍 chờ review | — | Docker Desktop 4.85 đã cài, 4 container healthy |
| 1 | packages/shared: 7 registry + TENANCY_POLICY | Claude | 🔍 chờ review | — | |
| 1 | Prisma schema + 3 tầng base + composite FK | Claude | 🔍 chờ review | — | Migration `init` đã apply (25 bảng, kèm manual DDL) + seed |
| 1 | CLS context + tenancy/soft-delete extension | Claude | 🔍 chờ review | **#1,#2,#3a-d ✅ 22/22** | Chạy trên Testcontainers Postgres thật, 2026-08-07 |
| 1 | SerializeInterceptor (field-level) | Claude | 🔍 chờ review | #10 ⬜ (GĐ3) | Cơ chế xong; cột nhạy cảm thật vào GĐ3 |
| 1 | Codegen orval + GET /me từ FE | Claude | 🔍 chờ review | — | Smoke test thật: login cookie → /me trả đúng tenant A |
| 1 | 7 check kiến trúc (4 script + 2 ESLint + 1 test) | Claude | ✅ xong | #3c ✅ | check #6 (đếm query) bắt đầu GĐ4 |
| 2 | Auth đầy đủ: refresh rotation + family, CSRF double-submit, Redis session runtime, rate limit + khoá TK, forgot password, invitation, switch-tenant, /me/sessions | Claude | 🔍 chờ review | **#4-#7 ✅ 34/34** | Worker BullMQ mail; select-tenant = login kèm tenantId |
| 3 | Users/Roles/OrgUnits CRUD + vòng đời tài khoản + Ability (own/dept/desc/all bằng ltree) + field-level | Claude | 🔍 chờ review | **#8-#11 ✅** | #10 phủ API + audit diff; export/report bổ sung ở GĐ6/6b |
| 3b | Quản trị tenant (§5C.1) + DB trigger audit 7 bảng security-critical + provision tenant kèm seed | Claude | 🔍 chờ review | ✅ (79/79 toàn suite) | Suspend huỷ phiên NGAY; trigger che password_hash/salary |
| 4 | FilterParser/SortParser (JSONB locale #51) + products/customers [REF] + saved_views + preferences + trang /users URL-sync | Claude | 🔍 chờ review | **#12-#14 ✅** (91/91) | DataTable §5.5 đầy đủ + form → GĐ8; FE hiện là bảng thô |
| 5 | Orders [REF]: state machine, đánh số atomic, optimistic lock, delete guard A2, bộ tính tiền B1, idempotency 3 lớp, outbox claim + consumer idempotent | Claude | 🔍 chờ review | **#15-#20e ✅** (116/116) | Hạn mức duyệt (approval_authorities) là OPT GĐ10 |
| 5b | Kho: thuật toán 4 bước (dedup → conditional UPDATE → movement → outbox), partition RANGE tháng + hàm tạo mảnh, serial cùng tx, 2 job rebuild/đối soát | Claude | 🔍 chờ review | **#22-#25 ✅** (123/123) | ADR-0003 chốt 6 câu hỏi kho; không FK dedup→movements |
| 6 | Export streaming keyset + backpressure; import batch/checkpoint/resume + lỗi từng dòng; bulk partial success | Claude | 🔍 chờ review | **#26-#28 ✅** (128/128) | GĐ7 nối file S3 presigned cho luồng upload import |
| 6b | A1 Report framework: registry khai báo → tự sinh list/meta/run/export, scope trong WHERE, field-level nơi 3, cache theo (tenant, scope, user, locale, params), `resolveLocaleExpr` (#51) | Claude | 🔍 chờ review | **#10 nơi 3 ✅** (reports-gd6b 11 test, suite 143/143) | Scope seed `report:sales` chốt 2026-08-07 = soi gương `order:export` (matrix §3.2); saved_reports/schedule là OPT GĐ10 |
| 7 | Audit timeline (GET /audit-logs, desc = actor trong cây); Files presigned S3/MinIO (@aws-sdk, đã hỏi-chốt) + attachments kế thừa quyền entity; Notifications đọc + preferences (membership); Business calendar + `addWorkingDays` + seed lễ VN (data, đã hỏi-chốt); export QUA QUEUE → S3 → notification; cron partition movements+audit_logs | Claude | 🔍 chờ review | **gd7 12 test + calendar unit 11 ✅** (suite 171/171) | MinIO vào Testcontainers; audit CRUD hiện ghi TƯỜNG MINH trong service — query-extension diff tự động (§4.9) chưa làm, cần quyết khi review; lễ âm 2027-2030 là data xấp xỉ, nghiệp vụ đối chiếu |
| 8a | Global search (§5C.7): GET /search nhóm theo module, quyền động theo nhóm, scope nhúng WHERE, tìm không dấu trên cột *_search, kết quả CHỈ cột định danh | Claude | 🔍 chờ review | **#29 ✅** (search-gd8 5 test, suite 176/176) | recent/favorites làm ở GĐ10 cùng §5C.2 |
| 8b | Action Registry (§5.9 theo docs/action-registry.tsx) + overlay manager (confirm promise: typeToConfirm/reason/options + bulk result dialog) + Cmd+K (cmdk + global search debounce) + nền FE: tokens §5.7 (--z-* duy nhất), next-intl vi/en (cookie), ui primitives shadcn, trang /orders demo 4 nơi; BE thêm POST /orders/:id/cancel (máy trạng thái có sẵn) | Claude | 🔍 chờ review | web build + tsc + lint xanh; orders+matrix 54/54 | Deps FE theo uỷ quyền 2026-08-07 (bộ đầy đủ); orders list Swagger chưa khai ApiOkResponse → orval sinh void, FE tự khai OrderRow (nợ BE); DataTable §5.5 + Form §5.8 ở lát FE tổng thể |

## Việc chặn (blocker)

Không còn blocker hạ tầng. Hai bug thật đã bắt-và-sửa nhờ test GĐ1 (ghi ở onboarding §5):
`runWith` phải await bên trong cls.run (PrismaPromise lazy), và soft-delete extension
phải mắc TRƯỚC tenancy extension (sentinel deletedAt bị AND-wrap đè).
