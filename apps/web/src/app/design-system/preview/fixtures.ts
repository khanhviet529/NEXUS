/**
 * Dữ liệu TĨNH TUYỆT ĐỐI cho trang preview (fe-preset-system §8.1).
 *
 * KHÔNG `Math.random()`, KHÔNG `new Date()`, KHÔNG id sinh ngẫu nhiên. Ảnh
 * baseline phải giống nhau ở mọi lần chạy; một ký tự đổi là CI đỏ với diff ảnh
 * mà không ai hiểu vì sao — và sau vài lần như thế thì người ta tắt luôn
 * visual regression, tức là mất thứ duy nhất giữ được bốn preset về lâu dài.
 */
export interface PreviewOrder {
  id: string;
  code: string;
  customer: string;
  createdAt: string;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  quantity: string;
  total: string;
}

export const PREVIEW_ORDERS: PreviewOrder[] = [
  { id: '1', code: 'DH-2026-0001', customer: 'Công ty TNHH Minh Anh', createdAt: '2026-01-05', status: 'APPROVED', quantity: '120', total: '48500000' },
  { id: '2', code: 'DH-2026-0002', customer: 'Cửa hàng Bách Hoá Sài Gòn', createdAt: '2026-01-05', status: 'PENDING', quantity: '18', total: '3200000' },
  { id: '3', code: 'DH-2026-0003', customer: 'Công ty CP Thương mại Đại Phát', createdAt: '2026-01-06', status: 'DRAFT', quantity: '4', total: '760000' },
  { id: '4', code: 'DH-2026-0004', customer: 'Siêu thị Hoàng Gia', createdAt: '2026-01-06', status: 'REJECTED', quantity: '52', total: '19400000' },
  { id: '5', code: 'DH-2026-0005', customer: 'Nhà thuốc Tâm Đức', createdAt: '2026-01-07', status: 'CANCELLED', quantity: '9', total: '1150000' },
  { id: '6', code: 'DH-2026-0006', customer: 'Công ty TNHH Vận tải Bắc Nam', createdAt: '2026-01-07', status: 'APPROVED', quantity: '240', total: '96000000' },
  { id: '7', code: 'DH-2026-0007', customer: 'Xưởng in Thành Công', createdAt: '2026-01-08', status: 'PENDING', quantity: '31', total: '7250000' },
  { id: '8', code: 'DH-2026-0008', customer: 'Công ty CP Xây dựng Hòa Bình', createdAt: '2026-01-08', status: 'APPROVED', quantity: '86', total: '31800000' },
  { id: '9', code: 'DH-2026-0009', customer: 'Hộ kinh doanh Lê Văn Sáu', createdAt: '2026-01-09', status: 'DRAFT', quantity: '2', total: '410000' },
  { id: '10', code: 'DH-2026-0010', customer: 'Công ty TNHH Dược phẩm An Khang', createdAt: '2026-01-09', status: 'APPROVED', quantity: '145', total: '58900000' },
  { id: '11', code: 'DH-2026-0011', customer: 'Đại lý Phân bón Miền Tây', createdAt: '2026-01-10', status: 'PENDING', quantity: '400', total: '142000000' },
  { id: '12', code: 'DH-2026-0012', customer: 'Công ty CP Thực phẩm Sạch', createdAt: '2026-01-10', status: 'APPROVED', quantity: '67', total: '22350000' },
];

export interface PreviewLine {
  key: string;
  product: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRate: string;
  amount: string;
}

export const PREVIEW_LINES: PreviewLine[] = [
  { key: 'l1', product: 'SP-001 · Bút bi Thiên Long TL-027', quantity: '100', unitPrice: '4500', discountPercent: '0', taxRate: '10', amount: '495000' },
  { key: 'l2', product: 'SP-014 · Vở kẻ ngang 200 trang', quantity: '50', unitPrice: '12000', discountPercent: '5', taxRate: '10', amount: '627000' },
  { key: 'l3', product: 'SP-102 · Giấy A4 Double A 70gsm', quantity: '20', unitPrice: '78000', discountPercent: '0', taxRate: '10', amount: '1716000' },
];
