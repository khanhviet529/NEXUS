# ĐẶC TẢ HỆ PRESET FE

| | |
|---|---|
| **Mục tiêu** | **Một behavior system, nhiều presentation preset.** Clone cho dự án mới thì **chọn** preset, không thiết kế lại |
| **Phạm vi** | Cơ chế: token, shell, registry, cấp cấu hình, kiểm chứng |
| **Phiên bản** | v1 — sẵn sàng triển khai. Sau khi bắt đầu GĐ A thì mọi thay đổi cơ chế phải qua ADR |
| **Ngoài phạm vi** | Nội dung cụ thể của preset #2–4 — chốt sau GĐ C (§11.3) |
| **Bổ trợ** | `boilerplate-spec.md` §5 · `fe-playbook.md` · `fe-prompts.md` |

> **Đọc §1 trước.** Nếu hiểu sai §1 thì mọi phần còn lại vẫn ra bốn app giống nhau 90%.

---

# 1. Preset khác nhau ở MẬT ĐỘ THÔNG TIN, không phải ở radius

Đây là chỗ hầu hết design system thất bại: người ta coi preset là *màu + bo góc + đổ bóng*, rồi ra bốn app không phân biệt được, và toàn bộ công sức thành vô nghĩa.

Preset thật khác nhau ở **bao nhiêu dữ liệu hiện trên một màn** và **màn hình lúc nghỉ hiển thị gì**.

## 1.1 Bảng trục phân biệt

| Trục | Enterprise | Modern SaaS | Operations | Executive |
|---|---|---|---|---|
| **Số dòng bảng thấy được /màn** | **28–32** | 15–18 | 20–24 | **8–10** |
| Font cơ sở | 13px | 14px | 14px | 15px |
| Chiều cao dòng bảng | 32px | 44px | 40px | 52px |
| **Hiển thị list mặc định** | `table` | `table` | `table` | `table` |
| **Trang mặc định của module** | list | list | list | **`dashboard`** (page pattern) |
| **Action đặt ở đâu** | Toolbar + menu ⋯ | Hiện khi hover dòng | **Nút to + phím tắt** | Ít action, drill-down |
| Shell | `sidebar` 3 cấp | `sidebar` 2 cấp | `hybrid` | `top-nav` 1 cấp |
| Bề rộng nội dung | `fluid` | `contained 1280` | `fluid` | `contained 1200` |
| **Bàn phím** | `data-entry` | `standard` | **`data-entry`** | `standard` |
| Trạng thái chứng từ | Badge nhỏ | Badge nhỏ | **Badge lớn, màu đậm** | Chip mờ |
| Tỉ lệ chrome/content | 12% | 20% | 18% | 25% |
| Radius / shadow | 4px / không | 10px / mềm | 4px / không | 12px / mềm |

**Hai dòng cuối là hai dòng cuối, không phải hai dòng đầu.**

## 1.2 Hệ quả kiến trúc

Preset **không phải file CSS**. Nó quyết định `defaultPageSize`, `rowHeight`, `defaultListDisplay`, `actionPlacement`, `keyboardProfile` — toàn bộ là **hành vi**. Nên preset là **object TypeScript** với `behavior` là nguồn sự thật, còn CSS var được **derive** từ đó (§4.2).

## 1.3 Phép thử phân biệt — tiêu chí nghiệm thu

Trước khi coi hệ preset là xong:

```
Render CÙNG một màn hình danh sách bằng cả 4 preset
  → chụp 4 ảnh
  → đưa cho người không biết dự án
```

> **Không phân biệt được → hệ preset THẤT BẠI, dù code chạy đúng.**

Ghi phép thử này vào `progress.md` làm điều kiện đóng GĐ D. Không có nó thì bạn sẽ tự thuyết phục mình là bốn preset khác nhau khi thực ra chỉ khác bo góc.

---

# 2. Ba cấp cấu hình — tách tuyệt đối

Đây là phần dễ lẫn nhất, và lẫn thì không sửa được nhẹ.

| Cấp | Ai chọn | Khi nào | Lưu ở đâu | Gồm |
|---|---|---|---|---|
| **1. Project** | Bạn | Một lần, lúc clone | `config/project-ui.ts` (**trong code**) | `preset`, `shell`, `density` mặc định, `contentWidth`, typography |
| **2. Module** | Bạn | Lúc viết module | Prop của component | `pagePattern`, `displayType`, `formLayout` |
| **3. User** | Người dùng | Lúc dùng app | `user_preferences` (DB) | dark/light, density, sidebar mở/gập, cột hiện, saved view |

## 2.1 User KHÔNG được đổi những thứ này

```
sidebar → top-nav        ❌  đây là kiến trúc thông tin
tabs → sections          ❌
list-detail → list-split ❌
```

Lý do: nếu màn A dùng tab mà màn B dùng section cho cùng loại nội dung, người dùng mất phương hướng. Cấp 2 là quyết định **build-time của bạn**.

## 2.2 Sửa lỗi tầng trừu tượng hiện có

Playbook cũ gộp ba cấp khác nhau vào một enum. Tách ra:

```ts
// ❌ SAI — trộn shell, trạng thái sidebar, chế độ trang
layoutPreset: 'sidebar-left' | 'sidebar-collapsed' | 'focus'

// ✅ ĐÚNG — ba trục độc lập
shell:       'sidebar' | 'top-nav' | 'hybrid' | 'workspace'   // cấp 1
sidebarMode: 'expanded' | 'compact' | 'icon'                   // cấp 3 (user)
pageMode:    'normal' | 'focus'                                // cấp 2 (theo trang)
```

## 2.3 `config/project-ui.ts` — preset + override tường minh

**Một nguồn duy nhất.** Preset là mặc định gắn kết; project override **có chủ đích**, và chỉ ba trục được override.

```ts
// apps/web/src/config/project-ui.ts
// FILE DUY NHẤT sửa khi khởi tạo dự án mới
import type { ProjectUIConfig } from '@/design-system/registry';

export const PROJECT_UI = {
  preset: 'enterprise',
  brandHue: 255,              // OKLCH hue 0-360 — chroma do preset quyết (§3.2)
} satisfies ProjectUIConfig;
```

Dự án muốn Enterprise nhưng dùng top-nav:

```ts
export const PROJECT_UI = {
  preset: 'enterprise',
  brandHue: 210,
  overrides: { shell: 'top-nav' },
} satisfies ProjectUIConfig;
```

```ts
export interface ProjectUIConfig {
  preset: PresetId;
  brandHue: number;
  /** Override CÓ CHỦ ĐÍCH. Chỉ ba trục này — thêm trục nữa = preset mất ý nghĩa. */
  overrides?: {
    shell?: ShellId;
    density?: Density;
    contentWidth?: ContentWidth;
  };
}
```

