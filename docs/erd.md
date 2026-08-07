# SƠ ĐỒ QUAN HỆ DỮ LIỆU (ERD)

> Bổ trợ cho `boilerplate-spec.md` §6. Tài liệu này chỉ mô tả **quan hệ**; định nghĩa cột đầy đủ nằm ở §6.1, phân loại tenancy ở §6.5.
>
> **Quy ước đọc:**
> - `TENANT_FK` = quan hệ dùng **composite FK** `(tenant_id, parent_id)` theo §6.4
> - `POLY` = quan hệ đa hình `(entity, entity_id)` — **không có FK ở tầng DB**, phải kiểm tra ở service
> - Bảng in đậm là bảng `GLOBAL` (không có `tenant_id`)

---

## 1. Tenancy & Định danh — miền quan trọng nhất

```mermaid
erDiagram
    TENANT ||--o{ TENANT_DOMAIN     : "có nhiều domain"
    TENANT ||--o{ TENANT_MEMBERSHIP : "có thành viên"
    TENANT ||--o{ TENANT_FEATURE    : "được bật tính năng"
    TENANT ||--o{ ORG_UNIT          : "sở hữu cây đơn vị"
    TENANT ||--o{ INVITATION        : "gửi lời mời"

    USER ||--o{ TENANT_MEMBERSHIP     : "là thành viên của"
    USER ||--o{ PASSWORD_RESET_TOKEN  : "yêu cầu đặt lại"

    ORG_UNIT ||--o{ ORG_UNIT          : "cha-con (ltree)"
    ORG_UNIT ||--o{ TENANT_MEMBERSHIP : "thành viên thuộc đơn vị"

    TENANT_MEMBERSHIP ||--o{ SESSION : "phiên đăng nhập"

    TENANT {
        uuid id PK
        text code UK
        text status
        text default_locale
        text default_timezone
        int  data_retention_days
        ts   deleted_at
    }
    USER {
        uuid id PK
        text email UK "UNIQUE TOÀN HỆ THỐNG"
        text password_hash
        text status
        ts   deleted_at
    }
    TENANT_MEMBERSHIP {
        uuid id PK "khớp membershipId trong JWT"
        uuid tenant_id FK
        uuid user_id FK
        uuid org_unit_id FK
        text status "ACTIVE|SUSPENDED|LEFT — KHÔNG soft delete"
    }
    ORG_UNIT {
        uuid id PK
        uuid tenant_id FK
        uuid parent_id FK
        ltree path
        text code
    }
```

**Ràng buộc then chốt:**

| Quan hệ | Ràng buộc |
|---|---|
| `TENANT_MEMBERSHIP` | `PRIMARY KEY (id)` + `UNIQUE (tenant_id, user_id)` |
| `ORG_UNIT.parent_id` | `TENANT_FK` — đơn vị cha phải cùng tenant |
| `TENANT_MEMBERSHIP.org_unit_id` | `TENANT_FK` |
| `USER.email` | `UNIQUE` toàn hệ thống — một người, một email, nhiều membership |

---

## 2. Phân quyền

```mermaid
erDiagram
    TENANT ||--o{ ROLE : "định nghĩa vai trò"

    ROLE ||--o{ ROLE_PERMISSION : "được cấp"
    PERMISSION ||--o{ ROLE_PERMISSION : "thuộc vai trò"

    TENANT_MEMBERSHIP ||--o{ USER_ROLE : "được gán vai trò"
    ROLE              ||--o{ USER_ROLE : "gán cho thành viên"

    ROLE {
        uuid id PK
        uuid tenant_id FK
        text code
        bool is_system
        ts   deleted_at
    }
    PERMISSION {
        uuid id PK
        text code UK "resource:action — GLOBAL, sync từ code"
        text resource
        text action
    }
    ROLE_PERMISSION {
        uuid tenant_id FK
        uuid role_id FK
        uuid permission_id FK
        text scope "own|department|descendants|all"
    }
    USER_ROLE {
        uuid tenant_id FK
        uuid membership_id FK "KHÔNG phải user_id — xem phát hiện #1"
        uuid role_id FK
    }
```

**Quan trọng:** `scope` nằm ở `ROLE_PERMISSION`, không nằm ở `ROLE`. Cùng một vai trò có thể có `order:read` scope `all` nhưng `salary:read` scope `own`.

---

## 3. Hạ tầng dùng chung

