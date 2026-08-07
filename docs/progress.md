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
| 2 | Auth đầy đủ: refresh rotation, CSRF, Redis session, rate limit | — | ⬜ chưa | #4-#7 | Login GĐ1 đã có phần tối thiểu; #4 một phần đã xanh |
| 3 | Users/Roles/OrgUnits CRUD + vòng đời tài khoản | — | ⬜ chưa | #8-#11 | |

## Việc chặn (blocker)

Không còn blocker hạ tầng. Hai bug thật đã bắt-và-sửa nhờ test GĐ1 (ghi ở onboarding §5):
`runWith` phải await bên trong cls.run (PrismaPromise lazy), và soft-delete extension
phải mắc TRƯỚC tenancy extension (sentinel deletedAt bị AND-wrap đè).
