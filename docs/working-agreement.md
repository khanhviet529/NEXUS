# THOẢ THUẬN LÀM VIỆC
## Đội 2–3 người · Dự án boilerplate Next + Nest

| | |
|---|---|
| **Phạm vi** | Cách làm việc, phân công, định nghĩa hoàn thành, quy tắc bảo vệ kiến trúc |
| **Đi kèm** | `boilerplate-spec.md` v3.1 (FROZEN) — tài liệu kiến trúc |
| **Nguyên tắc gốc** | Luật nào CI kiểm được thì **viết cái check**, đừng viết thành luật |

---

# 0. Bốn nguyên tắc

1. **Tự thực thi hơn tự giác.** Trước khi viết một quy ước, hỏi: CI kiểm được không? Nếu được thì viết check thay vì viết luật.
2. **Quy trình vừa đủ cho 3 người.** Mọi thứ dưới đây phải mất **dưới 15 phút/ngày** tổng cộng. Vượt quá là dấu hiệu quy trình đang phục vụ chính nó.
3. **Không có việc dở dang qua đêm mà không ai biết.** Dở dang thì được, giấu thì không.
4. **Code và tài liệu không bao giờ mâu thuẫn quá một PR.**

---

# 1. Phân công

## 1.1 Giai đoạn nền (GĐ1–3): một người sở hữu

Multi-tenant extension, phân quyền, audit extension, base entity là **một thiết kế gắn kết**. Hai người sửa song song sẽ phá vỡ tính nhất quán của nó.

| Vai | Nội dung | Điều kiện |
|---|---|---|
| **Chủ nền tảng** (1 người) | GĐ1, 2, 3, 3b theo §10 | Người kinh nghiệm nhất. Không bị cắt ngang bởi việc khác |
| **Nhánh song song A** | Design system, `components/ui` + `common`, Storybook, §5.7–5.10 | **Không chạm** `apps/api` |
| **Nhánh song song B** | Docker/CI, `packages/vn`, factory + seed, test helper (`expectQueryCount`, fixture 2 tenant) | Chỉ chạm `tools/`, `packages/`, `docker-compose` |

Ba nhánh này **không có file chung**, nên gần như không xung đột merge.

## 1.2 Từ GĐ4: chia theo lát dọc

Mỗi người ôm trọn một module: **contract → migration → service → endpoint → FE → test**.

**Không chia "bạn backend, tôi frontend".** Chia ngang tạo điểm nghẽn bàn giao vĩnh viễn, và không ai chịu trách nhiệm khi tính năng chạy sai.

## 1.3 Bảng sở hữu vùng code

Với 3 người, thứ cần thiết không phải bảng task mà là **bảng chống giẫm chân**. Cập nhật đầu mỗi tuần, để trong `docs/ownership.md`:

```markdown
## Tuần 2026-W33

| Vùng | Người | Trạng thái | Ghi chú |
|---|---|---|---|
| apps/api/src/common/query/ | An | đang làm | FilterParser, đừng đụng |
| apps/api/src/modules/auth/ | An | xong GĐ2 | mở khoá |
| apps/web/src/components/ | Bình | đang làm | DataTable |
| packages/vn/ | Chi | xong | mở khoá |
| apps/api/src/modules/orders/ | — | chưa bắt đầu | chờ GĐ4 |
```

**Luật:** muốn sửa vùng người khác đang làm → nhắn trước, không mở PR thẳng.

---

# 2. Định nghĩa hoàn thành (Definition of Done)

Một hạng mục **chỉ được coi là xong** khi đủ **cả năm**:

- [ ] Code chạy, đã tự kiểm thử tay
- [ ] **Test tương ứng trong §8.2 xanh trên CI** (nếu hạng mục có test bắt buộc)
- [ ] `pnpm lint && pnpm typecheck` xanh
- [ ] Tài liệu đã cập nhật nếu có thay đổi so với spec (xem §5 dưới đây)
- [ ] PR đã merge vào `main`

