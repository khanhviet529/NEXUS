# ĐẶC TẢ NGHIỆP VỤ — DỰ ÁN THÍ ĐIỂM
## Quản lý đề xuất mua hàng (Purchase Requisition)

| | |
|---|---|
| **Mục đích** | Nghiệp vụ cố định cho GĐ C, để mọi giờ đo được là **ma sát boilerplate**, không phải thời gian nghĩ nghiệp vụ |
| **Phạm vi** | 3 danh mục · 1 chứng từ nhiều dòng · duyệt 2 cấp có hạn mức · 1 báo cáo |
| **Thời gian** | 5 ngày, hạn cứng |
| **Đi kèm** | `pilot-playbook.md` (cách đo) — file này là **cái gì làm**, file kia là **đo thế nào** |

> **Thiết kế này cố ý nhắm vào phần boilerplate CHƯA TỪNG dùng thật** (§8). Pilot chỉ chạm phần đã chứng minh thì không đo được gì.

---

# 1. Nghiệp vụ một đoạn

Nhân viên lập **đề xuất mua hàng** gồm nhiều dòng vật tư. Gửi duyệt. **Trưởng bộ phận** duyệt cấp 1. Nếu tổng tiền **vượt hạn mức** của trưởng bộ phận thì phải qua **Giám đốc** duyệt cấp 2. Duyệt xong thì đề xuất chốt, người lập nhận thông báo. Cuối tháng xem báo cáo chi theo bộ phận.

**Không làm:** đơn đặt hàng, nhận hàng, tồn kho, thanh toán, đánh giá nhà cung cấp.

---

# 2. Mô hình dữ liệu

## 2.1 Danh mục — 3 bảng

### `suppliers` — Nhà cung cấp · `list-drawer`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `code` | text | `UNIQUE (tenant_id, code) WHERE deleted_at IS NULL` |
| `name` | text | Không cần i18n |
| `taxCode` | text null | Validate MST bằng `packages/vn` |
| `contactName`, `phone`, `email` | text null | Validate SĐT bằng `packages/vn` |
| `address` | text null | |
| `bankAccount`, `bankName` | text null | |
| `isActive` | bool | default true |

Base: `BusinessEntityBase`

### `material_categories` — Nhóm vật tư · `list-drawer`

| Cột | Kiểu |
|---|---|
| `code` | text, unique theo tenant |
| `name` | text |
| `parentId` | uuid null — **một cấp cha, KHÔNG dùng cây nhiều tầng** |

Base: `BusinessEntityBase`

> **Cố ý dùng `parentId` phẳng một cấp**, không dùng `tree-manager`. Pattern đó chưa implement (fe-preset-system §6) và pilot không nên chờ nó.

### `materials` — Vật tư · `list-detail`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `code` | text | unique theo tenant |
| `name` | **jsonb** | Đa ngôn ngữ (§3.10) — **thăm dò ma sát #3** |
| `nameViSearch`, `nameEnSearch` | text | Cột chuẩn hoá, repository tự ghi |
| `categoryId` | uuid | FK composite `(tenant_id, categoryId)` |
| `uom` | text | Đơn vị tính: cái, kg, bộ, m² |
| `estimatedPrice` | **decimal chuỗi** | Đơn giá dự kiến |
| `defaultSupplierId` | uuid null | |
| `effectiveFrom` | date | **§5C.10 — thăm dò ma sát #4** |
| `effectiveTo` | date null | null = còn hiệu lực |
| `note` | text null | |

Base: `BusinessEntityBase`

## 2.2 Chứng từ

