/**
 * [CORE] Registry hệ preset — fe-preset-system §4, §6.
 *
 * Nguyên tắc gốc (§1): preset khác nhau ở MẬT ĐỘ THÔNG TIN, không phải ở
 * bo góc. Nên `behavior` là nguồn sự thật và CSS var derive từ nó (§4.2);
 * `appearance` chỉ chứa token hình thức không suy ra được từ hành vi.
 *
 * Registry KHÔNG phải backlog (§6): chỉ khai thứ đã implement hoặc nằm
 * trong kế hoạch giai đoạn hiện tại. Khai thừa thì người đọc tưởng có sẵn
 * và agent tưởng được phép dùng.
 */

import { SHELL_IDS } from './shell-ids';

/**
 * CHỈ shell ĐÃ implement (§5.2 luật 1). Mở rộng union và thêm entry vào
 * `SHELLS` phải nằm TRONG CÙNG PR với phần implement — nếu không thì
 * `overrides.shell = 'x'` biên dịch được rồi chết lúc chạy.
 * `top-nav` và `workspace` CHƯA có ở đây, đúng chủ ý (§11.3).
 */
export type ShellId = (typeof SHELL_IDS)[number];
export type Density = 'compact' | 'comfortable';
export type ContentWidth = 'fluid' | { max: number };
export type ListDisplayType = 'table' | 'card-grid' | 'compact-list';
export type FormLayout = 'single-column' | 'two-column' | 'sections' | 'grid-entry';
export type KeyboardProfile = 'standard' | 'data-entry';
export type ActionPlacement = 'toolbar' | 'row-hover' | 'row-always';
export type StatusEmphasis = 'subtle' | 'strong';

/**
 * Mọi giá trị PHỤ THUỘC MẬT ĐỘ phải mang hình dạng này, không được là scalar (§4.1b).
 *
 * `density` là trục người dùng đổi được (cấp 3). Nếu rowHeight là số cố định
 * thì bật comfortable sẽ đổi chiều cao input, khoảng cách form, bề rộng
 * sidebar — nhưng KHÔNG đổi chiều cao dòng bảng, tức là thứ người dùng nhìn
 * thấy rõ nhất đứng yên. Toggle density thành công tắc mỹ phẩm không đáng tin.
 */
export type DensityScale<T> = Record<Density, T>;

/**
 * SINH TỰ ĐỘNG từ behavior (deriveTokens). CẤM đặt trong `appearance.tokens`
 * và CẤM viết tay trong file CSS nào — hai nguồn cho một component là mầm lỗi.
 *
 * Danh sách này = danh sách token phụ thuộc mật độ ở §4.1b, cộng ba token
 * suy từ `zebra`/`statusEmphasis`.
 *
 * ⚠ Chốt một mâu thuẫn nội bộ của đặc tả: §4.1 xếp `table-font-size`,
 * `header-h`, `card-padding` vào `FreeToken`, nhưng §4.1b lại liệt kê đúng
 * ba token đó trong danh sách phụ thuộc mật độ và sinh chúng trong
 * `deriveTokens`. Một token không thể vừa free vừa derived. Chọn theo §4.1b
 * vì đó là mục sửa lỗi của bản trước và vì luật "user đổi density → MỌI
 * component phụ thuộc mật độ đổi đồng bộ" mạnh hơn quyền tuỳ biến của preset.
 */
export const DERIVED_TOKENS = [
  'table-row-h',
  'table-font-size',
  'table-zebra',
  'sidebar-w',
  'header-h',
  'toolbar-h',
  'input-h',
  'button-h',
  'form-row-gap',
  'card-padding',
  'badge-font-size',
  'badge-padding',
] as const;

export type DerivedToken = (typeof DERIVED_TOKENS)[number];

/**
 * Chỉ preset đặt được, KHÔNG derive từ behavior.
 *
 * Union ĐÓNG: gõ sai tên là lỗi biên dịch, và vì không token derived nào có
 * mặt ở đây nên đặt chúng trong `tokens{}` cũng là lỗi biên dịch — không phải
 * dựa vào kỷ luật.
 */
export type FreeToken =
  | 'table-header-bg'
  | 'table-row-hover'
  | 'table-row-selected'
  | 'table-viewport-h'
  | 'sidebar-bg'
  | 'sidebar-fg'
  | 'sidebar-item-hover'
  | 'sidebar-item-active'
  | 'header-bg'
  | 'card-radius'
  | 'card-shadow'
  | 'card-border'
  | 'dialog-radius'
  | 'dialog-shadow'
  | 'badge-radius'
  | 'form-label-w';