**"Xong" không phải là "tôi đã push".** Định nghĩa này loại bỏ hoàn toàn tình trạng dở dang không ai biết.

---

# 3. Theo dõi tiến độ — dùng lại thứ đã có

**Không phát minh danh sách task mới.** Tài liệu kiến trúc đã có sẵn ba công cụ tốt hơn:

| Nguồn | Dùng làm | Cách dùng |
|---|---|---|
| **§10** — 12 giai đoạn | Milestone | GitHub Projects, mỗi GĐ một milestone |
| **§8.2** — 40 test bắt buộc | **Issue** | Mỗi test = 1 issue. Tiêu chí xong không thể cãi |
| **§12** — 57 quyết định | Tham chiếu | Khi tranh luận, mở ra xem đã chốt gì |

## 3.1 Bảng trạng thái tối thiểu

Nếu không dùng GitHub Projects, một file `docs/progress.md` là đủ cho 3 người:

```markdown
| GĐ | Hạng mục | Người | Trạng thái | Test §8.2 | Ngày |
|----|----------|-------|-----------|-----------|------|
| 1  | CLS + tenancy extension | An | ✅ xong | #1,#3a,#3c ✅ | 12/08 |
| 1  | SerializeInterceptor | An | 🔄 đang làm | #10 ⬜ | |
| 1  | Codegen orval | An | ⬜ chưa | — | |
| —  | Design tokens | Bình | ✅ xong | — | 11/08 |
```

Bốn trạng thái, không hơn: `⬜ chưa` · `🔄 đang làm` · `🔍 chờ review` · `✅ xong`

**Không dùng story point, không ước lượng giờ.** Với 3 người, chi phí ước lượng lớn hơn giá trị.

---

# 4. Quy tắc bảo vệ kiến trúc

Đây là nhóm quan trọng nhất, vì tài liệu kiến trúc chỉ có giá trị nếu code không trôi khỏi nó.

## 4.1 Bảy check tự động — làm ở GĐ1, trước khi viết module đầu tiên

| # | Luật | Cách thực thi | Ưu tiên |
|---|---|---|---|
| 1 | Không gọi Prisma client ngoài repository | ESLint `no-restricted-imports` theo thư mục | Cao |
| 2 | Model mới phải phân loại tenancy | `assertExhaustiveTenancyPolicy` (§4.4b) | Cao |
| 3 | Bảng mới phải có dòng trong ma trận §6.5 | Script so `schema.prisma` ↔ ma trận, CI đỏ nếu lệch | Cao |
| 4 | Model có `deleted_at` phải nằm trong `SOFT_DELETE_MODELS` | Kiểm tra vét cạn, giống #2 | Cao |
| 5 | Endpoint mới phải có `@RequirePermission` | Test quét metadata toàn bộ route | Cao |
| 6 | Endpoint list phải có test đếm query | Test quét route, thiếu → đỏ | Trung bình |
| 7 | Không `any` | `@typescript-eslint/no-explicit-any: error` | Trung bình |

Bảy check này thay thế được khoảng hai chục dòng "quy ước" mà không ai đọc.

## 4.2 Luật không tự động hoá được — phải nhớ

Danh sách này **cố ý ngắn**. Danh sách dài là danh sách không ai đọc.

1. **Không sửa `packages/api-client`** — nó được sinh tự động
2. **Không thêm `z-index` rời rạc** — chỉ dùng token (§5.7)
3. **Nested write phức tạp phải tách thành thao tác repository tường minh** (§6.4)
4. **Thêm bảng con phải có composite FK `(tenant_id, parent_id)`** (§6.4)
5. **Không sửa file người khác đang sở hữu** (§1.3) mà chưa nhắn

Dán 5 dòng này vào template PR để mỗi lần review đều nhìn thấy.

---

# 5. Giao thức khi tài liệu sai

Spec **sẽ** sai ở vài chỗ khi va vào thực tế — điều đó bình thường và đã được lường trước.

