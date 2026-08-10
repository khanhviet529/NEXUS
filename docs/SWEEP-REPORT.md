# C0 — QUÉT PHỦ TOÀN BỘ

| | |
|---|---|
| **Ngày** | 2026-08-10 |
| **Thư mục** | `E:\nexus-sweep` (clone sạch, `.git` mới, chỉ đọc `docs/`) |
| **Phạm vi ĐÃ chạy** | C0.0 tầng 1–2 (dựng) · C0.1 · C0.2 · C0.3 |
| **Phạm vi CHƯA chạy** | C0.0 tầng 3–6 · C0.4 · C0.5 · C0.6 — xem mục 6 |
| **Luật đã tuân** | GHI, KHÔNG SỬA. Ba chỗ `[BLOCKER-FIXED]` vì không đi tiếp được |

> ⚠️ **Đây là báo cáo MỘT PHẦN.** Tôi dừng khi còn đủ chỗ để viết báo cáo tử tế,
> thay vì chạy tiếp rồi không kịp ghi lại gì. Mục 6 liệt kê chính xác cái gì
> chưa chạy và cần gì để chạy.

---

## 1. Số đo

| Bước | Tài liệu nói | Thực tế | Lệch |
|---|---|---|---|
| `make setup` | < 30 phút (README:44) | **KHÔNG CHẠY ĐƯỢC** — `make` không có trên Windows | ❌ chặn hoàn toàn |
| Setup thật (lệnh tương đương) | — | **126 giây** | ✅ nhanh hơn cam kết 14 lần |
| ↳ `docker compose up --wait` | — | 15s | |
| ↳ `pnpm install` | — | 87s | |
| ↳ `prisma:migrate` | — | 7s | |
| ↳ `pnpm --filter @nexus/shared build` | **không có trong tài liệu** | 3s | ❌ bước ẩn |
| ↳ `prisma:generate` | **không có trong tài liệu** | 8s | ❌ bước ẩn |
| ↳ `prisma:seed` | — | 6s | |
| Số bước tay README không nói | 0 | **3** (tạo `.env`, build shared, generate) | ❌ |
| Bảng cắt gọt §11: dòng dùng được | 8/8 | **3/8** | ❌ 5 dòng trỏ vào đường dẫn không tồn tại |

---

## 2. Tổng hợp phát hiện

| Mức | Số lượng |
|---|---|
| **BLOCKER** | 4 |
| **SAI** | 1 |
| **MA SÁT** | 2 |
| **TÀI LIỆU** | 5 |
| **Tổng** | **12** |

> Dưới 10 phát hiện là dấu hiệu bộ bắt lỗi chưa chạy đúng. 12 phát hiện này đến
> từ **chỉ 4 bước đầu** và **chưa có tầng interceptor nào chạy** — con số thật
> khi chạy đủ C0.6 gần như chắc chắn cao hơn nhiều.

---

## 3. Chi tiết