### Vì sao preset có `shell` mà project vẫn override được

Nếu `enterprise` **luôn** = `sidebar` thì preset vô tình khoá luôn bố cục — trái mục tiêu *"clone dự án → có nhiều lựa chọn bố cục"*.

```
Preset          = mặc định gắn kết (coherent default)
Project override = lựa chọn có chủ đích
```

### Chuỗi phân giải — có ĐÚNG MỘT hàm

```
VisualPreset  →  PROJECT_UI.overrides  →  user_preferences (chỉ trục an toàn)  →  ResolvedUI
```

```ts
export function resolveProjectUI(
  cfg: ProjectUIConfig,
  userPrefs?: UserUIPrefs,
): ResolvedUI { /* ... */ }
```

**`useProjectUI()` chỉ trả về `ResolvedUI`, không bao giờ trả preset thô hay `PROJECT_UI` thô.** Component không có cách nào đọc được nguồn chưa phân giải — nên không thể có bug "ai thắng".

**Bỏ `mobileScope` khỏi `ProjectUIConfig`.** Phạm vi mobile là **yêu cầu dự án**, không phải cấu hình UI. Khi có dự án kho/RFID thật thì xây workflow mobile **trong dự án đó**; lặp ở 2–3 dự án mới rút về NEXUS.

---

# 3. Ba tầng token

```
primitive.css     --blue-600, --gray-100, --space-2, --text-sm, --shadow-md
     ↓            KHÔNG component nào được dùng trực tiếp
semantic.css      --color-primary, --surface-page, --border-default, --text-body
     ↓            Component dùng được
component.css     --table-row-h, --sidebar-bg, --card-radius, --dialog-shadow
                  Preset CHỈ override tầng này
```

## 3.1 Luật cứng

| # | Luật |
|---|---|
| 1 | Component **không** dùng tầng 1 |
| 2 | Preset **chỉ** override tầng 3 |
| 3 | Preset cần ghi tầng 2 → **tầng 3 thiếu token**, thêm token, không phá luật |
| 4 | Không số màu/spacing rời rạc trong `.tsx`, chỉ `var(--*)` |

**Vì sao luật 2 quan trọng nhất:** tầng 2 là ngữ nghĩa dùng chung. Preset ghi tầng 2 = đổi nghĩa của `primary` theo từng preset, và mọi component vỡ theo cách không đoán được.

## 3.2 Dùng OKLCH — và giới hạn của nó

Repo đã dùng OKLCH. Giữ nguyên, vì `L` của OKLCH xấp xỉ **độ sáng cảm nhận**, nên đổi `hue` cho ra kết quả **dự đoán được hơn nhiều** so với HSL — nơi `hsl(60 100% 50%)` (vàng) và `hsl(240 100% 50%)` (xanh đậm) cùng `L` nhưng sáng khác nhau rõ rệt.

> **Nhưng OKLCH KHÔNG bảo đảm tỉ số tương phản WCAG giữ nguyên khi đổi hue.** WCAG tính từ *relative luminance*, không phải từ `L` của OKLCH — hai đại lượng khác nhau. Cùng `L`, đổi `hue` thì tỉ số tương phản vẫn xê dịch.

### Hệ quả: hai loại a11y regression khác nhau

| Loại | Chạy ở đâu | Kiểm gì |
|---|---|---|
| **Preset regression** | CI của **boilerplate** | 4 preset × light/dark, dùng `brandHue` mặc định |
| **Brand regression** | CI của **từng dự án** | `brandHue` **thật của dự án đó** |

Loại 1 **không** chứng minh loại 2. Enterprise đạt AA ở `brandHue: 255` không nói gì về `brandHue: 70` (vàng-lục) — vùng hue mà chữ trắng trên nền brand rất dễ trượt AA.

**Luật khi khởi tạo dự án:** sau khi đặt `brandHue` trong `project-ui.ts`, **bắt buộc** chạy `pnpm test:a11y`. Đưa bước này vào playbook §1 như một mục checklist, không phải lời khuyên.

```css
/* primitive.css — thang theo L, hue là biến */
:root {
  --brand-h: 255;              /* ← DUY NHẤT ghi từ project-ui.ts */
  --brand-c: 0.15;

  --brand-400: oklch(0.68 var(--brand-c) var(--brand-h));
  --brand-500: oklch(0.60 var(--brand-c) var(--brand-h));
  --brand-600: oklch(0.55 var(--brand-c) var(--brand-h));
  --brand-700: oklch(0.48 var(--brand-c) var(--brand-h));

  --red-600:   oklch(0.55 0.20 25);
  --green-600: oklch(0.58 0.15 150);
  --amber-500: oklch(0.75 0.15 75);
  --sky-600:   oklch(0.60 0.14 235);

  --space-1: 0.25rem;  --space-2: 0.5rem;  --space-3: 0.75rem;
  --text-xs: 0.75rem;  --text-sm: 0.8125rem;  --text-base: 0.875rem;
  --shadow-none: none;
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.05);
  --shadow-md: 0 4px 12px oklch(0 0 0 / 0.08);
}
```

```css
/* semantic.css — ngữ nghĩa, KHÔNG preset nào override */
:root {
  --color-primary:     var(--brand-600);
  --color-primary-fg:  oklch(0.98 0 0);
  --color-danger:      var(--red-600);
  --color-success:     var(--green-600);
  --color-warning:     var(--amber-500);
  --color-info:        var(--sky-600);

  --surface-page:      oklch(0.985 0.002 250);
  --surface-raised:    oklch(1 0 0);
  --surface-sunken:    oklch(0.955 0.005 250);
  --border-default:    oklch(0.905 0.006 250);
  --border-strong:     oklch(0.84 0.008 250);

  --text-body:         oklch(0.22 0.02 255);
  --text-muted:        oklch(0.50 0.015 255);

  /* Trạng thái chứng từ — map từ state-tones.ts */
  --tone-neutral: var(--text-muted);
  --tone-warning: var(--color-warning);
  --tone-success: var(--color-success);
  --tone-danger:  var(--color-danger);
  --tone-info:    var(--color-info);
  --tone-muted:   oklch(0.72 0.01 250);
}
```