### `purchase_requisitions` — Đề xuất mua hàng · `list-detail` + `grid-entry`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `code` | text | `PR-{YYYY}-{00001}` — `document_sequences` |
| `title` | text | Tiêu đề ngắn |
| `purpose` | text | Mục đích sử dụng |
| `requestedById` | uuid | membership của người lập |
| `orgUnitId` | uuid | Bộ phận đề xuất — **dùng `org_units` có sẵn** |
| `neededBy` | date | Ngày cần hàng — **§5C.4, thăm dò ma sát #2** |
| `status` | enum | Xem §3 |
| `currentLevel` | smallint | 0 chưa gửi · 1 chờ trưởng BP · 2 chờ giám đốc |
| `totalAmount` | decimal chuỗi | Σ dòng |
| `currency` | text | `VND` |
| `approvedAt`, `approvedById` | | Cấp cuối cùng duyệt |
| `rejectedAt`, `rejectedById`, `rejectReason` | | |
| `version` | int | Từ base — optimistic locking |

Base: `BusinessEntityBase`

### `purchase_requisition_items` — Dòng đề xuất

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `requisitionId` | uuid | **Composite FK** `(tenant_id, requisitionId)` |
| `lineNo` | int | |
| `materialId` | uuid | Composite FK |
| **`materialNameSnapshot`** | text | **Chốt tên lúc lập** (§3.10 luật 2) |
| **`uomSnapshot`** | text | Chốt đơn vị |
| `quantity` | decimal chuỗi | |
| `estimatedPrice` | decimal chuỗi | Mặc định lấy từ `materials`, sửa được |
| `amount` | decimal chuỗi | `quantity × estimatedPrice` |
| `suggestedSupplierId` | uuid null | |
| `note` | text null | |

Base: **`TenantAuditedBase`** — là child của aggregate, **không** `BusinessEntityBase` (§6.2). Không soft delete, dùng `version` của đề xuất, xoá cứng trong transaction.

## 2.3 Cấu hình hạn mức — dùng bảng có sẵn

`approval_authorities` (spec §5C.12), seed hai dòng:

```
document_type='PURCHASE_REQUISITION' · currency='VND'
  role=TRUONG_BO_PHAN   min=0            max=20.000.000     priority=10
  role=GIAM_DOC         min=20.000.001   max=NULL(∞)        priority=10
```

---

# 3. Máy trạng thái

```
                    submit
      DRAFT ──────────────────────► PENDING_MANAGER
        │                                 │
        │ cancel                          │ approveManager
        ▼                                 │
    CANCELLED                    ┌────────┴────────┐
                                 │                 │
                    total ≤ 20M  │                 │  total > 20M
                                 ▼                 ▼
                            APPROVED       PENDING_DIRECTOR
                                                   │
                                    approveDirector│  reject
                                                   ▼
                                            APPROVED / REJECTED
      REJECTED ──── resubmit ────► PENDING_MANAGER
```

| # | Action | Từ | Đến | Permission |
|---|---|---|---|---|
| 1 | `submit` | `DRAFT` | `PENDING_MANAGER` | `requisition:submit` |
| 2 | `approveManager` | `PENDING_MANAGER` | **`APPROVED` nếu total ≤ hạn mức trưởng BP, ngược lại `PENDING_DIRECTOR`** | `requisition:approve` |
| 3 | `approveDirector` | `PENDING_DIRECTOR` | `APPROVED` | `requisition:approve_l2` |
| 4 | `reject` | `PENDING_MANAGER` \| `PENDING_DIRECTOR` | `REJECTED` | `requisition:approve` |
| 5 | `resubmit` | `REJECTED` | `PENDING_MANAGER` | `requisition:submit` |
| 6 | `cancel` | `DRAFT` | `CANCELLED` | `requisition:update` |

## 3.1 Vì sao transition #2 là thăm dò ma sát quan trọng nhất

Đích của nó **phụ thuộc dữ liệu**, không phải bảng tĩnh. Máy trạng thái phải **tra `approval_authorities`** rồi mới biết đi đâu.

`packages/shared/src/state-machines.ts` hiện là bảng `{from, to, action, permission}` **tĩnh**. Nên bạn sẽ phải chọn một trong ba đường, và **ghi lại bạn chọn đường nào cùng thời gian mất**:

| Đường | Chi phí | Có phải sửa boilerplate? |
|---|---|---|
| Cho `to` là hàm `(ctx) => state` | Sửa type của state machine | **Có → cộng M3** |
| Tách thành 2 transition, service tự chọn gọi cái nào | Không sửa boilerplate | Không |
| Thêm trạng thái trung gian `PENDING_ROUTING` | Máy trạng thái phình | Không |