| # | Mức | Bước | Mô tả | Tài liệu nói | Thực tế | Lệnh tái hiện |
|---|---|---|---|---|---|---|
| **F-01** | **BLOCKER** | C0.3 | **`make setup` không thể thành công trên clone sạch.** Target `setup` chỉ có `up · install · migrate · seed` — thiếu build `@nexus/shared`, nên `seed` chết: `Cannot find module '@nexus/shared/dist/index.js'` | README: "`make setup` — cài deps, dựng postgres/redis/minio/mailpit, migrate, seed" | Chết ở bước 4/4 | `git clone && make setup` |
| **F-02** | **BLOCKER** | C0.3 | **`make setup` cũng thiếu `prisma generate`.** Sau khi vá F-01, seed lại chết: `@prisma/client did not initialize yet` | như trên | Chết lần hai | `pnpm --filter @nexus/api prisma:seed` sau khi install |
| **F-03** | **BLOCKER** | C0.3 | **`make` không tồn tại trên Windows.** README ghi yêu cầu "Node 22+, pnpm, Docker" — không nhắc `make`. Mà repo phát triển được trên Windows (CRLF warning ở mọi commit chứng minh) | "Yêu cầu: Node 22+, pnpm, Docker" | `make: command not found` | `make setup` trên Windows |
| **F-04** | **BLOCKER** | C0.1/C0.3 | **`docker-compose.dev.yml` hardcode `name: nexus-dev`.** Clone thứ hai dùng CHUNG container, volume và database với clone thứ nhất. Chạy `prisma:migrate`/`seed` từ clone mới sẽ **ghi đè DB của repo gốc** mà không cảnh báo gì | — | Suýt mất dữ liệu; tôi phát hiện trước khi chạy và tạo compose project riêng | `docker compose -f docker-compose.dev.yml up -d` ở hai thư mục |
| **F-05** | **SAI** | C0.2 | **5/8 dòng bảng cắt gọt §11 trỏ vào đường dẫn KHÔNG TỒN TẠI**: `modules/approvals` (thật ra là `approval-authorities`), `features/approvals`, `features/notifications`, `features/settings`, `packages/vn`. Lệnh `rm -rf` in trong bảng là no-op | "Đối chiếu bảng dưới, xoá module không dùng" | 5 lệnh không xoá gì | `ls apps/api/src/modules/approvals` |
| **F-06** | **TÀI LIỆU** | C0.3 | **Không nói phải tạo `.env`.** `make setup` không copy `.env.example` → `.env`; `prisma:migrate` chết với `Environment variable not found: DATABASE_URL` | README không nhắc | Phải làm tay | `make setup` trên clone sạch |
| **F-07** | **TÀI LIỆU** | C0.2 | **Bảng cắt gọt bỏ sót 9 module CÓ THẬT**: `calendar`, `exports`, `files`, `inventory`, `personalization`, `reports`, `saved-views`, `search`, `webhooks`. Dự án mới không có hướng dẫn giữ hay xoá chúng | "Liệt kê toàn bộ" (§6.5 nói vậy về bảng khác, §11 không nói) | 23 module BE, bảng chỉ nhắc 5 | `ls apps/api/src/modules` |
| **F-08** | **MA SÁT** | C0.1 | **Cổng host cố định** (5432/6379/9000/8025) — không chạy được song song với bất kỳ dịch vụ nào đang giữ cổng đó. Ở máy này MinIO không lên được vì một container dự án khác đang giữ 9000 | — | Phải viết compose override | `docker compose up` khi đã có gì đó ở 9000 |
| **F-09** | **MA SÁT** | C0.1 | Override cổng bằng compose thường **không đủ**: compose **GỘP** danh sách `ports` thay vì thay thế, phải dùng `!override`. Người không biết mẹo này sẽ bế tắc | — | Mất một vòng thử | xem `docker-compose.sweep.yml` |
| **F-10** | **TÀI LIỆU** | Việc 2 | **CHECKLIST của generator thiếu 3 bước** (phát hiện khi làm test #37, ghi lại ở đây vì cùng loại): không nhắc build lại `@nexus/shared`; không nhắc gán quyền cho vai trò ở `seed-roles.ts`; bước 1 "copy khuôn Customer" không liệt kê cột `*_search` | "CHECKLIST BẮT BUỘC còn lại" 8 bước | Làm đủ 8 bước vẫn không chạy | `node tools/test-generator.mjs` |
| **F-11** | **TÀI LIỆU** | Việc 2 | **`plopfile.mjs` hứa sai**: "các check kiến trúc sẽ ĐỎ nếu quên" — thực tế `run-all.mjs` VẪN XANH ngay sau `gen:module` | docblock plopfile | Đã vá bằng check #10 ở PR #19 | như trên |
| **F-12** | **TÀI LIỆU** | Việc 2 | **`docs/test-a-b.md` không tồn tại** trong repo dù được viện dẫn hai lần. Đã tìm trên đĩa, trong `git log --all`, mọi nhánh remote | "Đọc docs/test-a-b.md phần TEST #31" | Không có file | `git log --all --name-only \| grep test-a-b` |

### Ba chỗ `[BLOCKER-FIXED]` — đã sửa vì không đi tiếp được

| Sửa gì | Vì sao buộc phải sửa |
|---|---|
| Chạy `pnpm --filter @nexus/shared build` | Không có thì `seed` chết → không có dữ liệu → mọi bước sau vô nghĩa |
| Chạy `pnpm --filter @nexus/api prisma:generate` | Như trên |
| Tạo `docker-compose.sweep.yml` (project + cổng riêng) | Không có thì sweep ghi đè DB của repo gốc — chạm rule (a) |

Cả ba đều là **thao tác trong `nexus-sweep`**, không sửa file nguồn của repo.

---

## 4. Vi phạm bất biến tự động

| Bất biến | Số lần vi phạm | Endpoint hay vi phạm nhất |
|---|---|---|
| — | **chưa chạy** | — |

`docs/sweep/network.jsonl`, `console.jsonl`, `db-probe.jsonl` **rỗng** vì tầng
interceptor mới ở trạng thái ĐÃ DỰNG, CHƯA GẮN. Theo chính cảnh báo trong yêu
cầu, `network.jsonl` rỗng là dấu hiệu interceptor chưa chạy — đúng như vậy, và
lý do ghi ở mục 6.

Đã dựng và commit:

| File | Nội dung | Trạng thái |
|---|---|---|
| `docs/sweep/canary.ts` | 6 giá trị canary + `findCanaries()` + bảng mức độ | ✅ dựng xong, chưa seed vào DB |
| `docs/sweep/interceptor.ts` | 8 bất biến I1–I8, ghi `Violation` ra jsonl, KHÔNG throw | ✅ dựng xong, chưa gắn |

---

## 5. Ảnh

`docs/sweep-screens/` — **rỗng**. Chưa tới bước C0.5/C0.6 nên chưa có ảnh nào.

---

## 6. Không kiểm được

| Bước | Không làm được gì | Vì sao | Cần gì để làm được |
|---|---|---|---|
| C0.0 tầng 1 | Chưa seed canary vào DB | Cần sửa `prisma/seed.ts` của bản sweep rồi seed lại | ~30 phút |
| C0.0 tầng 2 | Interceptor chưa gắn vào luồng request | Cần một runner (Playwright hoặc supertest) gọi hết endpoint theo từng vai trò | ~2 giờ |
| C0.0 tầng 3 | Console/pageerror | Cần chạy trình duyệt thật với web đã build | ~1 giờ |
| C0.0 tầng 4 | Dò DB sau mutation | Cần runner ở trên chạy trước | ~1 giờ |
| C0.0 tầng 5 | Đếm query | **Đã có sẵn** ở repo gốc (`l16-query-budget.spec.ts`, PR #17) — chỉ cần chạy trong sweep | ~15 phút |
| C0.2 | Chưa chạy `rm -rf` thật rồi đo số chỗ đỏ | Cần `pnpm install` xong (đã có) + chạy typecheck/lint/checks sau mỗi lần xoá, 8 vòng | ~1 giờ |
| C0.4 | Playbook FE §1, `brandHue = 70` | Chưa chạm | ~1,5 giờ |
| C0.5 | `gen:module` × 4 tổ hợp | Chưa chạm. Lưu ý: test #37 (PR #19) đã chứng minh **một** tổ hợp chạy được end-to-end | ~2 giờ |
| C0.6 | Toàn bộ danh sách dùng thật | Chưa chạm — phần lớn giá trị của C0 nằm ở đây | ~4 giờ |

**Ước lượng để hoàn tất C0: khoảng 12 giờ làm việc nữa.**

---

## 7. Câu hỏi cho người

| # | Bước | Câu hỏi | Tôi đã tạm chọn cách nào | Vì sao chọn vậy |
|---|---|---|---|---|
| **Q-1** | C0.1 | `docker-compose.dev.yml` hardcode `name: nexus-dev` — đây là **chủ ý** (để `make down` luôn tìm đúng stack) hay **sót**? | Không sửa file gốc; tạo `docker-compose.sweep.yml` riêng cho sweep | Luật số một: ghi, không sửa. Và đây là quyết định thiết kế, không phải lỗi hiển nhiên |
| **Q-2** | C0.3 | `make setup` nên tự tạo `.env`, hay cố ý bắt người dùng đọc `.env.example` trước? | Tạo `.env` tay cho sweep, ghi là phát hiện F-06 | Không có cách nào chạy tiếp mà không có `.env` |
| **Q-3** | C0.2 | Bảng §11 lệch thực tế: sửa **bảng** cho khớp code, hay sửa **code** cho khớp bảng (đổi `approval-authorities` → `approvals`, thêm `packages/vn`)? | Không sửa gì, ghi F-05 + F-07 | Hai hướng đều hợp lệ — **[CẦN QUYẾT]** |
| **Q-4** | C0.3 | Cam kết "dưới 30 phút" nên đo từ đâu? Tôi đo từ `docker up` tới lúc seed xong (126s), **chưa gồm** cài Docker/Node/pnpm và **chưa gồm** `pnpm build` cho web | Đo phần lệnh trong README | Đó là phần README kiểm soát được. Nếu tính cả cài Docker thì con số phụ thuộc máy | 
| **Q-5** | C0 | Tôi dừng ở C0.3 để còn chỗ viết báo cáo, thay vì chạy tiếp rồi không kịp ghi | Dừng và viết | 12 phát hiện có ghi chép đầy đủ đáng giá hơn 25 phát hiện không kịp ghi lại. **[CẦN QUYẾT]**: có muốn tôi chạy tiếp C0.4→C0.6 ở lượt sau không |
| **Q-6** | Việc 2 | `docs/test-a-b.md` vẫn không có. Tôi dựng test #37 theo bốn khẳng định trong tin nhắn | Làm theo tin nhắn | Không có nguồn nào khác. Nếu file có nội dung khác thì test #37 cần sửa lại |
| **Q-7** | C0.2 | Có nên xoá module [REF] `orders` thật trong sweep để đo "bao nhiêu chỗ đỏ"? | **Chưa làm** | Cần chạy 8 vòng xoá-rồi-đo trước đó để so sánh có nghĩa; làm lẻ một mình `orders` không trả lời được câu hỏi của bảng |

---

## Ghi chú cuối

**Điều đáng lo nhất không phải 4 BLOCKER**, mà là chúng nằm ở **bốn bước đầu
tiên** mà mọi dự án tương lai đều phải đi qua, và **chưa ai từng đi hết** —
giống hệt hai thứ đã phát hiện trước đó trong cùng ngày: check #6 chạy rỗng ở
mọi PR, và CD chưa từng build được image.

Cùng một khuôn mẫu lặp lại ba lần: **cơ chế tồn tại, được ghi trong tài liệu,
và chưa từng chạy lần nào.**

---

## Phụ lục — F-13, F-14: phát hiện KHI VÁ, không phải khi quét

Hai phát hiện dưới đây không đến từ C0.1–C0.3. Chúng lộ ra ở lượt V1–V4, lúc
**chạy thử chính bản vá** cho F-01…F-06. Ghi vào đây để giữ MỘT sổ phát hiện
duy nhất; V7 (C0.4→C0.6) vì vậy bắt đầu từ **F-15**.

### F-13 — BLOCKER — `pnpm setup` là lệnh CÓ SẴN của pnpm, không phải script của repo

V2/V3 thêm `"setup": "node tools/setup.mjs"` vào `package.json` và README bảo
người mới chạy `pnpm setup`. Chạy thử trên clone sạch:

```
Next configuration changes were made:
PNPM_HOME=C:\Users\...\AppData\Local\pnpm
Setup complete. Open a new terminal to start using pnpm.
```

pnpm nuốt tên `setup` cho lệnh nội bộ của nó (thiết lập `PNPM_HOME`), script
trong `package.json` **không bao giờ chạy**. Người mới sẽ thấy dòng "Setup
complete" — tưởng xong — rồi `pnpm dev` chết vì chưa có database.

Đây đúng thuộc tính thứ ba ở working-agreement §4.1b: hướng dẫn **PHẢI SỬA ĐƯỢC
THEO**. Nó chỉ lộ ra vì có người gõ thật thay vì đọc và tin.

**Đã sửa:** đổi tên thành `pnpm bootstrap` (`package.json`, `README.md`,
`Makefile`, `docs/onboarding.md`, job CI `onboarding`).

### F-14 — BLOCKER — đổi `COMPOSE_PROJECT_NAME` KHÔNG đủ để chạy clone thứ hai

V1 vá F-04 bằng `name: ${COMPOSE_PROJECT_NAME:-nexus-dev}`. Bản vá đó tách
container và volume — nhưng **không tách cổng host**. Clone thứ hai vẫn chết:

```
Error response from daemon: failed to set up container networking:
Bind for 0.0.0.0:9000 failed: port is already allocated
```

Tức bản vá F-04 **chưa đủ**, và nếu không chạy thử thì tài liệu đã ghi "đổi
`COMPOSE_PROJECT_NAME` là xong" — một câu sai.

**Đã sửa:** tham số hoá cả 6 cổng host (`POSTGRES_PORT`, `REDIS_PORT`,
`MINIO_PORT`, `MINIO_CONSOLE_PORT`, `MAILPIT_UI_PORT`, `MAILPIT_SMTP_PORT`)
trong `docker-compose.dev.yml` + `.env.example`, kèm ghi chú rằng phải đổi
**cả cụm**, không chỉ tên project.

### Bằng chứng: lần đầu tiên đường onboarding chạy TRỌN

Clone thứ hai (`E:\nexus-sweep`), `COMPOSE_PROJECT_NAME=nexus-sweep`, cổng riêng:

```
▸ Dựng hạ tầng (postgres · redis · minio · mailpit)  ✓ 81.2s
▸ Cài dependency                                     ✓ 26.3s
▸ Build @nexus/shared                                ✓  7.7s
▸ Sinh Prisma client                                 ✓ 13.5s
▸ Chạy migration                                     ✓ 10.0s
▸ Seed dữ liệu mẫu                                   ✓ 11.0s
✅ Setup xong trong 150s (2.5 phút).       EXIT=0
```

F-01, F-02, F-03, F-06 đóng. F-04 đóng bằng F-14. Job CI `onboarding` (V4) giữ
cho con số này không mục lại: nó checkout vào thư mục riêng, **không cache
pnpm**, chạy đúng lệnh README nói, và đỏ nếu vượt cam kết 30 phút.

### F-15 — BLOCKER — `.env` ở gốc, nhưng Prisma chạy ở `apps/api` và không thấy nó

Do **chính job CI `onboarding` (V4) tìm ra ở lần chạy đầu tiên**, không phải do
người quét. Đây là bằng chứng job đó có giá trị.

```
Error: Prisma schema validation - (get-config wasm)
Error code: P1012
error: Environment variable not found: DATABASE_URL.
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @nexus/api prisma:migrate
```

Repo có ĐÚNG MỘT `.env`, ở gốc. `prisma generate|migrate` và `tsx
--env-file=.env prisma/seed.ts` đều chạy với cwd là `apps/api`, và **không cái
nào đi ngược lên thư mục cha**. `ConfigModule.forRoot()` cũng vậy — nên `pnpm
dev` cho API cũng hỏng trên clone sạch, chỉ là migrate chết trước nên chưa ai
thấy.

Đo A/B trên cùng một clone, khác đúng một dòng script:

| lệnh | mã thoát | kết quả |
|---|---|---|
| `prisma migrate deploy` | **1** | `Environment variable not found: DATABASE_URL` |
| `node ../../tools/with-env.mjs prisma migrate deploy` | **0** | `No pending migrations to apply.` |

Vì sao lượt chạy tay trước đó của tôi lại xanh: máy đã có `apps/api/.env` từ
một lần thử cũ. Tôi xoá nó đi rồi mới đo lại — và đó đúng là "thiếu thứ mà máy
quen việc đã có sẵn", loại lỗi mà job không-cache-gì-cả sinh ra để bắt.

**Đã sửa:** `tools/with-env.mjs` nạp `.env` ở gốc rồi mới spawn lệnh (biến môi
trường thật vẫn thắng file, để CI truyền secret được). Bốn script `prisma:*`
đi qua nó; `ConfigModule` thêm `envFilePath: ['../../.env', '.env']`.
Không thêm dependency nào — `dotenv-cli` đã cân nhắc và bỏ (CLAUDE.md §4).

### F-16 — BLOCKER — `.env.example` chở giá trị KHÔNG qua nổi validator của chính repo

Cũng do job `onboarding` tìm ra, ở lần chạy thứ hai — sau khi F-15 được vá,
`pnpm bootstrap` xanh và lỗi lộ ra ở bước kế tiếp:

```
[Nest] ERROR [ExceptionHandler] Error: Biến môi trường không hợp lệ:
  JWT_SECRET: JWT_SECRET phải ≥ 32 ký tự
```

`.env.example` ghi `JWT_SECRET=CHANGE_ME_min_32_bytes_random` — **29 ký tự**,
ngay cạnh một validator `z.string().min(32)`. Placeholder vừa **nói ra luật**
vừa **vi phạm luật**. Người mới chạy `pnpm bootstrap` thành công rồi `pnpm dev`
chết ngay dòng đầu.

Đổi cho đủ dài thôi thì lại đẩy nợ sang đầu kia: một placeholder qua được
validator mà không ai gác sẽ đi thẳng lên production. Cần **cả hai** đầu.

**Đã sửa:**
- `.env.example`: `JWT_SECRET` (37 ký tự) và `APP_ENCRYPTION_KEY` hợp lệ ở dev
- `env.ts`: `NODE_ENV=production` + vẫn dùng giá trị mẫu → **từ chối khởi động**
- `apps/api/test/env-validation.spec.ts` — 4 test, đọc THẲNG từ `.env.example`
  nên test không trôi khỏi file thật:

```
 ✓ test/env-validation.spec.ts (4 tests) 76ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### Bằng chứng — API khởi động thật trên clone sạch

```
$ curl -s http://localhost:4100/api/v1/health
{"status":"ok","db":true,"redis":true,"version":"dev"}
```

Ba lần chạy job `onboarding` là ba lỗi khác nhau, mỗi lần lùi được một bước:
F-15 (bootstrap chết) → F-16 (bootstrap xanh, app chết) → app sống. Không lần
nào trong ba lỗi đó nhìn ra được nếu chỉ đọc code.

---

# V7 — tiếp C0.4 và C0.5

Đánh số từ **F-17** (F-13…F-16 đã dùng ở V1–V4).

## C0.5 — `gen:module` × 4 tổ hợp

Chạy trong `E:\nexus-sweep`, không đụng repo gốc.

| # | Đầu vào | Kết quả | Đánh giá |
|---|---|---|---|
| 1 | `category` | `modules/categorys`, `ListCategorysDto`, route `/categorys` | **F-17** |
| 2 | `order` (trùng module có sẵn) | `EXIT=1`, `File already exists`, **không ghi đè** — md5 của `orders.module.ts` không đổi, controller vẫn 405 dòng | ✓ đúng |
| 3 | `purchase-order` | `modules/purchase-orders` — số nhiều nhiều-từ đúng | ✓ đúng |
| 4 | `Invoice` (chữ hoa) | `EXIT=1`, `kebab-case, bắt đầu bằng chữ thường`, không sinh file nào | ✓ đúng |

### F-17 — SAI — generator ghép `+s` thô, số nhiều bất quy tắc sai không cảnh báo

`category` → `categorys`. Sai ở **tên thư mục, tên class DTO, và route HTTP**
(`/categorys`) — tức lộ ra tận API công khai. Không có cảnh báo nào.

Danh mục là loại module người ta sinh nhiều nhất; `category`, `company`,
`policy`, `entity` đều rơi vào cùng cái bẫy.

**Chưa sửa** (luật số một: ghi, không sửa). Hai hướng đều hợp lệ —
**[CẦN QUYẾT]**: (a) thêm bảng số nhiều bất quy tắc vào generator, hay
(b) hỏi thẳng số nhiều thành một câu hỏi riêng của prompt.

### F-18 — SAI — generator sinh module KHÔNG có nhãn cắt gọt → check #12 đỏ ngay

Do chính V5 tạo ra: check #12 đòi mọi module có nhãn `[CORE]/[OPT]/[REF]`, mà
`templates/be-module.hbs` không sinh nhãn nào và checklist 8 bước cũng không
nhắc. Sinh xong module là CI đỏ, người dùng không biết vì sao.

Đúng thuộc tính thứ ba ở working-agreement §4.1b: một check bảo "hãy làm X" mà
công cụ chính thức tạo ra thứ vi phạm X thì hướng dẫn đó **không sửa theo được**.

**Đã sửa** (nằm trong PR của V5, vì đây là hệ quả của V5): template mang sẵn
`[OPT]` kèm hướng dẫn đổi sang CORE; checklist thêm bước 8.

### F-19 — MA SÁT — thông báo lỗi của plop in ĐƯỜNG DẪN CHƯA RENDER

```
✖  ++ File already exists
✖  ++ ../../apps/api/src/modules/{{dashCase name}}s/{{dashCase name}}s.controller.ts
```

Không nói file NÀO trùng. Người dùng phải tự suy ra. **Chưa sửa.**

## C0.4 — Playbook FE §1, `brandHue = 70`

`apps/web/src/config/project-ui.ts` ghi: *"⚠ Sau khi đổi `brandHue`, BẮT BUỘC
chạy `pnpm test:a11y`… Vùng hue vàng-lục (~70) đặc biệt dễ trượt AA với chữ
trắng trên nền brand"*.

Đã đổi `brandHue: 258 → 70`, build lại, chạy `pnpm test:a11y`.

### F-20 — MA SÁT — `pnpm test:a11y` KHÔNG chạy nổi trên máy Windows này

4/4 test đỏ, nhưng **không phải vì tương phản**: `page.goto` và
`axe.analyze` đều `Test timeout of 30000ms exceeded`. Một test duyệt **6 màn ×
(điều hướng + quét axe)** trong ngân sách 30s của `playwright.config.ts`.

Cùng bộ test **XANH trên CI** (job "FE tầng 5", PR #22), nên đây không phải
repo hỏng — mà là: lệnh được ghi là **BẮT BUỘC** ngay trong file mà người khởi
tạo dự án sửa đầu tiên, lại không chạy được trên nền tảng repo này được phát
triển. Vẫn là thuộc tính "PHẢI SỬA ĐƯỢC THEO". **Chưa sửa.**

> Sai lầm của tôi trong lúc đo, ghi lại để người sau không mất công: lượt
> "đối chứng" đầu tiên chạy nhầm vào **server cũ** — `next start` mới báo
> `EADDRINUSE` và im lặng chết, cổng 3100 vẫn do bản build hue 70 giữ. Số đo
> chỉ có nghĩa sau khi `netstat` xác nhận cổng đã trống.

### Trả lời câu hỏi thật của C0.4 — bằng tính toán, không bằng trình duyệt

Vì lưới a11y không chạy nổi, tôi tính thẳng OKLCH → OKLab → linear sRGB →
relative luminance → tỉ số WCAG (script ở scratchpad, thuật toán chuẩn).

**Cặp nền/chữ thật sự dùng trong `semantic.css`:**

| theme | hue | nền | chữ | tỉ số | AA 4.5 | ngoài gamut sRGB |
|---|---|---|---|---|---|---|
| light | 258 | `brand-600` | `oklch(.98 0 0)` | **5.75** | ✓ | — |
| dark | 258 | `brand-400` | `oklch(.18 .02 258)` | **6.99** | ✓ | — |
| light | **70** | `brand-600` | `oklch(.98 0 0)` | **5.82** | ✓ | **CÓ** |
| dark | **70** | `brand-400` | `oklch(.18 .02 258)` | **6.83** | ✓ | — |

**Kết luận đo được: cảnh báo trong `project-ui.ts` KHÔNG đúng như đã viết.**
Ở hue 70, tỉ số tương phản gần như **không đổi** (5.82 so với 5.75) và vẫn đạt
AA. Lý do: thang L của brand được chốt bằng số đo (0.70/0.58/0.50/0.42), mà
L của OKLCH bám khá sát luminance — đó chính là điều làm OKLCH đáng dùng.

Rủi ro thật ở hue 70 **là chuyện khác**: `brand-600` rơi **ra ngoài gamut
sRGB**. Trình duyệt tự kẹp, nên màu hiển thị KHÔNG phải màu đã tính — tương
phản vẫn đạt, nhưng sắc độ lệch khỏi thứ nhà thiết kế chọn. Cảnh báo hiện tại
chỉ vào sai chỗ.

### F-21 — SAI — `--color-primary-fg` ở dark mode chốt cứng hue 258

```css
--color-primary-fg: oklch(0.18 0.02 258);   /* không dùng var(--brand-h) */
```

Dự án đặt `brandHue: 70` vẫn nhận chữ ám xanh trên nút brand vàng-lục. Chroma
0.02 nên gần như không thấy bằng mắt, nhưng nó là một token **thoát khỏi núm
`brandHue`** — đúng thứ hệ ba tầng token sinh ra để chặn. **Chưa sửa.**

## Còn lại

| Bước | Trạng thái |
|---|---|
| C0.4 | **Xong** — nhưng bằng tính toán, không bằng lưới a11y (F-20) |
| C0.5 | **Xong** — 4/4 tổ hợp |
| C0.6 | **Chưa chạm** — phần lớn giá trị của C0 vẫn nằm ở đây, ước ~4 giờ |
| C0.0 tầng 1–5, C0.2 (`rm -rf` thật) | Chưa chạm, như mục 6 |