```css
/* component.css — mặc định; PRESET ĐÈ ĐÚNG TẦNG NÀY */
:root {
  --table-row-h:        32px;
  --table-header-bg:    var(--surface-sunken);
  --table-row-hover:    oklch(from var(--surface-page) calc(l - 0.02) c h);
  --table-row-selected: oklch(from var(--color-primary) l c h / 0.08);
  --table-zebra:        transparent;
  --table-font-size:    var(--text-sm);

  --sidebar-bg:          oklch(0.24 0.02 258);
  --sidebar-fg:          oklch(0.94 0.005 250);
  --sidebar-item-hover:  oklch(0.30 0.02 258);
  --sidebar-item-active: var(--color-primary);
  --sidebar-w:           240px;

  --header-h:  52px;
  --header-bg: var(--surface-raised);

  --card-radius:    4px;
  --card-shadow:    var(--shadow-none);
  --card-border:    1px solid var(--border-default);
  --card-padding:   var(--space-3);

  --dialog-radius:  6px;
  --dialog-shadow:  var(--shadow-md);

  --badge-radius:   3px;
  --badge-font-size: var(--text-xs);
  --badge-padding:  2px 6px;

  --form-label-w:   180px;
  --form-row-gap:   var(--space-2);
  --input-h:        32px;
}
```

## 3.3 Dark mode — override tầng 2, kèm một ngoại lệ có chủ đích

```css
[data-theme='dark'] {
  --surface-page:   oklch(0.19 0.015 255);
  --surface-raised: oklch(0.23 0.015 255);
  --surface-sunken: oklch(0.27 0.015 255);
  --border-default: oklch(0.32 0.015 255);
  --text-body:      oklch(0.93 0.005 250);
  --text-muted:     oklch(0.68 0.01 250);
  --brand-c: 0.13;                        /* giảm chroma cho nền tối */
  --color-primary: var(--brand-400);      /* sáng hơn để nổi */
}
```

**Không component nào biết dark mode tồn tại.** Và **không preset nào** override khối này.

### Phát biểu chính xác về ranh giới tầng

Khối trên có `--brand-c` — thuộc **tầng 1**, không phải tầng 2. Đây là ngoại lệ **có chủ đích**, không phải vi phạm. Phát biểu đúng:

| Ai | Được ghi gì |
|---|---|
| `appearance.tokens` của preset | **Chỉ tầng 3** (`FreeToken`) |
| `brandHue` (project) · `brandChroma` (preset) | **Tham số palette** — ngoại lệ có chủ đích, dùng để *sinh* tầng 1 |
| Dark mode | Tầng 2, **và được phép biến đổi tham số palette** trước khi tầng 2 phân giải |

Ba tham số palette (`--brand-h`, `--brand-c`, và dark-mode transform của chúng) là **cửa duy nhất** vào tầng 1. Mọi thứ khác ở tầng 1 là cố định.

## 3.4 Check enforce — thêm vào `tools/checks/`

```
check-token-layers.mjs
  1. Mọi key trong appearance.tokens phải thuộc FreeToken
     → union đóng nên TypeScript đã bắt; check này chỉ phòng khi có cast
     → preset ghi token tầng 2 = lấn tầng, ĐỎ
  2. Không file .tsx nào chứa oklch( | #hex | rgb( trong className/style
  3. Mọi --xxx dùng trong .tsx phải tồn tại ở semantic.css hoặc component.css
     → chặn dùng tầng 1 và chặn token không tồn tại (typo)
```

Đây là **check thứ bảy**, và nó là điều kiện sống của hệ bốn preset.

---

# 4. `VisualPreset` — tách Behavior / Appearance

```ts
// apps/web/src/design-system/registry.ts
// PresetId DERIVE từ registry (§4.4) — không thể quên đồng bộ
export type ShellId = 'sidebar';        // CHỈ shell ĐÃ implement. GĐ B thêm 'hybrid'
export type Density = 'compact' | 'comfortable';

/**
 * Mọi giá trị PHỤ THUỘC MẬT ĐỘ phải mang hình dạng này, không được là scalar.
 * Lý do: user đổi density ở cấp 3 → giá trị scalar sẽ KHÔNG đổi theo (§4.1b).
 */
export type DensityScale<T> = Record<Density, T>;
export type ContentWidth = 'fluid' | { max: number };
export type ListDisplayType = 'table' | 'card-grid' | 'compact-list';
export type FormLayout = 'single-column' | 'two-column' | 'sections' | 'grid-entry';
export type KeyboardProfile = 'standard' | 'data-entry';

export interface VisualPreset {
  id: PresetId;
  label: string;
  description: string;

  /** CÁCH APP VẬN HÀNH — nguồn sự thật duy nhất, CSS var derive từ đây */
  behavior: {
    shell: ShellId;
    density: Density;
    contentWidth: ContentWidth;
    table: {
      /** BẮT BUỘC là DensityScale — xem §4.1b */
      rowHeight: DensityScale<number>;
      defaultPageSize: number;
      zebra: boolean;                 //     → sinh --table-zebra
      stickyFirstColumn: boolean;
      actionPlacement: 'toolbar' | 'row-hover' | 'row-always';
    };
    defaultListDisplay: ListDisplayType;
    defaultFormLayout: FormLayout;
    keyboardProfile: KeyboardProfile;
    statusEmphasis: 'subtle' | 'strong';
  };

  /** APP TRÔNG NHƯ THẾ NÀO — chỉ token TỰ DO, không chứa token derived */
  appearance: {
    brandChroma: number;              // OKLCH C — hue do project quyết
    tokens: Partial<Record<FreeToken, string>>;
  };
}
```

Đọc type là hiểu ngay: `behavior` = vận hành, `appearance` = hình thức. Không trộn.

## 4.1 Một nguồn sự thật: token DERIVED vs token FREE

Trước đây `table.rowHeight = 32` và `tokens['table-row-h'] = '44px'` **cùng tồn tại** — hai nguồn điều khiển một component, mầm lỗi.

Chia `AppearanceToken` làm hai nhóm, và **nhóm derived không được viết tay ở đâu cả**:

```ts
/** SINH TỰ ĐỘNG từ behavior — CẤM đặt trong appearance.tokens hoặc bất kỳ file CSS */
export const DERIVED_TOKENS = [
  'table-row-h',        // ← behavior.table.rowHeight
  'table-zebra',        // ← behavior.table.zebra
  'sidebar-w',          // ← behavior.shell + density
  'input-h',            // ← behavior.density
  'form-row-gap',       // ← behavior.density
  'badge-font-size',    // ← behavior.statusEmphasis
  'badge-padding',      // ← behavior.statusEmphasis
] as const;

/** Chỉ preset đặt được, KHÔNG derive từ behavior */
export type FreeToken =
  | 'table-header-bg' | 'table-font-size'
  | 'sidebar-bg' | 'sidebar-fg' | 'sidebar-item-active'
  | 'header-h' | 'header-bg'
  | 'card-radius' | 'card-shadow' | 'card-padding' | 'card-border'
  | 'dialog-radius' | 'dialog-shadow'
  | 'badge-radius'
  | 'form-label-w';
```

`FreeToken` là union đóng nên gõ sai tên = **lỗi biên dịch**. Và vì `DERIVED_TOKENS` không nằm trong `FreeToken`, việc đặt chúng trong `tokens{}` cũng là lỗi biên dịch — không cần dựa vào kỷ luật.

