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

# LƯỢT 2 — 2026-08-12: C0.4 → C0.6

| | |
|---|---|
| **Phạm vi lượt này** | C0.4 (đủ) · C0.5 (2/4 tổ hợp — xem giới hạn) · C0.6 (phần chạy được bằng máy) |
| **Khác lượt 1** | Chạy trên repo làm việc, KHÔNG phải clone sạch — vì C0.4/C0.5 đo hành vi generator/token, không đo trải nghiệm khởi tạo |
| **Luật** | Lượt này ĐƯỢC sửa (khác lượt 1): phát hiện nào có lời giải rõ thì vá ngay trong cùng PR, ghi lại đây |

## Phát hiện lượt 2

| # | Mức | Bước | Phát hiện | Xử lý |
|---|---|---|---|---|
| **F-17** | **SAI (đã vá)** | C0.5 | **Công thức "thêm module" thiếu bước bảng cắt gọt §11.** Check mới `check-cut-table` (V5) làm test #37 đỏ ở khẳng định #3b: generator sinh module nhưng không ai nhắc thêm dòng vào bảng §11 → check kiến trúc đỏ dù đã làm đủ checklist cũ. Đây đúng loại lỗi bảng cắt gọt cũ mắc (F-05/F-07): tài liệu và code lệch nhau không ai canh | Vá cùng PR: test #37 chèn dòng cắt gọt cho module tạm (restore ở cleanup), checklist generator thêm bước 4b. Test #37 lại 8/8 |
| **F-18** | **TÍCH CỰC** | C0.4 | **`brandHue: 70` (vàng-lục — vùng spec cảnh báo "rất dễ trượt AA") ĐẠT WCAG 2 AA 4/4 tổ hợp** (enterprise/operations × light/dark, 6 màn/tổ hợp). Nỗi sợ ở fe-preset-system §8.3 không thành sự thật với hệ token hiện tại — vì `--color-primary-fg` chọn theo L thực của nền, không hardcode trắng | KHÔNG đổi gì: luật "đổi brandHue phải chạy `pnpm test:a11y`" giữ nguyên — nó vừa chứng minh giá trị bằng một lần chạy 3 phút |
| **F-19** | **TÀI LIỆU** | C0.6 | Toàn bộ BE test suite chạy MỘT LƯỢT (kết quả dán dưới) — trước nay chỉ chạy theo cụm từng PR, chưa có bằng chứng cả bộ xanh cùng lúc trên một máy | Kết quả ở mục dưới |

## C0.5 — độ phủ thật

- Tổ hợp 1: `gen:module` đầy đủ (BE+FE+test) — **test #37, 8/8 khẳng định**, gồm cả bước MỚI (dòng cắt gọt §11)
- Tổ hợp 2: `gen:module-fe` (FE-only cho BE có sẵn) — dogfood thật ở V10: trang `products` đang chạy trong app là sản phẩm của nó
- Tổ hợp 3–4 (biến thể tên đa từ, module không soft-delete): **CHƯA CHẠY** — generator hiện chỉ một prompt tên; biến thể thật sự cần khi có dự án dùng

## C0.6 — phần chạy được bằng máy vs phần cần người

- ĐÃ chạy bằng máy: e2e 39/39 trên BUILD PRODUCTION (visual 2 preset × 2 theme + a11y + smoke đăng nhập/danh sách/Cmd+K/chuông) · toàn bộ BE suite (dưới) · 216+ FE unit/integration
- CẦN NGƯỜI (chưa làm): cầm chuột đi hết 15 màn với DB thật + mắt người soi từng màn — đúng nghĩa "dùng thật" của C0.6. Ước lượng của lượt 1 (~4h người) vẫn đứng

## Kết quả toàn bộ BE suite (F-19) + phát hiện F-20

Lần chạy CẢ BỘ đầu tiên: `31 file / 244 test — 2 đỏ thật (+2 flaky dưới tải, chạy lại thì xanh)`.

