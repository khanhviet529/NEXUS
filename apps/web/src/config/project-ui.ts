import type { ProjectUIConfig } from '@/design-system/registry';

/**
 * FILE DUY NHẤT sửa khi khởi tạo dự án mới (fe-preset-system §2.3).
 *
 * ⚠ Sau khi đổi `brandHue`, BẮT BUỘC chạy `pnpm test:a11y`. OKLCH dự đoán
 * được hơn HSL nhưng KHÔNG bảo đảm giữ tỉ số tương phản WCAG khi đổi hue —
 * WCAG tính từ relative luminance, không phải từ L của OKLCH. Vùng hue
 * vàng-lục (~70) đặc biệt dễ trượt AA với chữ trắng trên nền brand (§3.2).
 *
 * Muốn Enterprise nhưng dùng bố cục khác:
 *   overrides: { shell: 'top-nav' }   // chỉ ba trục được override
 */
export const PROJECT_UI = {
  preset: 'enterprise',
  brandHue: 258,
} satisfies ProjectUIConfig;