## 4.1b Mọi giá trị phụ thuộc mật độ phải là `DensityScale`

Đây là lỗi tinh vi nhất của bản trước. `density` là trục **user đổi được** (cấp 3), nhưng nếu `rowHeight` là một số cố định thì:

```
Enterprise: density=compact, rowHeight=32
User đổi sang comfortable:
  --input-h        32 → 38   ✅
  --form-row-gap   tăng      ✅
  --sidebar-w      tăng      ✅
  --table-row-h    vẫn 32    ❌  ← thứ user NHÌN THẤY RÕ NHẤT
```

Toggle density thành **công tắc mỹ phẩm không đáng tin**: đổi một nửa giao diện.

**Luật: `user đổi density → MỌI component phụ thuộc mật độ đổi đồng bộ.`**

Thực thi bằng type — giá trị density-sensitive **không được** là scalar:

```ts
table: {
  rowHeight: { compact: 32, comfortable: 40 },   // DensityScale<number>
  ...
}
```

```ts
export function deriveTokens(b: ResolvedBehavior): Record<string, string> {
  const d = b.density;                            // ĐÃ áp userPrefs
  return {
    '--table-row-h':     `${b.table.rowHeight[d]}px`,
    '--table-font-size': d === 'compact' ? 'var(--text-sm)' : 'var(--text-base)',
    '--input-h':         d === 'compact' ? '32px' : '38px',
    '--form-row-gap':    d === 'compact' ? 'var(--space-2)' : 'var(--space-3)',
    '--card-padding':    d === 'compact' ? 'var(--space-3)' : 'var(--space-4)',
    '--header-h':        d === 'compact' ? '52px' : '60px',
    '--sidebar-w':       d === 'compact' ? '240px' : '264px',
    '--toolbar-h':       d === 'compact' ? '40px' : '48px',
    '--button-h':        d === 'compact' ? '32px' : '38px',
    // Không phụ thuộc mật độ:
    '--table-zebra':     b.table.zebra ? 'var(--surface-sunken)' : 'transparent',
    '--badge-font-size': b.statusEmphasis === 'strong' ? 'var(--text-sm)' : 'var(--text-xs)',
    '--badge-padding':   b.statusEmphasis === 'strong' ? '4px 10px' : '2px 6px',
  };
}
```

### Danh sách token phụ thuộc mật độ — rà đủ, không rà một nửa

```
table-row-h · table-font-size · input-h · button-h · toolbar-h
header-h · sidebar-w · form-row-gap · card-padding
```

Thêm token mới thì tự hỏi: *"đổi density có nên đổi nó không?"* Nếu có → vào `deriveTokens` và vào danh sách này.

## 4.2 Derive lúc BUILD/SSR, không phải runtime JS

Đây là chi tiết quyết định chất lượng: nếu ghi CSS var bằng JS sau hydrate thì màn hình **nháy** một lần ở lần tải đầu, và Playwright screenshot sẽ chụp trạng thái chưa áp preset.

```ts
// apps/web/src/design-system/derive-tokens.ts
/** behavior → CSS var. Hàm THUẦN, dùng cho cả SSR lẫn codegen. */
export function deriveTokens(b: VisualPreset['behavior']): Record<string, string> {
  const dense = b.density === 'compact';
  return {
    '--table-row-h':     `${b.table.rowHeight}px`,
    '--table-zebra':     b.table.zebra ? 'var(--surface-sunken)' : 'transparent',
    '--sidebar-w':       dense ? '240px' : '264px',
    '--input-h':         dense ? '32px' : '38px',
    '--form-row-gap':    dense ? 'var(--space-2)' : 'var(--space-3)',
    '--badge-font-size': b.statusEmphasis === 'strong' ? 'var(--text-sm)' : 'var(--text-xs)',
    '--badge-padding':   b.statusEmphasis === 'strong' ? '4px 10px' : '2px 6px',
  };
}
```

```tsx
// apps/web/src/app/layout.tsx — SSR, không nháy
const ui = resolveProjectUI(PROJECT_UI, userPrefs);
const style = {
  ...deriveTokens(ui.behavior),              // token DERIVED
  ...appearanceToCssVars(ui.appearance),     // token FREE  ← đừng quên dòng này
  '--brand-h': String(PROJECT_UI.brandHue),  // project
  '--brand-c': String(ui.appearance.brandChroma), // preset
} as CSSProperties;

return (
  <html data-preset={ui.preset} data-density={ui.behavior.density} style={style}>
```

```ts
/** FreeToken → CSS var. Hàm thuần, dùng cho cả SSR lẫn trang preview. */
export function appearanceToCssVars(a: VisualPreset['appearance']): Record<string, string> {
  return Object.fromEntries(
    Object.entries(a.tokens).map(([k, v]) => [`--${k}`, v as string]),
  );
}
```

### KHÔNG có `themes/*.css` — TypeScript là nguồn duy nhất

Bản trước có **cả** `appearance.tokens` **và** `themes/enterprise.css` — lại hai nguồn cho cùng một thứ. Chọn TypeScript vì:

| | TS preset | `themes/*.css` |
|---|---|---|
| Kiểm tra tên token | ✅ `FreeToken` union, sai = lỗi biên dịch | ❌ typo im lặng |
| Trang preview override được `?preset=` | ✅ | ❌ phải nạp/tháo stylesheet |
| Grep, refactor bằng IDE | ✅ | ❌ |

**`tokens/*.css` vẫn giữ** (3 tầng + dark mode) — đó là **mặc định**, không phải preset. Chỉ `themes/` bị bỏ.

**`--brand-h` từ project, `--brand-c` từ preset.** Enterprise chroma thấp (nghiêm), Modern chroma cao (tươi) — cùng một hue mà ra hai cảm giác khác nhau. Đây là tương tác mà nhận xét chưa nêu.

Trang `/design-system/preview` đọc `?preset=` rồi gọi cùng hai hàm đó — nên ảnh chụp regression **giống hệt** production.

## 4.3 Check `check-token-layers` phải kiểm thêm

```
4. KHÔNG tồn tại thư mục themes/*.css — preset là TypeScript (§4.2)
5. Không .tsx nào chứa Tailwind palette thô hay literal hình thức:
     bg-(red|blue|green|amber|slate|gray|zinc|neutral|stone)-\d{2,3}
     text-… border-… ring-… tương tự
     class arbitrary: [#hex] · [13px] · [rgb(...)]
     style={{ padding: 14 }} — số rời rạc cho thuộc tính hình thức
   → allowlist tối thiểu, ghi lý do trong comment
```

Cùng ba luật ở §3.4 → **năm luật**.

## 4.4 Preset đầu tiên