export interface PresetBehavior {
  shell: ShellId;
  density: Density;
  contentWidth: ContentWidth;
  table: {
    rowHeight: DensityScale<number>;
    defaultPageSize: number;
    zebra: boolean;
    stickyFirstColumn: boolean;
    actionPlacement: ActionPlacement;
  };
  defaultListDisplay: ListDisplayType;
  defaultFormLayout: FormLayout;
  keyboardProfile: KeyboardProfile;
  statusEmphasis: StatusEmphasis;
}

export interface VisualPreset {
  id: string;
  label: string;
  description: string;
  /** CÁCH APP VẬN HÀNH — nguồn sự thật duy nhất, CSS var derive từ đây */
  behavior: PresetBehavior;
  /** APP TRÔNG NHƯ THẾ NÀO — chỉ token TỰ DO */
  appearance: {
    /** OKLCH chroma. Hue do project quyết (brandHue) — cùng hue, hai chroma
     *  cho hai cảm giác: Enterprise trầm, Modern tươi. */
    brandChroma: number;
    tokens: Partial<Record<FreeToken, string>>;
  };
}

import { enterprise } from './presets/enterprise';
import { operations } from './presets/operations';

export const PRESETS = {
  enterprise,
  operations,
} satisfies Record<string, VisualPreset>;

/**
 * DERIVE từ registry — không thể quên đồng bộ type với dữ liệu.
 *
 * Viết `satisfies Record<PresetId, …>` với `PresetId = keyof typeof PRESETS`
 * sẽ là type tự tham chiếu, TypeScript không giải được. Cách này giữ được
 * kiểm tra hình dạng từng preset VÀ sinh PresetId tự động (§4.4).
 */
export type PresetId = keyof typeof PRESETS;

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

/**
 * Page pattern — §6. `implemented: false` nghĩa là ĐÃ có trong kế hoạch GĐ D,
 * chưa dùng được; `assertPagePattern` ném lỗi rõ ràng thay vì render sai.
 *
 * `grid-entry` KHÔNG có ở đây: nó là FormLayout, không phải page pattern.
 * Đơn hàng = pagePattern 'list-detail' + formLayout 'grid-entry'.
 */
export const PAGE_PATTERNS = {
  'list-drawer': { label: 'List + Drawer sửa', needsDetail: false, implemented: true },
  'list-detail': { label: 'List + Trang chi tiết', needsDetail: true, implemented: true },
  'list-split': { label: 'List + Split view', needsDetail: true, implemented: false },
  'tree-manager': { label: 'Cây + chi tiết', needsDetail: true, implemented: false },
  dashboard: { label: 'Dashboard', needsDetail: false, implemented: false },
  wizard: { label: 'Wizard nhiều bước', needsDetail: false, implemented: false },
} as const;

export type PagePatternId = keyof typeof PAGE_PATTERNS;

export function assertPagePattern(id: PagePatternId): void {
  if (!PAGE_PATTERNS[id].implemented) {
    throw new Error(
      `Page pattern "${id}" mới chỉ khai ID, chưa implement (fe-preset-system §6). ` +
        `Dùng 'list-drawer' hoặc 'list-detail', hoặc implement nó trong cùng PR.`,
    );
  }
}

/** DISPLAY_TYPES — khai 3, implement `table` trước (§6). */
export const DISPLAY_TYPES = {
  table: { label: 'Bảng', implemented: true },
  'card-grid': { label: 'Lưới thẻ', implemented: false },
  'compact-list': { label: 'Danh sách gọn', implemented: false },
} as const;

/** Cấu hình cấp 1 — file `config/project-ui.ts` là nơi DUY NHẤT khai (§2.3). */
export interface ProjectUIConfig {
  preset: PresetId;
  /** OKLCH hue 0-360. Chroma do preset quyết (§3.2). */
  brandHue: number;
  /** Override CÓ CHỦ ĐÍCH. Chỉ ba trục này — thêm trục nữa là preset mất ý nghĩa. */
  overrides?: {
    shell?: ShellId;
    density?: Density;
    contentWidth?: ContentWidth;
  };
}

/** Cấu hình cấp 3 — người dùng đổi, lưu ở `user_preferences` (§2). */
export interface UserUIPrefs {
  density?: Density;
  theme?: 'light' | 'dark';
  sidebarMode?: 'expanded' | 'compact' | 'icon';
}

export interface ResolvedUI {
  preset: PresetId;
  brandHue: number;
  behavior: PresetBehavior;
  appearance: VisualPreset['appearance'];
  sidebarMode: 'expanded' | 'compact' | 'icon';
}