| # | Mức | Phát hiện | Xử lý |
|---|---|---|---|
| **F-20** | **SAI (đã vá)** | Hai lưới phòng vệ bắt được endpoint mới chưa khai báo — ĐÚNG như thiết kế, nhưng lộ ra quy trình PR các phase trước chỉ chạy test THEO CỤM nên không ai thấy: (a) `l16-query-budget` đòi phân loại `GET /settings` (V12) + `GET /inventory/warehouses` (4b) vào LIST_PATHS/KNOWN_SINGLETONS; (b) snapshot route-inventory (`universal.spec`) lệch 4 route mới (`orders/export` V11, `settings` GET/PATCH V12, `inventory/warehouses` 4b) | Vá cùng PR: 2 đường vào KNOWN_SINGLETONS (danh sách nhỏ không phân trang), snapshot cập nhật SAU KHI SOÁT diff = đúng 4 route chủ đích, không route lạ. **Bài học quy trình**: các V trước chạy `pnpm test <cụm liên quan>` theo CLAUDE.md §2 — đủ cho module đó nhưng không đủ cho lưới TOÀN CỤC (universal/l16). Từ nay việc thêm endpoint phải chạy thêm `vitest run test/universal.spec.ts test/l16-query-budget.spec.ts` |

Sau vá: `universal 8/8 · l16 3/3`.

---

# HƯỚNG DẪN BẬT INTERCEPTOR + CANARY CHO PILOT (C0.6 phần người)

Chuẩn bị sẵn cho lượt pilot "dùng thật 1–2h" — hai tầng C0.0 còn thiếu nay BẬT ĐƯỢC:

## 1. Canary (C0.0 tầng 1 — phát hiện rò rỉ chéo tenant bằng mắt)

```bash
# Sau khi setup môi trường pilot (bootstrap + migrate + seed):
pnpm --filter @nexus/api exec tsx prisma/seed-canary.ts
```

Tạo tenant `CANARY-C` (đăng nhập được: `admin@canary.local` / `Passw0rd!`) với
3 sản phẩm + 3 khách hàng mà TÊN NÀO CŨNG chứa `CANARY`. Luật đọc trong buổi
pilot: **đăng nhập tenant A/B mà thấy chữ "CANARY" ở BẤT KỲ đâu** (danh sách,
tìm kiếm, Cmd+K, báo cáo, export CSV, thông báo) = **rò rỉ chéo tenant** —
chụp màn hình, ghi F-xx, phân loại sau. Script idempotent, chạy lại vô hại.

## 2. Interceptor request (C0.0 tầng 2 — dấu vết mọi request trong buổi dùng thật)

```bash
# Bật khi khởi động API của môi trường pilot:
PILOT_TRACE=1 PILOT_TRACE_FILE=./pilot-trace.ndjson pnpm --filter @nexus/api start
```

Mỗi request một dòng NDJSON: `ts · method · url · status · ms · tenantId ·
userId · errCode/errMessage` (mã nguồn: `src/common/interceptors/pilot-trace.interceptor.ts`,
chỉ gắn khi `PILOT_TRACE=1` — prod/test thường KHÔNG bị ảnh hưởng).

Sau buổi pilot, file này trả lời ba câu không dựa vào trí nhớ người bấm:

```bash
# (a) Đã đụng endpoint nào / route nào CHƯA từng được gọi
jq -r '"\(.method) \(.url | split("?")[0])"' pilot-trace.ndjson | sort -u

# (b) Request nào lỗi, mã gì
jq -c 'select(.status >= 400)' pilot-trace.ndjson

# (c) Request nào chậm bất thường (>1s)
jq -c 'select(.ms > 1000)' pilot-trace.ndjson
```

Đối chiếu (a) với snapshot route-inventory (`test/__snapshots__/universal.spec.ts.snap`)
để biết độ phủ thật của buổi đi 15 màn.

---

# R1 — HAI TEST FLAKY: GỐC, VÁ, VÀ BẰNG CHỨNG

