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
| 7 | Audit timeline (GET /audit-logs, desc = actor trong cây); Files presigned S3/MinIO (@aws-sdk, đã hỏi-chốt) + attachments kế thừa quyền entity; Notifications đọc + preferences (membership); Business calendar + `addWorkingDays` + seed lễ VN (data, đã hỏi-chốt); export QUA QUEUE → S3 → notification; cron partition movements+audit_logs | Claude | 🔍 chờ review | **gd7 12 test + calendar unit 11 ✅** (suite 171/171) | MinIO vào Testcontainers; audit CRUD ghi TƯỜNG MINH trong service — ĐÃ CHỐT bằng ADR-0004 (không dùng extension tự động); lễ âm 2027-2030 là data xấp xỉ, nghiệp vụ đối chiếu |
| 8a | Global search (§5C.7): GET /search nhóm theo module, quyền động theo nhóm, scope nhúng WHERE, tìm không dấu trên cột *_search, kết quả CHỈ cột định danh | Claude | 🔍 chờ review | **#29 ✅** (search-gd8 5 test, suite 176/176) | recent/favorites làm ở GĐ10 cùng §5C.2 |
| 8b | Action Registry (§5.9 theo docs/action-registry.tsx) + overlay manager (confirm promise: typeToConfirm/reason/options + bulk result dialog) + Cmd+K (cmdk + global search debounce) + nền FE: tokens §5.7 (--z-* duy nhất), next-intl vi/en (cookie), ui primitives shadcn, trang /orders demo 4 nơi; BE thêm POST /orders/:id/cancel (máy trạng thái có sẵn) | Claude | 🔍 chờ review | web build + tsc + lint xanh; orders+matrix 54/54 | Deps FE theo uỷ quyền 2026-08-07 (bộ đầy đủ); orders list Swagger chưa khai ApiOkResponse → orval sinh void, FE tự khai OrderRow (nợ BE); DataTable §5.5 + Form §5.8 ở lát FE tổng thể |
| 9 | `pnpm gen:module <tên>` (plop): sinh BE (module/controller/repository theo khuôn orders — tenant qua extension, locale JSONB+search, audit, @RequirePermission) + FE (schema/actions/page DataTable) + test skeleton 2 tenant + CHECKLIST 8 bước (generator không tự sửa registry — check kiến trúc đỏ nếu quên); System operations §5C.8: /admin/ops health(DB/Redis/S3/migration/build/backup)+queues+retry-failed+announcements(target tenant)+maintenance+clear cache tenant, /announcements/active | Claude | 🔍 chờ review | **#30 ✅ pg_dump→restore DB sạch→smoke THẬT** (ops 5 + backup 1 test) | pg_dump/pg_restore chạy qua container postgres:16-alpine dùng-1-lần (không cần client local); đã thử `gen:module invoice` end-to-end rồi xoá |
| FE | DataTable §5.5 + Form §5.8 [REF] customers + layout (dashboard) — xem PR #4 | Claude | 🔍 chờ review | **154 vitest + 9 e2e ✅** | Nợ test của PR #4 đã trả ở B4 (bắt 2 bug tiền thật); bàn phím ở B3; DataTable đầy đủ + preset ở GĐ A |