```mermaid
erDiagram
    TENANT ||--o{ AUDIT_LOG          : ""
    TENANT ||--o{ FILE               : ""
    TENANT ||--o{ NOTIFICATION       : ""
    TENANT ||--o{ DOCUMENT_SEQUENCE  : ""

    FILE ||--o{ ATTACHMENT : "đính kèm vào entity"

    TENANT_MEMBERSHIP ||--o{ NOTIFICATION             : "người nhận"
    TENANT_MEMBERSHIP ||--o{ NOTIFICATION_PREFERENCE  : ""
    TENANT_MEMBERSHIP ||--o{ USER_PREFERENCE          : ""
    TENANT_MEMBERSHIP ||--o{ SAVED_VIEW               : ""
    TENANT_MEMBERSHIP ||--o{ RECENT_ITEM              : ""
    TENANT_MEMBERSHIP ||--o{ FAVORITE_ITEM            : ""

    AUDIT_LOG {
        uuid id PK
        ts   created_at PK "PK ghép do partition"
        uuid tenant_id
        text entity "POLY — không FK"
        uuid entity_id "POLY"
        uuid actor_id
        uuid on_behalf_of_id "impersonation"
        jsonb before
        jsonb after
    }
    ATTACHMENT {
        uuid id PK
        uuid tenant_id FK
        uuid file_id FK
        text entity "POLY"
        uuid entity_id "POLY"
    }
    DOCUMENT_SEQUENCE {
        uuid tenant_id PK
        text key PK
        int  year PK
        int  current_value
    }
    SETTING {
        uuid tenant_id "NULL = mặc định hệ thống (HYBRID)"
        text key
        jsonb value
    }
```

**Bảng đa hình** — `audit_logs`, `attachments`, `comments`, `entity_subscriptions`, `saved_views`, `recent_items`, `favorite_items`: cột `(entity, entity_id)` **không thể có FK**. Phải có:
- Enum `EntityType` dùng chung ở `packages/shared`
- Kiểm tra tồn tại + kiểm tra quyền ở service trước khi ghi
- Job dọn bản ghi mồ côi (chạy hằng tuần)

---

## 4. Nhất quán giao dịch

```mermaid
erDiagram
    TENANT ||--o{ IDEMPOTENCY_REQUEST : ""
    TENANT ||--o{ OUTBOX_EVENT        : ""

    IDEMPOTENCY_REQUEST {
        uuid id PK
        uuid tenant_id FK
        text key "UNIQUE (tenant_id, key)"
        text operation
        text request_hash "khác hash → 409 KEY_REUSED"
        text status "PROCESSING|COMPLETED|FAILED"
        int  response_status
        jsonb response_body
        ts   expires_at
    }
    OUTBOX_EVENT {
        uuid id PK
        uuid tenant_id FK
        text event_type
        text aggregate_type "POLY"
        uuid aggregate_id "POLY"
        text status "PENDING|PROCESSING|DONE|DEAD"
        int  attempts
        ts   available_at
        ts   locked_at "claim protocol"
        text locked_by
    }
```

---

## 5. Số dư — movement + snapshot

```mermaid
erDiagram
    MOVEMENT ||--o| MOVEMENT : "reversal_of (bút toán đảo)"
    MOVEMENT ||--|| MOVEMENT_DEDUP_KEY : "1-1, dedup insert TRƯỚC"

    WAREHOUSE ||--o{ STOCK_BALANCE : ""
    PRODUCT   ||--o{ STOCK_BALANCE : ""
    PRODUCT   ||--o{ LOT           : "nếu tracking_type=LOT"
    LOT       ||--o{ STOCK_BALANCE : "sentinel nếu NONE"
    PRODUCT   ||--o{ INVENTORY_SERIAL : "nếu tracking_type=SERIAL"
    WAREHOUSE ||--o{ INVENTORY_SERIAL : ""

    MOVEMENT {
        uuid id PK
        ts   created_at PK "PK ghép do PARTITION BY RANGE"
        uuid tenant_id
        text account_type "STOCK|RECEIVABLE|CASH"
        text account_key
        text movement_type
        int  direction
        numeric quantity
        text ref_type "POLY"
        uuid ref_id "POLY"
        uuid reversal_of_id "cặp 2 cột"
        ts   reversal_of_created_at
    }
    MOVEMENT_DEDUP_KEY {
        uuid tenant_id PK
        text ref_type PK
        uuid ref_id PK
        text movement_type PK
        uuid movement_id
        ts   movement_created_at
    }
    STOCK_BALANCE {
        uuid tenant_id PK
        uuid warehouse_id PK
        uuid product_id PK
        uuid lot_id PK "NOT NULL — sentinel 0000... nếu NONE"
        numeric on_hand
        numeric reserved
        numeric available "ĐIỂM KIỂM SOÁT ĐỒNG THỜI cho CẢ 3 loại"
        numeric in_transit
        int version
    }
    PRODUCT_TRACKING {
        text tracking_type "NONE | LOT | SERIAL"
    }
    INVENTORY_SERIAL {
        uuid id PK
        uuid tenant_id FK
        text serial_no "UNIQUE (tenant_id, product_id, serial_no)"
        uuid product_id FK "TENANT_FK"
        uuid warehouse_id FK "TENANT_FK"
        uuid lot_id FK "TENANT_FK"
        text status "IN_STOCK|RESERVED|ISSUED|RETURNED|SCRAPPED"
    }
    LOT {
        uuid id PK
        uuid tenant_id FK
        uuid product_id FK "TENANT_FK"
        text lot_no "UNIQUE (tenant_id, product_id, lot_no)"
        date expiry_date
    }
    WAREHOUSE {
        uuid id PK
        uuid tenant_id FK
        text code
        uuid org_unit_id FK
    }
```