```
Phát hiện spec sai hoặc thiếu khi đang code
  │
  ├─ Sửa nhỏ, không đổi quyết định (thiếu chi tiết, sai chính tả kỹ thuật)
  │     → Sửa spec NGAY TRONG PR đó. Không cần bàn.
  │
  └─ Đổi một quyết định trong §12
        → DỪNG. Nhắn cả đội.
        → Viết ADR (mẫu ở phụ lục), tối đa 1 trang.
        → Cả đội đồng ý → cập nhật §12 → mới code tiếp.
```

**Luật tuyệt đối: code và spec không được mâu thuẫn quá một PR.** Merge code khác spec mà không sửa spec là tạo ra nợ mà ba tháng sau không ai gỡ được.

---

# 6. Git và PR

Với 3 người, quy trình nặng là phản tác dụng.

| Hạng mục | Quy định |
|---|---|
| Nhánh | Trunk-based. Nhánh ngắn, **sống tối đa 2 ngày** |
| Đặt tên | `feat/order-approval`, `fix/tenant-leak`, `chore/ci` |
| Commit | Conventional Commits (đã có commitlint) |
| PR | **Bắt buộc**, nhưng chỉ cần **1 approve** (3 người mà đòi 2 approve là tự chặn mình) |
| Kích thước PR | Mục tiêu **dưới 400 dòng thay đổi**. To hơn thì tách |
| Review | Async, trong ngày. Không đặt SLA cứng |
| Merge | Squash. `main` luôn xanh |
| Ngoại lệ | PR của **nhánh song song A/B** ở GĐ1–3 có thể tự merge nếu không chạm `apps/api` |

**PR to là kẻ thù lớn nhất của đội nhỏ.** PR 2.000 dòng sẽ được approve mà không ai đọc thật, và đó là lúc kiến trúc bắt đầu trôi.

---

# 7. Nhịp làm việc

## 7.1 Nên làm

| Nhịp | Thời lượng | Nội dung |
|---|---|---|
| **Đồng bộ hằng ngày** | 10 phút | Chỉ 2 câu: *hôm nay tôi động vào vùng nào* và *tôi đang kẹt ở đâu*. Không báo cáo tiến độ |
| **Chốt tuần** | 30 phút | Cập nhật `ownership.md` + `progress.md`. Rà lại có ai dở dang quá lâu không |
| **Đóng giai đoạn** | 30 phút | Xác nhận đủ test §8.2 của GĐ đó. Ghi lại bài học vào ADR nếu có |

Mục đích chính của đồng bộ hằng ngày với 3 người **không phải** báo cáo tiến độ, mà là bắt được câu *"tôi sắp sửa tenant extension"* trước khi hai người cùng làm.

## 7.2 Không nên làm

Với 3 người, những thứ sau tốn nhiều hơn được:

- Sprint planning, story point, velocity
- Daily standup kiểu báo cáo tuần tự từng người
- Jira với workflow nhiều trạng thái
- Retro hằng tuần (mỗi cuối giai đoạn là đủ)
- Yêu cầu 2 approve mỗi PR
- Tài liệu thiết kế riêng cho từng tính năng — spec đã có rồi

---

# 8. Ràng buộc thời gian và cắt phạm vi

**Rủi ro lớn nhất của dự án này không phải làm sai, mà là làm mãi không xong.** Tài liệu kiến trúc hiện tốt hơn năng lực thi công ngắn hạn của 3 người.

## 8.1 Đặt hạn cứng cho phần nền

```
GĐ1–3b:  đặt hạn N tuần (khuyến nghị 3–4 tuần với 1 người toàn thời gian)
         → Quá hạn 25% mà chưa xong → HỌP CẮT PHẠM VI, không gia hạn
```

## 8.2 Thứ tự cắt khi cần

Cắt bằng cách **bỏ hẳn một hạng mục**, không phải làm dở dang tất cả.

