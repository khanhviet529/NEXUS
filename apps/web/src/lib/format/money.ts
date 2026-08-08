/**
 * Format tiền cho HIỂN THỊ — §3.7: giá trị luôn là CHUỖI decimal, FE không
 * bao giờ parse float để TÍNH (tính toán dùng calculateMoney từ @nexus/shared).
 * Format ở đây chỉ chèn dấu phân cách nghìn cho phần nguyên.
 */
export function formatMoney(value: string | null | undefined): string {
  if (!value) return '0';
  const [intPart, decPart] = String(value).split('.');
  const grouped = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dec = decPart?.replace(/0+$/, '');
  return dec ? `${grouped},${dec}` : grouped;
}

/** Bỏ phân cách hiển thị → chuỗi decimal chuẩn cho BE ('1.234.567,5' → '1234567.5') */
export function parseMoneyInput(display: string): string {
  return display.trim().replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.]/g, '');
}