Đây là loại quyết định mà pilot tồn tại để phát hiện. **Đừng sửa boilerplate nếu đường 2 chạy được.**

---

# 4. Quy tắc nghiệp vụ — 12 luật

| # | Luật | Mã lỗi |
|---|---|---|
| R1 | Chỉ sửa được ở `DRAFT` hoặc `REJECTED` | `PR.NOT_EDITABLE` |
| R2 | Chỉ xoá được ở `DRAFT` | `PR.NOT_DELETABLE` |
| R3 | `submit` yêu cầu ≥ 1 dòng và `totalAmount > 0` | `PR.EMPTY_ITEMS` |
| R4 | **Không tự duyệt đề xuất mình lập** | `PR.SELF_APPROVAL` |
| R5 | **Không khớp dòng `approval_authorities` nào → KHÔNG duyệt được** (fail-closed) | `PR.NO_APPROVAL_AUTHORITY` |
| R6 | Duyệt cấp 2 khi tổng vượt hạn mức người duyệt cấp 2 → chặn | `PR.EXCEEDS_LIMIT` |
| R7 | **`neededBy` ≥ hôm nay + 3 NGÀY LÀM VIỆC** (bỏ cuối tuần và lễ VN) | `PR.NEEDED_BY_TOO_SOON` |
| R8 | **Vật tư hết hiệu lực (`effectiveTo < hôm nay`) không thêm được vào đề xuất mới** | `PR.MATERIAL_INACTIVE` |
| R9 | Cùng `materialId` không xuất hiện 2 dòng | `PR.DUPLICATE_MATERIAL` |
| R10 | `quantity > 0`, `estimatedPrice ≥ 0` | `422` |
| R11 | `amount = quantity × estimatedPrice`, **tính ở BE**, FE chỉ hiển thị | — |
| R12 | Duyệt xong → phát outbox event → thông báo người lập | — |

**R11 khác `orders`:** đề xuất **không có VAT, không có chiết khấu** — chưa phải hoá đơn. Nên `calculateMoney` của boilerplate có thể **quá nặng**. Ghi lại: bạn dùng nó, hay tự viết `Σ(qty × price)`? Nếu tự viết thì đó là dấu hiệu bộ tính tiền chưa đủ linh hoạt.

---

# 5. Vai trò & phân quyền

## 5.1 Tạo hai vai trò MỚI qua UI — thăm dò ma sát #5

Boilerplate seed 5 vai trò và tuyên bố vai trò là **dữ liệu cấu hình được** (spec §4.4). Pilot phải kiểm điều đó bằng cách **tạo vai trò mới trên giao diện**, không sửa seed:

```
TRUONG_BO_PHAN   ghép từ permission + scope
GIAM_DOC         ghép từ permission + scope
```

**Nếu phải sửa code để thêm vai trò → đó là vi phạm §4.4 và là phát hiện mức cao.**

## 5.2 Ma trận

| Endpoint | Permission | NHAN_VIEN | TRUONG_BP | GIAM_DOC | VIEWER |
|---|---|:---:|:---:|:---:|:---:|
| `GET /requisitions` | `requisition:read` | `own` | `desc` | `all` | `all` |
| `POST /requisitions` | `requisition:create` | `own` | `desc` | ❌ | ❌ |
| `PATCH /requisitions/:id` | `requisition:update` | `own` | `desc` | ❌ | ❌ |
| `DELETE /requisitions/:id` | `requisition:delete` | `own` | `desc` | ❌ | ❌ |
| `POST /:id/submit` | `requisition:submit` | `own` | `desc` | ❌ | ❌ |
| `POST /:id/approve-manager` | `requisition:approve` | ❌ | `desc` | `all` | ❌ |
| `POST /:id/approve-director` | `requisition:approve_l2` | ❌ | ❌ | `all` | ❌ |
| `POST /:id/reject` | `requisition:approve` | ❌ | `desc` | `all` | ❌ |
| `GET /materials` … | `material:read` | `all` | `all` | `all` | `all` |
| `POST /materials` … | `material:create` | ❌ | ❌ | `all` | ❌ |
| `GET /reports/purchase-by-dept` | `report:purchase` | ❌ | `desc` | `all` | `all` |