---

## 6. Module nghiệp vụ mẫu [REF]

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER      : "đặt hàng"
    ORDER    ||--o{ ORDER_ITEM : "chi tiết"
    PRODUCT  ||--o{ ORDER_ITEM : "sản phẩm"
    ORG_UNIT ||--o{ ORDER      : "thuộc đơn vị"

    ORDER {
        uuid id PK
        uuid tenant_id FK
        text code "UNIQUE (tenant_id, code) WHERE deleted_at IS NULL"
        uuid customer_id FK "TENANT_FK"
        text status "state machine"
        numeric total
        int version "optimistic locking"
        ts deleted_at
    }
    ORDER_ITEM {
        uuid id PK
        uuid tenant_id FK
        uuid order_id FK "TENANT_FK"
        uuid product_id FK "TENANT_FK"
        text product_name_snapshot "chốt tên lúc phát sinh §3.10"
        numeric uom_factor_snapshot "chốt hệ số §5B.2/B2"
        numeric quantity
        numeric unit_price
    }
    PRODUCT {
        uuid id PK
        uuid tenant_id FK
        text code
        jsonb name "đa ngôn ngữ"
        text name_vi_search "chuẩn hoá ở tầng ứng dụng"
        text name_en_search
        text base_uom
    }
```

`ORDER_ITEM` là **child của aggregate**, không phải `BusinessEntityBase`: không `org_unit_id`, không `version` riêng, không soft delete, xoá cứng trong transaction sửa `Order`.

---

## 7. Module tuỳ chọn — tóm tắt quan hệ

```mermaid
erDiagram
    APPROVAL_FLOW    ||--o{ APPROVAL_STEP    : ""
    APPROVAL_FLOW    ||--o{ APPROVAL_REQUEST : ""
    APPROVAL_REQUEST ||--o{ APPROVAL_ACTION  : ""

    WEBHOOK_ENDPOINT ||--o{ WEBHOOK_SUBSCRIPTION : ""
    WEBHOOK_ENDPOINT ||--o{ WEBHOOK_DELIVERY     : "UNIQUE (tenant,endpoint,event_id)"

    IMPORT_JOB    ||--o{ IMPORT_ROW    : ""
    SAVED_REPORT  ||--o{ REPORT_SCHEDULE : ""
    SAVED_REPORT  ||--o{ REPORT_RUN      : ""
    FILE          ||--o{ REPORT_RUN      : "file kết quả"

    BUSINESS_CALENDAR ||--o{ CALENDAR_WORKING_HOUR : ""
    BUSINESS_CALENDAR ||--o{ CALENDAR_HOLIDAY      : ""

    COMMENT ||--o{ COMMENT : "trả lời"
    COMMENT ||--o{ MENTION : ""
```

---

# PHÁT HIỆN KHI DỰNG ERD

Dựng sơ đồ đã lộ ra **năm khoảng trống** trong §6.1. Bốn cái đầu nên sửa **trước khi viết migration GĐ1**.

## #1 — `user_roles` trỏ vào `user_id`, phải trỏ vào membership · **CHẶN GĐ3**

Schema hiện tại: `user_roles(tenant_id, user_id, role_id)`.

Cấu trúc này **cho phép gán vai trò của tenant A cho một user không phải thành viên tenant A**. Không có ràng buộc DB nào chặn.

**Sửa:**

```sql
user_roles(membership_id, role_id, :TenantAuditedBase)
  UNIQUE (tenant_id, membership_id, role_id)
  FOREIGN KEY (tenant_id, membership_id)
    REFERENCES tenant_memberships (tenant_id, id)
```

Hệ quả tốt: user rời tenant (`status = LEFT`) thì vai trò đi theo membership, không sót lại. Và khớp với `membershipId` trong JWT.

Áp dụng tương tự cho `sessions`, `delegations`, `notification_preferences`, `user_preferences` — mọi bảng gắn người dùng **trong phạm vi một tenant** đều nên trỏ `membership_id`.

## #2 — `invitations.role_ids uuid[]` không có FK · **CHẶN GĐ2**

Mảng UUID không tạo được FK, nên có thể mời kèm vai trò đã bị xoá hoặc vai trò của tenant khác.

**Sửa:** tách bảng nối

```sql
invitation_roles(invitation_id, role_id, :TenantAuditedBase)
  FOREIGN KEY (tenant_id, role_id) REFERENCES roles (tenant_id, id)
```

## #3 — `stock_balances` tham chiếu bảng chưa tồn tại · **ĐÃ GIẢI QUYẾT**

`warehouses`, `lots`, `inventory_serials` đã được bổ sung vào §6.1.

**Kèm theo một vấn đề DDL phát sinh khi chốt `tracking_type`:** với `NONE` thì `lot_id` là NULL, nhưng **PostgreSQL bắt buộc mọi cột trong PRIMARY KEY đều NOT NULL** — nên PK bốn cột không tạo được.

**Đã chốt: dùng SENTINEL** `'00000000-0000-0000-0000-000000000000'` cho `lot_id` khi `tracking_type = NONE`.

| Phương án | Được | Mất |
|---|---|---|
| **Sentinel UUID** ✅ | PK tự nhiên; hot path giữ `lot_id = :lotId`, index hoàn hảo | Không đặt được FK `lot_id → lots` |
| Hai partial unique index | Giữ NULL đúng ngữ nghĩa, FK được | Hot path phải dùng `IS NOT DISTINCT FROM`, index kém |
| Lô mặc định cho mọi SP | Đồng nhất, FK được | Một dòng rác mỗi sản phẩm |

Chọn sentinel vì conditional UPDATE ở §5B.2/B4 là query quan trọng nhất hệ thống về cả tính đúng lẫn hiệu năng.

**Và một luật đi kèm:** `stock_balances` là nguồn tồn duy nhất cho **cả ba** loại tracking. `inventory_serials` là chi tiết. Nếu để serial tự quản tồn thì có hai nguồn sự thật và mất cơ chế chống xuất âm.

## #4 — `movement_dedup_keys` chưa có FK về `movements`

Có `movement_id` + `movement_created_at` nhưng chưa khai FK.

**Sửa:**

```sql
FOREIGN KEY (movement_id, movement_created_at)
  REFERENCES movements (id, created_at)
```

**Cân nhắc ngược lại:** FK sang bảng partition làm việc `DETACH` mảnh cũ phức tạp hơn. Nếu ưu tiên archive dễ thì bỏ FK này, kiểm tra ở service. **Cần một quyết định, ghi vào ADR.**

## #5 — `approval_steps.approver_ref` đa hình, không FK

Trỏ tới `role` hoặc `user` tuỳ `approver_type`. Không tránh được, nhưng phải kiểm tra ở service. Chỉ ảnh hưởng module [OPT], không chặn.

---

## Việc cần làm

| # | Việc | Trước giai đoạn |
|---|---|---|
| 1 | `user_roles` → `membership_id` + composite FK | GĐ3 |
| 2 | Tách `invitation_roles` | GĐ2 |
| 3 | Thêm `warehouses`, `lots`; chốt có quản lý lô không | GĐ5b |
| 4 | Quyết định FK `movement_dedup_keys` → ADR | GĐ5b |
| 5 | Enum `EntityType` dùng chung cho mọi quan hệ đa hình | GĐ1 |
| 6 | `delegations` → dùng `membership_id` thay `user_id` (cùng lý do #1) | GĐ10 |
| 7 | `approval_authorities`: CHECK ít nhất một trong ba cột đối tượng khác NULL | GĐ10 |
