> ⚠️ **ĐỌC TRƯỚC KHI CLONE LẦN THỨ HAI**
>
> `docker-compose.dev.yml` dùng `COMPOSE_PROJECT_NAME` để đặt tên dự án Docker.
> Nếu bạn clone repo này lần thứ hai trên cùng một máy mà KHÔNG đổi giá trị đó
> trong `.env`, hai clone sẽ dùng **chung container và chung database**. Chạy
> `pnpm bootstrap` ở clone mới sẽ **ghi đè dữ liệu** của clone cũ, không hỏi gì.
>
> Đổi một dòng là xong: `COMPOSE_PROJECT_NAME=nexus-<tên-dự-án>`.

# Onboarding

> Nếu bước 1 mất hơn 30 phút thì đó là bug của repo — mở issue (working-agreement §9).

## 1. Cài đặt

Yêu cầu: **Node 22+**, **pnpm 8**, **Docker Desktop**, Git.

```bash
git clone <repo> && cd nexus
cp .env.example .env          # sửa JWT_SECRET + APP_ENCRYPTION_KEY
pnpm bootstrap                # V1-V4: container + install + build shared + migrate + seed
pnpm dev                      # cổng đọc từ .env (mặc định web :3000 · api :4000)
```

> F01/C1: bản trước dạy `make setup` + luồng `migrate dev` "lần đầu tiên" —
> hai tài liệu nói hai đường và `migrate dev` có nguy cơ DROP manual-DDL
> (xem cookbook §1 mục ⛔). Chuẩn duy nhất giờ là `pnpm bootstrap` như README.

Tài khoản seed: xem `apps/api/prisma/seed.ts` (mật khẩu chung `Passw0rd!`).

## 2. Đọc theo thứ tự

1. `README.md`
2. `docs/cookbook.md` — mục lục, đọc công thức khi cần
3. Spec §1, §3, §6.5, §12 — KHÔNG đọc cả file
4. `docs/working-agreement.md`
5. `CLAUDE.md` nếu bạn giao việc cho AI agent

## 3. Việc đầu tiên

Thêm một trường vào entity có sẵn theo cookbook §3, đi trọn:
migration → DTO → API → FE → test. Mở PR dưới 400 dòng.

## 4. Lệnh hằng ngày

```bash
pnpm typecheck && pnpm lint        # trước mỗi commit
pnpm test tenancy                  # sau MỌI thay đổi chạm DB/quyền
node tools/checks/run-all.mjs      # check kiến trúc (CI cũng chạy)
pnpm gen:api                       # BE đổi contract → sinh lại client
```

## 5. Những cái bẫy đã gặp (cập nhật khi bạn vấp cái mới)

| Bẫy | Cách né |
|---|---|
| Chạy script Nest bằng `tsx` → DI lỗi `undefined` | tsx không emit decorator metadata. Dùng `ts-node -T` (xem ADR-0002) |
| Import từ `src/main.ts` → app tự listen port 4000 | Import từ `src/bootstrap.ts` |
| Gọi `prisma.x.y()` trong service → ESLint đỏ | Mọi truy cập Prisma qua `*.repository.ts` (spec §4.9) |
| Thêm model mới → app không khởi động | Phân loại vào `TENANCY_POLICY` + thêm dòng ma trận spec §6.5 (cookbook §1) |
| Test đỏ `[TENANCY] ... fail-closed` | Query TENANT model ngoài request context — bọc `ctx.runWith({tenantId}, ...)` |
| `prisma migrate dev` treo/đòi reset | Manual DDL (path ltree, partial unique, partition) không nằm trong schema.prisma → drift. **Áp migration bằng `pnpm prisma:migrate` (= migrate deploy)**. Tạo migration mới bằng `pnpm prisma:migrate:new` rồi RÀ TAY: xoá mọi câu DROP đụng tới object của manual-ddl.sql trước khi commit |