## 5.3 Phân quyền cấp trường

| Cột | Group | NHAN_VIEN | TRUONG_BP | GIAM_DOC |
|---|---|:---:|:---:|:---:|
| `materials.estimatedPrice` | `cost` | ❌ | ✅ | ✅ |
| `suppliers.bankAccount` | `finance` | ❌ | ❌ | ✅ |

**Kiểm cả bốn kênh** (§4.4c): response · export Excel · báo cáo · audit diff. Và: menu chọn cột **không được liệt kê** cột bị ẩn; `?sort=estimatedPrice` phải `400`.

---

# 6. Màn hình

| # | Màn hình | Pattern | Form layout |
|---|---|---|---|
| 1 | Nhà cung cấp | `list-drawer` | `single-column` |
| 2 | Nhóm vật tư | `list-drawer` | `single-column` |
| 3 | Vật tư | `list-detail` | `sections` |
| 4 | **Đề xuất mua hàng** | `list-detail` | **`grid-entry`** |
| 5 | Hàng chờ tôi duyệt | `list-only` + filter cứng | — |
| 6 | Báo cáo chi theo bộ phận | report framework | — |
| 7 | Cấu hình hạn mức duyệt | `list-drawer` | `single-column` |

## 6.1 Màn hình 4 — chi tiết, vì đây là màn nặng nhất

**Tab:** Thông tin · Dòng đề xuất · Đính kèm · Lịch sử duyệt (timeline audit)

**Grid dòng đề xuất:**
- Cột: `#` · Vật tư (async select) · ĐVT (tự điền) · SL · Đơn giá · Thành tiền · NCC gợi ý · Ghi chú · xoá
- Footer: **Tổng tiền**
- Bàn phím: `Enter` xuống ô/dòng, ở dòng cuối **tự thêm dòng** · `Ctrl+Enter` submit · `Esc` huỷ ô · `Ctrl+S` lưu
- **Nhập trọn 3 dòng không chạm chuột** — nếu không được thì là phát hiện mức cao

**Action bar** (Action Registry):

| Action | `permission` | `enabled` trả lý do khi chặn |
|---|---|---|
| Gửi duyệt | `requisition:submit` | *"Đề xuất chưa có dòng nào"* · *"Chỉ gửi được ở trạng thái nháp"* |
| Duyệt (cấp 1) | `requisition:approve` | *"Không thể tự duyệt đề xuất mình lập"* · *"Vượt hạn mức duyệt của bạn"* |
| Duyệt (cấp 2) | `requisition:approve_l2` | *"Đề xuất chưa qua duyệt cấp 1"* |
| Từ chối | `requisition:approve` | + `confirmWithReason` bắt nhập lý do |
| Huỷ | `requisition:update` | *"Chỉ huỷ được đề xuất nháp"* |
| Xuất Excel | `requisition:read` | |

---

# 7. Báo cáo — "Chi mua hàng theo bộ phận"

```ts
defineReport({
  id: 'purchase-by-dept',
  name: 'Chi mua hàng theo bộ phận',
  permission: 'report:purchase',
  params: [dateRange('period'), orgUnit(), select('status')],
  query: (p, ability) => /* Kysely + ability.scopeWhere('requisition') */,
  columns: [
    { key: 'orgUnitName', label: 'Bộ phận' },
    { key: 'countTotal',    label: 'Số đề xuất' },
    { key: 'amountPending', label: 'Đang chờ duyệt', type: 'money', summary: 'sum' },
    { key: 'amountApproved',label: 'Đã duyệt',       type: 'money', summary: 'sum' },
  ],
  drilldown: (row) => `/requisitions?filter[orgUnitId][eq]=${row.orgUnitId}`,
})
```

