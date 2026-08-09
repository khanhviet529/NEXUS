import type { VisualPreset } from '../registry';

/**
 * Preset #1 — Enterprise (fe-preset-system §4.4).
 *
 * ERP, kế toán, ngân hàng. Mật độ cao, bàn phím trước, bảng là trung tâm:
 * 28–32 dòng thấy được trên một màn, dòng 32px, action ở toolbar chứ không
 * nấp sau hover.
 *
 * Preset đầu tiên KHÔNG override token tự do nào — nó *là* mặc định của
 * component.css. Preset thứ hai (Operations, GĐ B) mới bắt đầu đè, và chính
 * lúc đó cơ chế được kiểm chứng thật.
 */
export const enterprise = {
  id: 'enterprise',
  label: 'Enterprise',
  description: 'ERP, kế toán, ngân hàng. Mật độ cao, bàn phím trước, bảng là trung tâm.',
  behavior: {
    shell: 'sidebar',
    density: 'compact',
    contentWidth: 'fluid',
    table: {
      // DensityScale, không phải scalar (§4.1b) — user bật comfortable thì
      // dòng bảng phải giãn cùng input và sidebar, không đứng yên.
      rowHeight: { compact: 32, comfortable: 40 },
      defaultPageSize: 50,
      zebra: false,
      stickyFirstColumn: true,
      actionPlacement: 'toolbar',
    },
    defaultListDisplay: 'table',
    defaultFormLayout: 'sections',
    // Người dùng nghiệp vụ VN có phản xạ từ Misa/Fast/Excel: Enter là xuống ô.
    // Form chứng từ submit khi Enter thì họ gửi thiếu dòng mỗi ngày và không
    // bao giờ báo bug — chỉ kết luận phần mềm khó dùng (§7).
    keyboardProfile: 'data-entry',
    statusEmphasis: 'subtle',
  },
  appearance: {
    brandChroma: 0.15,
    tokens: {},
  },
} as const satisfies VisualPreset;