| Thứ tự cắt | Hạng mục | Hệ quả |
|---|---|---|
| 1 | `tenant_memberships` → user thuộc đúng 1 tenant | Mất kịch bản kế toán dịch vụ. Bổ sung sau tốn vừa |
| 2 | Field-level permission | Chỉ được nếu **chắc chắn** không có dữ liệu nhạy cảm. Bổ sung sau rất đắt |
| 3 | i18n tầng dữ liệu (JSONB) → cột `name` thường | Bổ sung sau tốn vừa |
| 4 | Report framework (§5B.1/A1) | Viết tay báo cáo, chậm hơn nhưng không sai kiến trúc |
| 5 | Module generator | Copy tay module mẫu |
| **Không cắt** | Multi-tenant, movement + dedup, audit, composite FK, partition PK | Đây là nhóm không thể bổ sung sau |

**Nguyên tắc:** thà có boilerplate đơn giản mà hoàn chỉnh, còn hơn boilerplate tham vọng mà dở dang. Dở dang tệ hơn không có, vì người sau không biết phần nào tin được.

---

# 9. Onboarding người mới

Viết `docs/onboarding.md` ngay từ GĐ1, cập nhật mỗi khi có người vấp:

1. Cài đặt: `make setup` → chạy được trong **dưới 30 phút**
2. Đọc theo thứ tự: §1 → §3 → §6.5 → §12 (không đọc cả tài liệu)
3. Việc đầu tiên: sửa một bug nhỏ hoặc thêm một trường vào module mẫu, đi trọn từ migration → API → FE → test
4. Đọc `working-agreement.md` này

Nếu bước 1 mất hơn 30 phút thì đó là bug của repo, không phải của người mới.

---

# 10. Phụ lục

## 10.1 Mẫu ADR (`docs/adr/NNNN-tieu-de.md`)

```markdown
# ADR-0007: Chuyển từ X sang Y

- **Ngày:** 2026-08-20
- **Trạng thái:** Chấp nhận | Thay thế bởi ADR-XXXX
- **Ảnh hưởng tới:** §4.4b, §12 mục 16

## Bối cảnh
Điều gì buộc phải quyết định lúc này?

## Quyết định
Chọn gì. Một đoạn.

## Phương án đã cân nhắc
- A — bỏ vì ...
- B — bỏ vì ...

## Hệ quả
Được gì, mất gì, phải sửa những đâu.
```

**Chỉ viết ADR khi đổi một quyết định trong §12.** Không viết cho mọi lựa chọn kỹ thuật thường ngày.

## 10.2 Mẫu PR

```markdown
## Làm gì
Một câu.

## Liên quan
GĐ __ · Test §8.2 #__ · Issue #__

## Checklist
- [ ] Test §8.2 tương ứng đã xanh
- [ ] lint + typecheck xanh
- [ ] Không gọi Prisma ngoài repository
- [ ] Bảng mới đã thêm dòng vào ma trận §6.5
- [ ] Bảng con đã có composite FK (tenant_id, parent_id)
- [ ] Không có z-index rời rạc
- [ ] Spec đã cập nhật nếu có khác biệt
```

## 10.3 Ba file cần tạo ở GĐ1

| File | Nội dung | Cập nhật khi nào |
|---|---|---|
| `docs/ownership.md` | Bảng sở hữu vùng code (§1.3) | Đầu mỗi tuần |
| `docs/progress.md` | Bảng trạng thái (§3.1) | Khi đổi trạng thái |
| `docs/onboarding.md` | Hướng dẫn người mới (§9) | Khi có người vấp |

---

## Tóm lại — năm điều nếu chỉ nhớ được năm

1. **Luật nào CI kiểm được thì viết cái check**, đừng viết thành luật
2. **GĐ1–3 một người làm**, hai người kia làm nhánh không chạm nền
3. **"Xong" = test §8.2 xanh**, không phải "tôi đã push"
4. **Code và spec không mâu thuẫn quá một PR**
5. **Đặt hạn cứng cho phần nền; quá hạn thì cắt phạm vi, không gia hạn**