**Ba điều bắt buộc kiểm:**
1. `TRUONG_BP` thấy **số nhỏ hơn** `GIAM_DOC` — scope có tác dụng trong báo cáo
2. Dòng tổng khớp Σ các dòng
3. Drill-down trả về **đúng** tập bản ghi

---

# 8. Năm thăm dò ma sát — bấm giờ riêng từng cái

Đây là phần quan trọng nhất của đặc tả. Năm chỗ này chạm vào hạ tầng **đã xây nhưng chưa ai dùng thật**. Tôi dự đoán ma sát tập trung ở đây.

| # | Thăm dò | Chạm gì | Vì sao nghi ngờ |
|---|---|---|---|
| **1** | **Duyệt 2 cấp có nhảy bậc theo hạn mức** | `approval_authorities` + state machine | Máy trạng thái hiện **tĩnh**; đích của transition #2 phụ thuộc dữ liệu. `approval_authorities` **chưa dùng lần nào** |
| **2** | **`neededBy` ≥ +3 ngày làm việc** | `business_calendars` (§5C.4) | Bảng lịch là CORE-nhẹ, **chưa dùng lần nào**. `addWorkingDays()` có tồn tại và chạy đúng lễ VN không? |
| **3** | **`materials.name` là JSONB đa ngôn ngữ** | §3.10 · `resolveLocaleExpr` · cột `*_search` | Repository có tự ghi `nameViSearch` không, hay bạn phải làm tay? Sort/filter theo `name` có dùng index? |
| **4** | **`effectiveFrom/To` chặn vật tư hết hiệu lực** | §5C.10 master-data governance | Nhãn CORE-nhẹ nhưng có thể **chưa implement** |
| **5** | **Tạo 2 vai trò mới hoàn toàn qua UI** | §4.4 vai trò là dữ liệu | Nếu phải sửa code để thêm vai trò → **vi phạm §4.4**, phát hiện mức cao |

**Ghi vào `FRICTION.md` riêng cho mỗi thăm dò:** mất bao lâu · có phải sửa boilerplate không · nếu có thì file nào (cộng vào M3).

## 8.1 Ba thứ tôi cố ý KHÔNG đưa vào — để bạn biết là có ý

| Không có | Vì sao |
|---|---|
| Tồn kho, movement | Đã có test concurrency riêng. Pilot không cần đo lại |
| Multi-tenant nhiều tenant | Đã có 12 ca HYBRID + U6. Pilot dùng **một** tenant |
| VAT, chiết khấu | Đề xuất chưa phải hoá đơn. Và nó **để hở câu hỏi hay**: `calculateMoney` có quá nặng cho tổng đơn giản? |

---

# 9. Dữ liệu seed — đừng mất thời gian nghĩ

```
org_units       Ban Giám đốc
                ├── Phòng Kỹ thuật
                ├── Phòng Kinh doanh
                └── Phòng Hành chính

membership      giamdoc@pilot.local     GIAM_DOC        · Ban Giám đốc
                truongkt@pilot.local    TRUONG_BO_PHAN  · P. Kỹ thuật
                truongkd@pilot.local    TRUONG_BO_PHAN  · P. Kinh doanh
                nvkt1@pilot.local       NHAN_VIEN       · P. Kỹ thuật
                nvkt2@pilot.local       NHAN_VIEN       · P. Kỹ thuật
                nvkd1@pilot.local       NHAN_VIEN       · P. Kinh doanh
                kiemtoan@pilot.local    VIEWER          · Ban Giám đốc

material_categories   VT-DIEN "Vật tư điện" · VT-CK "Vật tư cơ khí"
                      VPP "Văn phòng phẩm" · TB "Thiết bị"

materials             20 mã, trong đó:
                      · 2 mã có effectiveTo = hôm qua      → kiểm R8
                      · 3 mã có name.en, 17 mã chỉ name.vi → kiểm §3.10 fallback
                      · giá từ 50.000 đến 8.000.000

suppliers             8 nhà cung cấp, 2 mã có isActive=false

purchase_requisitions 12 đề xuất phủ MỌI trạng thái:
                      2 DRAFT · 3 PENDING_MANAGER · 2 PENDING_DIRECTOR
                      3 APPROVED · 1 REJECTED · 1 CANCELLED
                      Trong đó CÓ:
                      · 1 cái total = 18.000.000  → duyệt cấp 1 là xong
                      · 1 cái total = 45.000.000  → phải qua cấp 2
                      · 1 cái do chính truongkt lập → kiểm R4 tự duyệt
```