Dạng thứ TƯ của "check có mà không tin được": KHÔNG XÁC ĐỊNH (bổ sung vào
ba dạng đã tổng kết: không chạy #6 · dương tính giả #11 · hướng dẫn vô tác dụng #9).

| # | Mức | Phát hiện | Gốc | Vá |
|---|---|---|---|---|
| **F-21** | **SAI (đã vá)** | `personalization-v13` đỏ khi `auth-gd2` chạy TRƯỚC nó | Test reset-password của auth-gd2 ĐỔI mật khẩu user seed dùng chung `staff@tenant-b.local` thành `MatKhauMoi123!` và không khôi phục — file chạy sau login user này bằng mật khẩu seed nhận 401. Flaky vì sequencer của vitest xếp file theo cache thời lượng, THỨ TỰ ĐỔI giữa các lần chạy | auth-gd2 chụp `passwordHash` trước, khôi phục cuối test + assert đăng nhập lại được bằng mật khẩu seed. Luật rút ra: test MUTATE fixture seed dùng chung thì phải trả lại nguyên trạng |
| **F-22** | **SAI (đã vá) + BUG PROD THẬT** | `gd10` webhook đỏ khi `u6-tenant-isolation` chạy TRƯỚC | Fixture U6 ghi webhook endpoint bằng Prisma với secret PLAINTEXT `'u6-secret'` (bất biến §4.11: cột này là BẢN MÃ AES-GCM) + delivery PENDING nằm lại DB. `deliverDue()` quét XUYÊN TENANT nuốt phải → `decrypt()` ném → **giết cả vòng gửi**. Hai lỗi lồng nhau: (a) fixture ghi tắt phá bất biến dữ liệu; (b) **production bug**: MỘT dòng độc làm chết hàng đợi webhook của MỌI tenant | (a) fixture mã hoá secret bằng chính `CryptoService`; (b) `deliverDue` bọc try/catch từng dòng — dòng hỏng dữ liệu đánh FAILED (không retry) + log, vòng đi tiếp |

**Tái hiện tất định** (trước khi vá): `--sequence.shuffle.files --sequence.seed=N`
— cặp A seed 1/2 đỏ, seed 3 xanh; cặp B seed 3 đỏ, seed 1 xanh. Sau vá: cả hai
thứ tự từng đỏ đều xanh. **Bằng chứng cuối: 100 lượt liên tiếp, mỗi lượt shuffle
seed khác nhau (quét mọi thứ tự), 4 file liên quan — kết quả dán dưới khi vòng
chạy xong.**

## F-23 — vòng 100 lượt bắt thêm MỘT GỐC THỨ BA (lượt 17/100 của vòng đầu)

| # | Mức | Phát hiện | Gốc | Vá |
|---|---|---|---|---|
| **F-23** | **SAI (đã vá) + BUG HẠ TẦNG THẬT** | gd10 đỏ dạng MỚI: rotation nhận 0 delivery (`second=0`) + retry đếm 2 thay vì 1 (`failCount=2`) — không liên quan hai gốc trước | **Trộn hai đồng hồ trong hàng đợi outbox.** Prisma đánh giá `@default(now())` PHÍA CLIENT → `available_at` mang giờ APP; `claimBatch` lại so `available_at <= now()` của DB. Đo thật tại chỗ: Docker Desktop VM chậm hơn host **~1,4s** lúc máy tải nặng → event vừa insert "tàng hình" đúng bằng độ lệch → `runOnce` claim 0 (không fan-out → `second=0`); vài giây sau test kế claim lại → fan-out KÉP sang cả endpoint của test trước → `failCount=2`. Prod: không mất event (at-least-once) nhưng worker bị DELAY vô hình đúng bằng drift giữa app-server và DB-server | Luật **"đồng hồ nào ĐẶT giá trị thì đồng hồ đó SO SÁNH"**: claimBatch so `available_at` với `new Date()` phía app; backoff của markFailed cũng đặt phía app. (webhook_deliveries đã nhất quán app-clock từ đầu — vì thế tầng đó không lộ.) `requeueStale` giữ nguyên: `locked_at` do DB đặt, so với DB now() — nhất quán sẵn |

Ba gốc, ba tầng khác nhau (fixture seed dùng chung · bất biến dữ liệu khi ghi tắt ·
đồng hồ hỗn hợp trong queue) — cùng lộ ra chỉ vì chạy đủ nhiều lượt với thứ tự
xáo trộn. Vòng 100 lượt khởi động LẠI TỪ ĐẦU trên code cuối; kết quả dán dưới.

## F-24 — gốc #4: cùng đồng hồ chưa đủ, phải cùng ĐỘ PHÂN GIẢI (autopsy nguyên văn)

Vòng săn sau F-23 vẫn đỏ (lượt 17→50→12→6 của bốn vòng — tần suất tăng khi máy
nhanh vì insert/claim càng dễ rơi cùng mili giây). Instrumentation từng bước +
autopsy tại chỗ cho bằng chứng kết luận:

```
runOnce order2 claim 0.
app_now      = 2026-08-12T06:08:57.038Z
rows = [{ status: "PENDING", attempts: 0, locked_by: null,
          available_at: "2026-08-12T06:08:57.038Z",   ← CÙNG ms với app_now
          db_now:       "2026-08-12T06:08:57.054Z" }]
```

| # | Mức | Gốc | Vá |
|---|---|---|---|
| **F-24** | **SAI (đã vá) + BUG HẠ TẦNG THẬT** | `@default(now())` của Prisma do query engine RUST đánh giá với MICRO giây; claim so bằng JS Date (MILI giây). Insert và claim cùng một ms → `available_at .038xxx > now .038000` → event tàng hình DƯỚI 1ms. JSON dump in `.038Z` trông "bằng nhau" — đuôi micro giây chỉ hiện khi hiểu ai sinh giá trị | `enqueueInTx` đặt `availableAt: new Date()` TƯỜNG MINH — không để engine sinh default. Luật ADR-0005 mở rộng: cùng đồng hồ VÀ cùng độ phân giải |

Bài học phương pháp: gốc #4 KHÔNG thể đoán từ đọc code (ba vòng suy luận đều
trượt) — nó chỉ chịu thua khi test tự mang autopsy: assert từng bước trung gian
+ dump trạng thái hàng đợi ngay tại chỗ hụt. "Nest Logger bị nuốt trong test"
là điều kiện khiến mọi triệu chứng trước đó đều câm.