```ts
export const PRESETS = {
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    description: 'ERP, kế toán, ngân hàng. Mật độ cao, bàn phím trước, bảng là trung tâm.',
    behavior: {
      shell: 'sidebar',
      density: 'compact',
      contentWidth: 'fluid',
      table: {
        rowHeight: 32,
        defaultPageSize: 50,
        zebra: false,
        stickyFirstColumn: true,
        actionPlacement: 'toolbar',
      },
      defaultListDisplay: 'table',
      defaultFormLayout: 'sections',
      keyboardProfile: 'data-entry',
      statusEmphasis: 'subtle',
    },
    appearance: {
      brandChroma: 0.15,
      tokens: {},                     // = mặc định component.css
    },
  },
} satisfies Record<string, VisualPreset>;

/** DERIVE từ registry — không thể quên đồng bộ type với dữ liệu */
export type PresetId = keyof typeof PRESETS;
```

Preset đầu **không override token tự do nào** — nó *là* mặc định. Preset thứ hai mới bắt đầu đè, và chính lúc đó cơ chế được kiểm chứng.

**Vì sao `satisfies Record<string, …>` rồi mới `keyof`:** nếu viết `satisfies Record<PresetId, …>` với `PresetId = keyof typeof PRESETS` thì type tự tham chiếu — TypeScript không giải được. Cách này giữ được kiểm tra hình dạng của từng preset **và** sinh `PresetId` tự động.

# 5. Shell — socket, cắm dần

## 5.1 Interface chung — chốt NGAY dù chỉ có một shell

```ts
// apps/web/src/design-system/layouts/types.ts
export interface ShellProps {
  children: ReactNode;
  nav: NavItem[];                    // sinh từ config, ĐÃ lọc theo permission
  breadcrumb: Crumb[];
  headerSlots: {
    search: ReactNode;               // Cmd+K trigger
    notifications: ReactNode;        // chuông + unread
    user: ReactNode;                 // menu user
    tenantSwitcher?: ReactNode;
  };
  pageMode: 'normal' | 'focus';
}

export type ShellComponent = (props: ShellProps) => ReactNode;
```

**Shell KHÔNG được tự gọi `useQuery`.** `SidebarShell` hiện tại tự lấy unread count — nếu để vậy thì shell thứ hai phải chép lại logic đó, và shell thứ ba nữa. Đẩy hết ra `headerSlots`.

Đây là refactor **3 giờ hôm nay**, hoặc **2 ngày** sau khi có bốn shell.

## 5.2 Router — `SHELLS` phải KHỚP `ShellId`

```tsx
// apps/web/src/design-system/layouts/app-shell.tsx
const SHELLS = {
  sidebar: SidebarShell,
  // GĐ B thêm `hybrid: HybridShell` — CÙNG PR với việc mở rộng ShellId
} satisfies Record<ShellId, ShellComponent>;

export function AppShell(props: ShellProps) {
  const ui = useProjectUI();            // ← ResolvedUI, ĐÃ áp overrides
  const Shell = SHELLS[ui.behavior.shell];
  return <Shell {...props} />;
}
```

**Hai luật:**

1. **`SHELLS` chỉ chứa shell có trong `ShellId`.** Không có `NotImplementedShell`, không ném lỗi runtime — thứ chưa dùng được thì **type không cho chọn**. Mở rộng `ShellId` và thêm entry trong **cùng một PR** với việc implement shell đó.
2. **Đọc `ui.behavior.shell`, KHÔNG đọc `preset.shell`.** Nếu đọc preset gốc thì `PROJECT_UI.overrides.shell` **vô tác dụng** — bug im lặng, cấu hình đúng mà không có hiệu lực.

## 5.3 Bốn shell — sơ đồ

```
sidebar                        top-nav
┌──────┬─────────────────┐    ┌─────────────────────────┐
│ menu │ header          │    │ logo | nav | user       │
│      ├─────────────────┤    ├─────────────────────────┤
│      │ content         │    │ content                 │
└──────┴─────────────────┘    └─────────────────────────┘

hybrid                         workspace
┌─────────────────────────┐   ┌────┬──────────────┬─────┐
│ global nav              │   │nav │ main         │info │
├──────┬──────────────────┤   │    │              │panel│
│module│ content          │   │    │              │     │
│ nav  │                  │   │    │              │     │
└──────┴──────────────────┘   └────┴──────────────┴─────┘
```

---

# 6. Page pattern & display registry

```ts
export const PAGE_PATTERNS = {
  'list-drawer':  { label: 'List + Drawer sửa',      needsDetail: false },
  'list-detail':  { label: 'List + Trang chi tiết',  needsDetail: true },
  'list-split':   { label: 'List + Split view',      needsDetail: true },
  'list-only':    { label: 'Chỉ danh sách',          needsDetail: false },
  'tree-manager': { label: 'Cây + chi tiết',         needsDetail: true },
  'dashboard':    { label: 'Dashboard',              needsDetail: false },
  'wizard':       { label: 'Wizard nhiều bước',      needsDetail: false },
} as const;
```

**Luật: registry chỉ chứa thứ ĐÃ implement hoặc ĐÃ có trong kế hoạch giai đoạn hiện tại.**

Không khai theo trí tưởng tượng (`kanban`, `calendar`, `board`, `heatmap`…). Registry mà chứa thứ chưa ai cần thì nó thành **backlog trá hình** — người đọc tưởng có sẵn, agent tưởng được phép dùng.

| Pattern | Trạng thái |
|---|---|
| `list-drawer`, `list-detail` | GĐ A — implement |
| — | **`grid-entry` KHÔNG phải page pattern, nó là `FormLayout`.** Order = `pagePattern: list-detail` + `formLayout: grid-entry`. Component vẫn đặt ở `patterns/grid-entry/` cho gọn, nhưng model là FormLayout |

| `list-split`, `tree-manager`, `dashboard`, `wizard` | **Chỉ khai ID, ném lỗi rõ ràng khi dùng.** Có trong kế hoạch GĐ D |
| Mọi thứ khác | **Không khai** cho tới khi có use case thật |

Cùng luật với `ListDisplayType`: khai 3, implement `table` trước; `card-grid`/`compact-list` chỉ làm nếu pilot chứng minh cần.

**`ShellId` chỉ chứa shell ĐÃ implement** (§4). Nếu `ShellId` chứa `workspace` mà chưa có `WorkspaceShell` thì `overrides.shell = 'workspace'` biên dịch được rồi chết lúc chạy. Thêm member khi implement — an toàn kiểu tốt hơn ném lỗi runtime.

---

# 7. `keyboardProfile` — sửa luật `Enter`

Luật `Enter` cũ áp toàn hệ thống là **sai**. Hành vi bàn phím theo **pattern**, không theo app:

| Profile | Ngữ cảnh | `Enter` | `Ctrl+Enter` |
|---|---|---|---|
| `standard` | Form ≤5 field, login, dialog | **submit** | submit |
| `data-entry` | Chứng từ, grid-entry, form nhiều dòng | **ô/dòng kế tiếp**; ở dòng cuối thì **tự thêm dòng** | submit |
| — | Ô search / select | **chọn / tìm** | — |

`Esc` **luôn** là *huỷ ô đang sửa*, không phải đóng form. `Ctrl+S` luôn lưu.

Preset chọn `keyboardProfile` mặc định; component form ghi đè được khi cần:

```tsx
<Form keyboardProfile="data-entry">   {/* đè preset, cho form chứng từ */}
```

**Vì sao quan trọng:** người dùng nghiệp vụ VN có phản xạ từ Misa/Fast/Excel — `Enter` là xuống ô. Nếu form chứng từ submit khi Enter, họ gửi thiếu dòng mỗi ngày và không bao giờ báo bug, chỉ kết luận phần mềm khó dùng.

---

# 8. Kiểm chứng — bắt buộc, không phải nên có

Không có hai loại test này thì sau ba tháng bạn có **một preset đúng và ba preset lệch**.

## 8.1 Trang preview — hạ tầng cho cả hai

```
/design-system/preview?preset=enterprise&screen=list&density=compact
```

Route dev-only, render một màn hình mẫu với dữ liệu **tĩnh cố định** (không random, không `Date.now()` — ảnh phải giống nhau mọi lần chạy).

`screen` ∈ `list · detail · form · grid-entry · dashboard · login`

## 8.2 Visual regression

```ts
// apps/web/e2e/visual-presets.spec.ts
const SCREENS = ['list', 'detail', 'form', 'grid-entry', 'dashboard', 'login'] as const;

for (const preset of Object.keys(PRESETS)) {
  for (const screen of SCREENS) {
    test(`${preset} · ${screen}`, async ({ page }) => {
      await page.goto(`/design-system/preview?preset=${preset}&screen=${screen}`);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot(`${preset}-${screen}.png`, {
        maxDiffPixelRatio: 0.01,
        animations: 'disabled',
      });
    });
  }
}
```

GĐ A: 6 ảnh. GĐ D: **24 ảnh**. Sửa một token mà lệch preset khác → CI hiện diff ảnh.

**Đây là thứ duy nhất khiến bốn preset chịu được về lâu dài.**

## 8.3 A11y theo từng preset