**Kèm canary như C0** (dùng lại kỹ thuật §C0.0 tầng 1):

```
materials.estimatedPrice của 1 mã = "888777666.00"
suppliers.bankAccount của 1 NCC   = "ZZZ-BANK-CANARY-4b1d"
```

Rồi grep trong response và file Excel khi đăng nhập bằng `NHAN_VIEN`. Thấy = rò rỉ cột.

---

# 10. Nghiệm thu dự án pilot

Không phải nghiệm thu boilerplate — đó là `FRICTION.md`. Đây là *"dự án pilot đã xong chưa"*.

- [ ] 7 màn hình chạy được
- [ ] Tạo được đề xuất 3 dòng **hoàn toàn bằng bàn phím**
- [ ] Số đề xuất liên tục, không nhảy cóc (tạo 5 cái liền, kiểm `PR-2026-00001`→`00005`)
- [ ] Đề xuất 18tr: `TRUONG_BP` duyệt → `APPROVED` ngay
- [ ] Đề xuất 45tr: `TRUONG_BP` duyệt → `PENDING_DIRECTOR`; `GIAM_DOC` duyệt → `APPROVED`
- [ ] `TRUONG_BP` tự duyệt đề xuất mình lập → `409 PR.SELF_APPROVAL`
- [ ] `NHAN_VIEN` gọi endpoint duyệt → `403`
- [ ] `NHAN_VIEN` không thấy `estimatedPrice` ở **cả 4 kênh**
- [ ] `neededBy` = mai → `409 NEEDED_BY_TOO_SOON` (nếu §5C.4 dùng được)
- [ ] Thêm vật tư hết hiệu lực → `409 MATERIAL_INACTIVE` (nếu §5C.10 dùng được)
- [ ] Báo cáo: `TRUONG_BP` thấy số nhỏ hơn `GIAM_DOC`
- [ ] Export Excel không chứa canary khi vai trò không được xem
- [ ] Timeline lịch sử duyệt hiện **tên hành động nghiệp vụ**, không phải `UPDATE`
- [ ] 2 vai trò mới tạo **qua UI**, không sửa code

Hai dòng có chữ *"nếu … dùng được"* là **có chủ đích**: nếu §5C.4 hoặc §5C.10 chưa implement thì bỏ luật đó, ghi vào `FRICTION.md` mức **THIẾU**, và **đi tiếp**. Đừng dựng chúng trong pilot.

---

# 11. Ánh xạ vào 5 ngày

| Ngày | Việc | Thăm dò |
|---|---|---|
| **0** (2h) | Cắt gọt §11 · `make setup` · playbook FE §1 · `test:a11y` | — |
| **1** | `gen:module` × 3 danh mục (bấm giờ **từng** cái) · seed | #3, #4 |
| **2** | Đề xuất: schema · grid-entry · tính tổng · đánh số | #2 |
| **3** | Duyệt 2 cấp · hạn mức · vai trò mới qua UI | **#1, #5** |
| **4** | Báo cáo · export · đính kèm · timeline | — |
| **5** | Sáng: tự nhập dữ liệu thật 1–2h như người dùng.<br>Chiều: hoàn thiện `FRICTION.md`, điền 4 số đo, viết phán quyết | — |

**Ngày 3 là ngày quan trọng nhất** — hai thăm dò nặng nhất nằm ở đó. Nếu chỉ có 1 ngày để pilot, làm ngày 3.

**Ngày 1: so thời gian `gen:module` #1 với #3.** Nếu #3 không nhanh hơn #1 đáng kể thì generator chưa giúp gì — và đó là phát hiện lớn về giá trị của boilerplate.
