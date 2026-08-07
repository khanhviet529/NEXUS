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

## Việc chặn (blocker)

Không còn blocker hạ tầng. Hai bug thật đã bắt-và-sửa nhờ test GĐ1 (ghi ở onboarding §5):
`runWith` phải await bên trong cls.run (PrismaPromise lazy), và soft-delete extension
phải mắc TRƯỚC tenancy extension (sentinel deletedAt bị AND-wrap đè).