## R1 — BẰNG CHỨNG CUỐI: 100 lượt liên tiếp xanh

Vòng chính thức trên code cuối (sau F-21→F-24), mỗi lượt = 4 file liên quan
với `--sequence.shuffle.files --sequence.seed=<i>` (i = 1..100 — quét mọi
thứ tự file). Output thật (đầu/cuối, log đầy đủ 102 dòng):

```
luot 1: XANH (seed 1)
luot 2: XANH (seed 2)
luot 3: XANH (seed 3)
...
luot 21: VOID-INFRA (Reaper testcontainers chet truoc khi chay test nao - Ryuk disabled tu day)
luot 21: XANH (seed 21)
...
luot 99: XANH (seed 99)
luot 100: XANH (seed 100)
KET QUA: 100/100 xanh (lượt 21 lần đầu VOID vì hạ tầng reaper, đã chạy lại)
```

- Lượt 21 lần đầu VOID vì HẠ TẦNG vòng lặp (Reaper của Testcontainers chết
  sau 20 lần churn container — chế độ CI thường không gặp; global setup chết
  TRƯỚC khi một test nào chạy). Không đổi code/test — tắt Ryuk cho harness
  (teardown đã tự stop container), chạy lại seed 21: XANH. Khai báo minh bạch
  để không ai đọc nhầm thành "101 lượt đều sạch".
- Bốn vòng tổng cộng để tới đây: vòng 1 bắt F-21/F-22 (lượt 17), vòng 2 bắt
  F-23 (lượt 50... thực tế thứ tự phát hiện: F-21/22 tất định bằng seed,
  F-23 lượt 17, F-24 lượt 50→12→6), mỗi lần vá gốc là vòng khởi động LẠI TỪ ĐẦU.

## F-25 — CI bắt tương tác R2 × test #37 (job "Test" đỏ ở CI #76, xanh ở #74/#75)

| # | Mức | Gốc | Vá |
|---|---|---|---|
| **F-25** | **SAI (đã vá)** | R2 thêm cột "Màn hình" vào bảng cắt gọt §11 nhưng dòng tạm test #37 chèn vẫn 4 cột → check #12 luật 3 đỏ → khẳng định #3b sập. Lỗi quy trình lặp lại đúng bài F-20: sau R2 đã chạy check #12 độc lập nhưng KHÔNG chạy lại test #37 — hai lưới giao nhau mà chỉ kiểm một | Dòng chèn 5 cột (`API-only — module tạm của test #37`) + checklist generator nhắc cột Màn hình. Test #37 lại 8/8. Bằng chứng quy hồi: job Test xanh #74/#75 (chưa có R2), chỉ đỏ #76 |

Ghi chú tên job: YAML nuốt `#37 — generator...` thành comment → job hiện tên cụt "Test".
Job BE đỏ từ #74 (TRƯỚC R1) — local không tái hiện ở mọi thứ tự (244/244 ×2 lần,
kể cả xoá cache vitest) → chờ log Failed Tests từ người có quyền admin repo (F-26 nếu có).