```ts
for (const preset of Object.keys(PRESETS)) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${preset}/${theme} đạt WCAG AA`, async ({ page }) => {
      await page.goto(`/design-system/preview?preset=${preset}&theme=${theme}`);
      const r = await new AxeBuilder({ page }).withTags(['wcag2aa']).analyze();
      expect(r.violations).toEqual([]);
    });
  }
}
```

Mỗi preset mới là một cơ hội tự phá accessibility. **4 tổ hợp** ở GĐ B, **8 tổ hợp** ở GĐ D.

Đây là **preset regression** (§3.2) — dùng `brandHue` mặc định. Nó **không** thay cho **brand regression** mà từng dự án phải tự chạy sau khi đặt `brandHue` riêng.

## 8.4 Checklist a11y thủ công

- [ ] Focus visible ở mọi phần tử tương tác
- [ ] **Không dùng màu là dấu hiệu DUY NHẤT** — trạng thái phải có icon/chữ kèm badge
- [ ] Tương phản chữ ≥ 4.5:1, chữ lớn ≥ 3:1
- [ ] Dialog focus trap + `Esc` đúng ngữ nghĩa
- [ ] `aria-label` cho button chỉ có icon
- [ ] `aria-describedby` nối lỗi form với input
- [ ] `prefers-reduced-motion`
- [ ] Vùng bấm ≥ 32px (compact) / 40px (comfortable)

Mục 2 quan trọng nhất: **8% nam giới mù màu đỏ-lục** — badge "Duyệt" xanh và "Từ chối" đỏ mà không có icon thì họ không phân biệt được.

---

# 9. Thư mục

```
apps/web/src/
├── config/
│   └── project-ui.ts              ← FILE DUY NHẤT sửa khi khởi tạo dự án
├── design-system/
│   ├── tokens/
│   │   ├── primitive.css
│   │   ├── semantic.css
│   │   └── component.css
│   ├── presets/                   ← TypeScript, KHÔNG có themes/*.css
│   │   ├── enterprise.ts          ← GĐ A
│   │   └── operations.ts          ← GĐ B
│   ├── derive-tokens.ts           ← behavior → CSS var (§4.2)
│   ├── layouts/
│   │   ├── types.ts               ← ShellProps — chốt ở GĐ A
│   │   ├── app-shell.tsx          ← router
│   │   ├── sidebar-shell.tsx      ← GĐ A
│   │   └── (top-nav|hybrid|workspace)-shell.tsx  ← GĐ D
│   ├── patterns/
│   │   ├── list-drawer/  list-detail/           ← GĐ A (page pattern)
│   │   ├── grid-entry/                          ← GĐ A (là FormLayout, §6)
│   │   └── list-split/  tree-manager/  dashboard/  ← sau pilot
│   ├── state-tones.ts             ← chuyển từ packages/shared
│   ├── registry.ts                ← PRESETS, PAGE_PATTERNS, DISPLAY_TYPES
│   └── use-project-ui.ts
└── app/
    └── design-system/
        └── preview/page.tsx       ← dev-only, cho §8
```

## 9.1 `state-tones.ts` thuộc FE, không thuộc `packages/shared`

`PENDING → warning` là **quyết định trình bày**. Backend không cần biết màu.

```ts
// apps/web/src/design-system/state-tones.ts
import type { OrderState } from '@nexus/shared';   // enum vẫn từ shared

export type Tone = 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'muted';

// ĐÃ kiểm packages/shared/src/state-machines.ts:21 — ORDER_STATES có ĐÚNG 5 giá trị
export const ORDER_STATE_TONE = {
  DRAFT: 'neutral', PENDING: 'warning', APPROVED: 'success',
  REJECTED: 'danger', CANCELLED: 'muted',
} as const satisfies Record<OrderState, Tone>;
```

`satisfies` giữ nguyên lợi ích: thêm trạng thái mới vào `OrderState` mà quên map → **lỗi biên dịch**.

`<StatusBadge>` đọc `statusEmphasis` của preset để quyết badge nhỏ hay lớn — **cùng một component, hai mật độ**.

---

# 10. Di trú từ trạng thái hiện tại

`globals.css` hiện là **một tầng phẳng 56 biến**. Không viết lại từ đầu:

```
Bước 1  Tách globals.css thành 3 file trong tokens/, GIỮ NGUYÊN tên biến
        → import cả 3 vào globals.css → app chạy y như cũ, 0 thay đổi hình ảnh
Bước 2  Thêm alias tầng 2: --surface-page: var(--background) …
        → hai tên cùng tồn tại, chưa sửa component nào
Bước 3  Thêm tầng 3 (--table-row-h, --sidebar-bg …) với giá trị = hiện tại
Bước 4  Sửa component dùng tầng 3, MỖI COMPONENT MỘT PR
        → visual regression bắt ngay nếu lệch
Bước 5  Xoá alias tầng 2 khi không còn ai dùng tên cũ
        → check-token-layers bật ở bước này
```

**Bước 1–3 không đổi một pixel nào.** Đó là điều kiện để visual regression có ích: baseline chụp ở bước 1 phải khớp suốt bước 2–3.

---

# 11. Thứ tự thi công

| GĐ | Nội dung | Thời gian | Nghiệm thu |
|---|---|---|---|
| **A** | 3 tầng token (§3, §10) · `check-token-layers` · `ShellProps` + refactor `SidebarShell` bỏ `useQuery` · `registry.ts` với **1 preset** · 3 cấp config · `keyboardProfile` · `state-tones` sang FE · **`DataTable` đầy đủ** (resize/ghim/đổi thứ tự cột, saved views UI) — **KHÔNG virtualization**, xem §11.4 · `DetailLayout` · `FilterBar` · `grid-entry` · Import/Export UI · trang preview · 6 ảnh baseline · a11y 2 tổ hợp | **~9 ngày** | Enterprise **hoàn chỉnh**, có test, đạt WCAG AA |
| **B** | Preset #2 = **Operations** + **`HybridShell`** (Operations dùng shell này, §1.1) | **~3,5 ngày** | **Phép thử §1.3** với 2 preset · 12 ảnh baseline · 4 tổ hợp a11y |
| **C** | **DỰ ÁN THÍ ĐIỂM** | **~1 tuần** | `FRICTION.md` |
| **D** | **Phân hai nhóm sau pilot — xem §11.3** | **~6 ngày** | 24 ảnh baseline · 8 tổ hợp a11y · **phép thử §1.3 với 4 preset** |

## 11.2b Virtualization KHÔNG thuộc GĐ A

Kiến trúc là **phân trang phía server, `defaultPageSize: 50`**. Render 50 dòng DOM không cần virtualization. Nó chỉ có giá trị khi có hàng trăm–hàng nghìn dòng DOM cùng lúc hoặc infinite scroll.

→ **Chỉ làm khi đo được vấn đề thật.** Giữ GĐ A tập trung vào thứ kiểm chứng được kiến trúc preset.

## 11.3 GĐ D — phân hai nhóm, không làm hết

Sau GĐ C, `FRICTION.md` quyết định nhóm nào:

| Nhóm | Hạng mục | Điều kiện |
|---|---|---|
| **Bắt buộc** | Preset Modern · Preset Executive · `TopNavShell` (Executive cần) · `gen:module` 6 prompt | Đây là đích của hệ preset |
| **Chỉ khi có use case thật** | `workspace` shell · `tree-manager` · `dashboard` pattern · `card-grid` · `compact-list` · `list-split` · virtualization | Chưa có dự án thật chứng minh cần |

`workspace` shell rủi ro cao nhất trong nhóm hai: nghe hợp lý về lý thuyết, nhưng ba panel (nav / main / info) chưa có dự án nào dùng — nên không biết `ShellProps` có đủ hay thiếu slot nào. **Giữ ý tưởng, không implement.**

## 11.1 Vì sao Operations là preset thứ hai — và vì sao `HybridShell` phải vào GĐ B

Operations khác Enterprise ở **toàn bộ trục hành vi**: `density`, `rowHeight`, `actionPlacement`, `statusEmphasis`, **và `shell`**. Nếu cơ chế đỡ được nó thì đỡ được mọi preset. Modern chủ yếu khác **CSS** — không kiểm chứng được gì.

**Nhưng chính vì Operations dùng `shell: 'hybrid'`, GĐ B bắt buộc gồm `HybridShell`.** Bản trước để mọi shell ở GĐ D — nghĩa là GĐ B **không thể** tạo Operations như bảng §1.1 mô tả. Đó là mâu thuẫn trong lộ trình.

Sửa lại:

| Shell | Khi nào | Vì sao |
|---|---|---|
| `sidebar` | GĐ A | Enterprise |
| **`hybrid`** | **GĐ B** | **Operations cần** — và đây là thứ thật sự kiểm chứng `ShellProps` đã đủ chưa |
| `top-nav` | Sau pilot | Executive cần |
| `workspace` | Chỉ khi có use case | Ba panel chưa dự án nào dùng |

Hai shell ở GĐ B là điểm kiểm chứng thật của trừu tượng shell: nếu `ShellProps` thiếu slot thì lộ ra ngay ở đây, không phải sau pilot.

## 11.2 Vì sao chỉ 2 preset trước pilot

Hai là số nhỏ nhất chứng minh cơ chế chạy. Một preset thì registry chỉ là lý thuyết. Ba trở lên trước pilot là **đoán** — sau GĐ C bạn mới biết `ShellProps` đã đủ chưa, `card-grid` thực sự cần gì, generator nên hỏi câu nào.

---

# 12. Cấm

| Cấm | Vì sao |
|---|---|
| **Cơ chế kéo-thả cấu hình layout** | Page builder. Bạn chọn shell **một lần mỗi dự án** — Storybook Controls + trang preview đã đủ |
| **Trình thông dịch JSON layout** | Framework UI thứ hai bên cạnh React, kém mọi mặt: không type-safe, không refactor bằng IDE, không grep, không review |
| Preset override tầng 2 | Đổi nghĩa `primary` theo preset → component vỡ không đoán được |
| Component đọc `PROJECT_UI` trực tiếp | Phải qua `useProjectUI()` để Storybook và trang preview override được |
| Shell tự gọi `useQuery` | Shell thứ hai phải chép lại logic |
| `if (preset === 'x')` rải trong component | Đọc từ `preset.table.rowHeight`, không rẽ nhánh theo id |
| Thêm preset thứ 3 trước GĐ C | Đoán về dự án chưa tồn tại |
| Số màu/spacing rời rạc trong `.tsx` | `check-token-layers` chặn |

---

# 13. Mười sáu điều nếu chỉ nhớ được

1. **Preset khác nhau ở mật độ thông tin, không phải radius** — bảng §1.1
2. **Phép thử §1.3**: 4 ảnh, người ngoài không phân biệt được = thất bại
3. Preset tách **`behavior`** (vận hành) và **`appearance`** (hình thức) — không trộn
4. Ba tầng token; preset **chỉ** đè tầng 3
5. **Một nguồn sự thật**: `behavior` sinh ra `DERIVED_TOKENS`; token derived **cấm viết tay**
6. `ShellProps` chốt ngay dù chỉ có một shell; shell **không** gọi `useQuery`
7. `preset → overrides → userPrefs → resolveProjectUI()`. `useProjectUI()` **chỉ** trả kết quả đã phân giải
8. `keyboardProfile` theo pattern, `Enter` **không** phải luật global
9. Visual regression + a11y per preset là **điều kiện sống**, không phải tuỳ chọn
10. **Hai preset trước pilot, hai preset sau pilot**
11. Registry **không phải backlog** — chỉ khai thứ đã implement hoặc có trong kế hoạch giai đoạn
12. Derive token lúc **SSR**, không phải runtime JS — nếu không màn hình nháy và ảnh regression sai
13. Giá trị phụ thuộc mật độ phải là **`DensityScale<T>`**, không được là scalar
14. `SHELLS` **khớp đúng** `ShellId`; `AppShell` đọc **`ui.behavior.shell`**, không đọc `preset.shell`
15. **Không có `themes/*.css`** — preset là TypeScript
16. OKLCH dự đoán được hơn HSL nhưng **không bảo đảm WCAG** — mỗi `brandHue` dự án phải chạy `test:a11y`

---

# 14. Ghi chú triển khai GĐ A — ba chỗ lệch đặc tả, có chủ đích

Đặc tả trên là bản v1 viết TRƯỚC khi có code. GĐ A triển khai xong và lệch ba
chỗ. Ghi lại ở đây để bản v2 không "sửa ngược" về chỗ cũ.

## 14.1 `table-font-size` · `header-h` · `card-padding` là DERIVED, không FREE

**Mâu thuẫn trong đặc tả.** §4.1 xếp ba token này vào `FreeToken`; §4.1b lại
liệt kê đúng ba token đó trong danh sách phụ thuộc mật độ **và** sinh chúng
trong `deriveTokens`. Một token không thể vừa free vừa derived.

**Chọn theo §4.1b.** §4.1b là mục sửa lỗi của bản trước, và luật *"user đổi
density → MỌI component phụ thuộc mật độ đổi đồng bộ"* mạnh hơn quyền tuỳ biến
của preset. Preset muốn đổi chiều cao header thì đổi qua `density`, không đổi
qua token rời.

`DERIVED_TOKENS` cuối cùng có 12 phần tử; `FreeToken` có 16. Test
`derive-tokens.spec.ts` khoá hai tập này rời nhau và khoá `deriveTokens` phát
ra ĐÚNG tập `DERIVED_TOKENS`.

## 14.2 Màn preview thứ sáu là `states`, không phải `dashboard`

§8.1 liệt kê `dashboard` trong danh sách màn preview, nhưng §6 xếp page pattern
`dashboard` vào nhóm "chỉ khai ID, ném lỗi khi dùng".

Chụp baseline cho một dashboard giả sẽ làm nó **trông như đã có** — đúng thứ §6
gọi là "backlog trá hình". Thay bằng `states`: bốn trạng thái của DataTable
(đang tải / rỗng / không khớp lọc / lỗi). Đó là bề mặt CÓ THẬT, dễ vỡ khi đổi
token, và chưa có gì canh.

Đổi lại thành `dashboard` khi pattern đó được implement ở GĐ D.

## 14.3 Thang `--brand-*` hạ so với §3.2, và dark mode phải lật màu chữ

§3.2 cho thang `0.68 / 0.60 / 0.55 / 0.48`. Chạy `pnpm test:a11y` lần đầu thì
axe đỏ ngay:

| Chỗ | Trước | Sau |
|---|---|---|
| Nút primary, light (`--brand-600` L=0.55) | **4,3:1** ❌ | L=0.50 → **5,75:1** ✅ |
| Nút primary, dark (`--brand-400` + chữ near-white) | **2,54:1** ❌ | chữ lật thành tối → **6,5:1** ✅ |
| Chữ lỗi, dark (`--red-600` L=0.55 trên nền L=0.19) | **3,47:1** ❌ | L=0.70 → **6,38:1** ✅ |
| Badge trạng thái subtle (amber L=0.75 làm màu CHỮ) | **~2,4:1** ❌ | tách `--tone-*-fg` → **7,2:1** ✅ |

Thang mới: `0.70 / 0.58 / 0.50 / 0.42`.

**Bài học đắt nhất, và nó khẳng định đúng §3.2:** OKLCH dự đoán được hơn HSL
nhưng **không** bảo đảm WCAG. Ba trong bốn lỗi trên là lỗi **production**, không
phải lỗi của trang preview — chúng nằm trong `globals.css` và `StatusBadge` từ
trước, chỉ là chưa ai đo.

**Hệ quả cho mọi dự án clone:** mỗi tone cần HAI token — `--tone-x` (màu nền) và
`--tone-x-fg` (màu chữ, đảo sáng/tối theo theme). Một màu không làm được cả hai
việc. Và mỗi lần đổi `brandHue` thì `pnpm test:a11y` là **bắt buộc**, không phải
lời khuyên.

## 14.4 Trang preview đặt `data-theme` lên `<html>`, không lên div bọc

Bẫy CSS thật, mất thời gian nhất trong GĐ A: `--table-header-bg:
var(--surface-sunken)` khai ở `:root` được tính **ngay tại `:root`**, con cháu
kế thừa giá trị đã thay. Đặt `[data-theme='dark']` trên một div con chỉ đổi
`--surface-sunken` cho nhánh đó, còn `--table-header-bg` vẫn giữ giá trị sáng →
chữ sáng trên nền sáng, **1,07:1**.

Đây là minh hoạ cụ thể cho luật ở §8.1: trang preview phải đi **cùng đường** với
app thật. Nó tự dựng theme kiểu khác thì cả ảnh baseline lẫn a11y đều đo nhầm.

## 14.5 Ảnh baseline commit cho HAI nền tảng

Playwright đặt tên ảnh theo nền tảng (`-chromium-linux`, `-chromium-win32`).
CI chạy ubuntu, máy phát triển ở đây là Windows — thiếu bản `-linux` thì CI đỏ
với "snapshot doesn't exist".

Bản `-linux` sinh bằng cách chạy trình duyệt trong Docker
(`mcr.microsoft.com/playwright:v1.62.1-noble`) trong khi Next chạy trên máy
host, nối qua `PW_EXTERNAL_SERVER=1` + `PW_BASE_URL`. Lệnh đầy đủ ở
`docs/cookbook.md`.

Vì cần chạy được trong container không có `node_modules` của repo,
`e2e/visual-presets.spec.ts` đọc danh sách màn từ `screen-ids.ts` — file **không
import gì cả**. Đọc từ `screens.tsx` sẽ kéo cả cây component vào tiến trình
Playwright chỉ để biết sáu cái tên.