| 10 | Hạn mức duyệt §5C.12 (bảng riêng #62, resolve cụ-thể-thắng-chung→priority→max, FAIL-CLOSED vào orders.approve, seed MANAGER/ADMIN unlimited, endpoint /check "ai đủ thẩm quyền"); Webhook §5C.5 (secret AES-256-GCM §4.11 + CryptoService mới, HMAC t/v1/v1prev — rotation 2 secret song song, fan-out QUA OUTBOX dedup UNIQUE, retry backoff + tự tắt sau 10 lỗi + replay); recent/favorites §5C.2 theo membership | Claude | 🔍 chờ review | **gd10 6 test ✅** | CẮT theo nhãn spec + uỷ quyền 2026-08-08: approval_flows/steps/requests (workflow engine — làm khi có yêu cầu thật), SLA engine (§5B.4 cảnh báo), report scheduling §5C.11, comments §5C.6, grid entry, SSO/2FA (§11: tắt ENV, cần IdP thật); đa tiền tệ hạn mức fail-closed khi khác currency (chưa có bảng tỷ giá — B3 OPT) |

| ADR-0004 | Chốt audit TƯỜNG MINH (thu hẹp §12 #36): `writeInTx` vào CÙNG transaction nghiệp vụ, action ngữ nghĩa SUBMIT/APPROVE từ registry đóng, CI `check-audit-coverage` kiểm cả coverage lẫn tên action; đồng bộ §4.9 + CLAUDE.md §3 + cookbook §2 | Claude | 🔍 chờ review | **#31 ✅** (audit-atomicity 4 test, có negative control) | Review chỉ ra 3 khuyết tật thật: 3 module quên audit (đã vá PR #1), audit ngoài tx, action ghi UPDATE làm timeline vô nghĩa |

| B1 | Hạ tầng test FE 5 tầng: Vitest+RTL (jsdom) · MSW chặn tầng network · Storybook + play function chạy lại bằng composeStories · Playwright trên BUILD production; 3 job CI song song (ci · web-test · web-e2e); tách tsconfig app/test | Claude | 🔍 chờ review | **11 vitest + 2 e2e ✅** | Node local nâng 20→22 cho khớp engines/CI; jsdom/vite/plugin-react phải ghim đúng cặp; composeStories dùng renderer @storybook/react (bug đường dẫn Windows của nextjs-vite) |

| B2 | Check thứ SÁU `check-fe-test-coverage`: chạm `apps/web/src` mà không kèm `.spec`/`.stories` → CI đỏ; miễn trừ khai tường minh kèm lý do | Claude | 🔍 chờ review | negative control ✅ | Sinh ra vì §7.2 vừa bị lách đúng một lần ở PR #4 |

| B3 | `keyboardProfile` theo PATTERN (`resolveKeyAction` hàm thuần + `useFormKeyboard` bind DOM): Enter đi ô kế / thêm dòng ở ô cuối, Ctrl+Enter submit, Esc huỷ ô | Claude | 🔍 chờ review | **15 test ✅** | Test đi CÙNG PR, không hẹn sau |

| B4 | Trả nợ test PR #4: MoneyInput, AsyncSelect, UploadDropzone, order-form | Claude | 🔍 chờ review | **PR #9, CI 3/3 ✅** | Bắt HAI bug tiền thật: MoneyInput hiện giá trị thô khi focus làm `100000,50` thành `10000050`; `form.watch` trả cùng reference nên dòng tổng đứng yên |

| B5 | `state-tones` chuyển sang `apps/web/src/design-system` + StatusBadge | Claude | 🔍 chờ review | **PR #10, CI 3/3 ✅** | Màu trạng thái là quyết định trình bày, BE không cần biết |

| B6 | `nextActionCode` ngữ nghĩa ở BE + FE quyết nhãn và đích đến | Claude | 🔍 chờ review | **PR #11, CI 3/3 ✅** | Lỗi cụt để người dùng bế tắc; có lối đi tiếp thì họ tự xử lý |

| B7 | Saved views UI (áp view = `router.replace` URL) | Claude | ⏳ chưa mở PR | **6 test ✅** | Nhánh `feat/saved-views-b7` đã push; `gh` không còn trên máy nên chưa mở được PR |

| B8 | CD pipeline có rollback (guard → build image → migrate → rolling → health → rollback) + Sentry redact hai phía + `/health` kiểm THẬT db/redis (503 khi hỏng) | Claude | 🔄 **CHƯA XONG** | health 2 + redact 4 + FE sentry 5 ✅ | **Đường deploy chưa đi trọn lần nào.** Cùng loại với check #6: cơ chế tồn tại mà chưa chạy. Đã chạy tới: `guard` ✅ → `build image` ✅ → `migrate` ❌ (thiếu `DATABASE_URL`, ĐÚNG thiết kế "thiếu secret thì dừng") → `rolling deploy` ⏭️ chưa chạy lần nào. `deploy/*.sh` gọi `DEPLOY_HOOK`, chưa nối hạ tầng nào. Chỉ coi là xong khi có một môi trường thật deploy được và health check trả 200 |

| GĐ A | Hệ preset FE (`docs/fe-preset-system.md`): ba tầng token · `registry.ts` 1 preset · ba cấp cấu hình + `resolveProjectUI` · `ShellProps` + `SidebarShell` bỏ `useQuery` · check thứ BẢY `check-token-layers` · DataTable resize/ghim/đổi thứ tự cột · DetailLayout · FilterBar · GridEntry · Import/Export UI · trang preview · **6 ảnh baseline** · **a11y 2 tổ hợp** | Claude | 🔍 chờ review | **154 vitest + 9 e2e ✅**, 7/7 check | Bộ a11y bắt BỐN lỗi tương phản thật, gồm một lỗi production: dark mode nút primary chỉ 2,54:1. Ba chỗ lệch spec có chủ đích, ghi ở §14 của fe-preset-system.md. Ảnh baseline commit cả bản `-linux` (khớp CI) lẫn `-win32` (dev máy Windows) |

| **Phép thử §1.3** | Render cùng một màn bằng 4 preset, người ngoài phải phân biệt được | — | ⏳ chưa làm được | — | Cần ≥2 preset. Điều kiện đóng GĐ B, không phải GĐ A |

| TC-1 | **test-catalog §3C HYBRID** — 13 ca cách ly cho `settings`/`feature_flags` + sửa lỗ ghi chéo tenant ở `tenancy.extension.ts` | Claude | 🔍 chờ review | **13 ca ✅** (6 ca đỏ lúc viết) | Nhánh HYBRID chỉ áp phạm vi cho `findMany`-loại op → A sửa/xoá/đọc được setting của B chỉ cần biết id, và job quên `runWith` âm thầm tạo dòng GLOBAL. Không ràng buộc DB nào cứu được (§3C/H12) |

| TC-2 | Check thứ TÁM `check-raw-sql` — AR3 (cấm `*RawUnsafe`) · AR4 (Kysely không ghi) · **AR14** (không SQL thô ghi vào bảng HYBRID) | Claude | 🔍 chờ review | negative control ✅ | Danh sách bảng HYBRID đọc từ `TENANCY_POLICY`, không chép tay |

| TC-3 | **test-catalog tầng 1** — route inventory (ModulesContainer, không `_router.stack`) + U1–U5 trên 110 route có bảo vệ | Claude | 🔍 chờ review | **8 ca ✅** | Bắt lỗi thật: §3.1c ghi "X-Request-Id LUÔN trả lại" nhưng **không ai đặt header** — 110 route thiếu. Đã sửa bằng middleware trong `configureApp`. **NỢ: U6** (id tenant khác → 404) cần fixture factory theo catalog §2.3 |

| ⚠️ Nợ quy trình | **PR #12 vi phạm working-agreement §6**: 115 file · +7.760/−529 · 16 commit — gấp ~19 lần ngưỡng 400 dòng, và chứa `tenancy.extension.ts` là file nguy hiểm nhất repo | Claude | ghi nhận, KHÔNG chặn | — | Tách ngược lại tốn hơn được. Đã review riêng 72 dòng phần tenancy. Để lần này không thành bình thường: thêm **check #9 `check-pr-size`** cảnh báo (không chặn) khi phần cần review vượt 400/800 dòng |

| ⚠️ Check chạy RỖNG | `check-fe-test-coverage` (check #6, dựng ở B2) **tự bỏ qua ở MỌI PR** kể từ khi ra đời | Claude | 🔍 chờ review | log CI làm bằng | `actions/checkout@v4` mặc định clone NÔNG → không có `origin/main` → check tự thoát 0 với dòng "CI luôn có" (sai). Sửa: `fetch-depth: 0` + fetch nhánh gốc + truyền `BASE_REF`; và check nay **ĐỎ** thay vì bỏ qua khi thiếu mốc so sánh trong CI. Bài học: check tự tắt ở đúng nơi cần chạy còn tệ hơn không có check |

| ⚠️ Nhiễu đã sửa | **Bộ a11y đỏ ngẫu nhiên ~1/4 lượt** ở dark mode, mỗi lần một màn khác nhau (`detail`, `states`…), luôn là `color-contrast @ .bg-primary` | Claude | 🔍 chờ review | **16/16 lượt xanh** sau khi sửa | Đua trạng thái: `[data-screen]` có mặt ở ms=0 với `data-theme="light"`, `useLayoutEffect` chỉ lật sang `dark` SAU hydrate. axe quét đúng cửa sổ đó đọc màu CHỮ theme này với màu NỀN theme kia → 2,54:1. Sửa gốc: script inline đặt theme lúc phân tích HTML; thêm lớp phòng thủ: test khẳng định `html[data-theme]` trước khi quét |

| 🐛 NỢ mới (PR riêng) | **Dark mode KHÔNG giảm chroma như §3.3 mô tả** — `--brand-c` vẫn là 0,15 thay vì 0,13 | Claude | ⏳ chưa làm | đo được: `brandC=0.15` khi `theme=dark` | `uiToCssVars` ghi `--brand-c` bằng inline style trên `<html>`, mà inline THẮNG rule `[data-theme='dark']` trong stylesheet. Cách sửa: đổi thành `--brand-c-preset` rồi `--brand-c: var(--brand-c-preset)` ở light và `calc(... - 0.02)` ở dark. **Tách PR riêng** vì đổi màu → phải chụp lại toàn bộ ảnh baseline |

| 🔴 CD chạy thật lần đầu → **4 lỗi** | Merge lên `main` kích hoạt `cd.yml` lần đầu tiên trong đời dự án. `apps/api/Dockerfile` viết ở B8 chưa từng build được, và container chưa từng khởi động được | Claude | 🔍 chờ review | image build xanh + 3 smoke test | Chi tiết ở bảng dưới |
| ↳ 1 | Tên image mang chữ hoa (`ghcr.io/khanhviet529/NEXUS/api`) → buildx từ chối | | đã sửa | | `${GITHUB_REPOSITORY,,}` |
| ↳ 2 | **Repo thiếu `.dockerignore`** → `COPY . .` bê `node_modules` của host đè lên phần đã cài; symlink pnpm trỏ ổ đĩa Windows nên gãy trong Linux → `Cannot find module .../tsc`. Kèm hai hệ quả: `.env` và `.git` (toàn bộ lịch sử, kể cả secret đã xoá) lọt vào image | | đã sửa | | thêm `.dockerignore` có ghi lý do |
| ↳ 3 | **Thiếu `apps/api/tsconfig.build.json`** → `nest build` dùng tsconfig.json vốn include `test`/`tools`, rootDir tụt lên `apps/api`, output thành `dist/src/main.js` trong khi `CMD` và `start:worker` đều trỏ `dist/main.js` | | đã sửa | | chữa cùng lúc: đường dẫn CMD, `start:worker`, và mã test lọt vào image |
| ↳ 4 | Runtime stage **không chép `apps/api/node_modules`** → `Cannot find module 'reflect-metadata'`, và không có `prisma` CLI nên bước migration của CD bất khả thi | | đã sửa | | Nest nay khởi động tới bước kiểm biến môi trường; `prisma --version` chạy được trong image |

| 🐛 NỢ mới (PR riêng) | **Image API nặng 1,17 GB** — `/app/node_modules` chiếm 712 MB vì chép cả store `.pnpm` gồm devDependency | Claude | ⏳ chưa làm | đo bằng `du -sh` trong image | Cần `pnpm deploy --prod` hoặc bước prune ở tầng runtime. Không gộp vào PR sửa lỗi để giữ PR nhỏ |

| 📏 Nợ quy trình — số đo THẬT | PR #12: **115 file · +7.760/−529 · 16 commit**, gấp ~19 lần ngưỡng §6 | Claude | ghi nhận | đo bằng GitHub API + `git diff --numstat` | **Nguyên nhân**: `gh` không có trên máy nên không mở được PR riêng cho từng hạng mục B7/B8/GĐ A; tất cả dồn vào một nhánh tích hợp. Đã gỡ bằng token API (PR #13 trở đi mở được riêng lẻ). **Đính chính một số liệu**: `docs/` trong PR #12 chỉ chiếm **196 dòng**, không phải 2.876 — phần phình là mã nguồn + test, nên "tách tài liệu ra PR riêng" sẽ KHÔNG giúp gì đáng kể. Cách tách đúng ở đây là theo hạng mục (B7 · B8 · GĐ A · test-catalog), tức theo Ý NGHĨA |

| ✅ N1.2 | Tổng quát hoá phát hiện check #6: `run-all.mjs` in `N/N check ĐÃ CHẠY`; hợp đồng mã thoát 0/2/khác; ở CI thì "không chạy được" = ĐỎ | Claude | 🔍 chờ review | 4 negative control | Rà cả 8 check: không còn cái nào thoát 0 im lặng. Thêm lưới thứ hai — file `check-*.mjs` có trên đĩa mà quên đăng ký trong `run-all` → ĐỎ (đó là dạng "không chạy" triệt để nhất) |

| ✅ N1.3 | `check-pr-size` vượt ngưỡng → **ĐỎ**, trừ khi mô tả PR có dòng `PR-SIZE-OK: <lý do ≥30 ký tự>` | Claude | 🔍 chờ review | 6 nhánh đều kiểm | Cảnh báo không ai phải trả lời sẽ bị lờ sau ba lần. Vẫn không chặn cứng theo con số: chặn cứng đẻ ra thói quen tách PR theo SỐ DÒNG thay vì theo Ý NGHĨA |

## Việc chặn (blocker)

Không còn blocker hạ tầng. Hai bug thật đã bắt-và-sửa nhờ test GĐ1 (ghi ở onboarding §5):
`runWith` phải await bên trong cls.run (PrismaPromise lazy), và soft-delete extension
phải mắc TRƯỚC tenancy extension (sentinel deletedAt bị AND-wrap đè).
