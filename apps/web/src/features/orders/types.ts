/**
 * Kiểu row đơn hàng cho FE — BE trả object plain (orval sinh void vì
 * controller chưa khai ApiOkResponse chi tiết; ghi nợ ở progress.md).
 * Tiền là CHUỖI (§3.7), FE không bao giờ parse thành float để tính.
 */
export interface OrderRow {
  id: string;
  code: string;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  currency: string;
  customer?: { id: string; code: string; name: unknown } | null;
  total: string;
  margin?: string | null;
  version: number;
  createdById: string | null;
  createdAt: string;
}

export interface OrderListResponse {
  data: OrderRow[];
  meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean };
}

export interface OrderActionCtx {
  record: OrderRow;
  meId: string | undefined;
}
