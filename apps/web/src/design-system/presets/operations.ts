import type { VisualPreset } from '../registry';

/**
 * Preset #2 — Operations (fe-preset-system §1.1, §11.1).
 *
 * Kho, quầy, xưởng. Người dùng đứng, nhìn màn hình từ xa hơn, thao tác lặp
 * hàng trăm lần một ca, và thường đeo găng.
 *
 * Vì sao Operations là preset thứ HAI chứ không phải Modern: nó khác Enterprise
 * ở TOÀN BỘ trục hành vi — `density`, `rowHeight`, `actionPlacement`,
 * `statusEmphasis`, VÀ `shell`. Cơ chế đỡ được nó thì đỡ được mọi preset. Modern
 * chủ yếu khác CSS nên không kiểm chứng được gì (§11.1).
 *
 * Từng lựa chọn dưới đây đều suy ra từ bảng trục §1.1, không phải khẩu vị:
 */
export const operations = {
  id: 'operations',
  label: 'Operations',
  description: 'Kho, quầy, xưởng. Dòng thưa hơn, action luôn hiện, trạng thái đọc được từ xa.',
  behavior: {
    // Hàng trên là nhóm chức năng, cột trái là mục con: người vận hành ở lì
    // trong MỘT nhóm suốt ca, nên cột trái nên dành hết cho mục họ bấm liên tục
    shell: 'hybrid',
    // 20–24 dòng/màn (§1.1) — thưa hơn Enterprise 28–32
    density: 'comfortable',
    contentWidth: 'fluid',
    table: {
      rowHeight: { compact: 34, comfortable: 40 },
      defaultPageSize: 25,
      // Vạch phân dòng: đọc chéo bảng từ khoảng cách xa thì mắt dễ trượt dòng
      zebra: true,
      stickyFirstColumn: true,
      // "Nút to + phím tắt" (§1.1). KHÔNG dùng row-hover: đeo găng và dùng màn
      // cảm ứng thì không có trạng thái hover để mà hiện
      actionPlacement: 'row-always',
    },
    defaultListDisplay: 'table',
    // Việc chính là nhập chứng từ liên tục, không phải điền form hành chính
    defaultFormLayout: 'grid-entry',
    keyboardProfile: 'data-entry',
    // "Badge lớn, màu đậm" (§1.1) — trạng thái phải đọc được khi không đứng
    // sát màn hình
    statusEmphasis: 'strong',
  },
  appearance: {
    // Chroma cao hơn Enterprise (0,15): màn hình xưởng thường sáng chói và ám
    // bụi, màu nhạt biến mất
    brandChroma: 0.19,
    /**
     * Preset ĐẦU TIÊN đè token tự do — và đây chính là lúc cơ chế được kiểm
     * chứng (§4.4). Chỉ token trong `FreeToken`; đụng tới token derived là lỗi
     * biên dịch, không phải chuyện kỷ luật.
     */
    tokens: {
      // Thanh điều hướng mang màu thương hiệu thay vì xám than: ở hybrid nó
      // nằm ngang phía trên, là thứ định vị người dùng đang ở nhóm nào
      'sidebar-bg': 'var(--brand-700)',
      'sidebar-fg': 'var(--color-primary-fg)',
      'sidebar-item-active': 'var(--brand-500)',
      'sidebar-item-hover': 'var(--brand-600)',
      // Header bảng nổi hơn nền để phân biệt được khi liếc nhanh
      'table-header-bg': 'var(--surface-raised)',
      'table-viewport-h': '80vh',
      // Góc và bóng: giữ vuông vức như Enterprise (§1.1 dòng cuối) — đây là
      // hai dòng CUỐI của bảng trục, không phải hai dòng đầu
      'card-radius': '4px',
      'card-shadow': 'var(--shadow-none)',
      'badge-radius': '4px',
      'form-label-w': '150px',
    },
  },
} as const satisfies VisualPreset;
