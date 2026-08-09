/**
 * TẦNG 1 — CANARY (C0.0).
 *
 * Giá trị KHÔNG THỂ xuất hiện hợp lệ. Không cần biết trước lỗi nằm ở đâu: chỉ
 * cần một chuỗi mà nếu nó đi ra khỏi hệ thống thì chắc chắn có chuyện.
 *
 * Đây là tầng đầu tiên và giá trị cao nhất, vì nó bắt được loại lỗi mà nhìn
 * bằng mắt KHÔNG BAO GIỜ thấy: một dòng của tenant khác lẫn giữa 50 dòng đúng,
 * một cột lương lọt vào file Excel 3.000 dòng.
 */
export const CANARY = {
  /** Tenant B — thấy chuỗi này khi đang đăng nhập A = RÒ RỈ TENANT */
  tenantBCustomer: 'ZZZ-CANARY-TENANT-B-9f3a',
  tenantBOrder: 'ZZZ-ORD-CANARY-B-9f3a',
  /** Vai trò không được xem lương mà thấy số này = RÒ RỈ CỘT */
  salary: '999888777',
  costPrice: '888777666.00',
  /** Xuất hiện ở BẤT KỲ đâu ngoài lúc tạo = RÒ RỈ SECRET */
  webhookSecret: 'whsec_CANARY_7c2e_MUST_NEVER_LEAK',
  globalSetting: 'ZZZ-GLOBAL-CANARY-4b1d',
} as const;

export const ALL_CANARIES: readonly string[] = Object.values(CANARY);

/** Mức của từng canary khi bị lộ — quyết định thứ tự đọc báo cáo */
export const CANARY_SEVERITY: Record<string, 'RO_RI_TENANT' | 'RO_RI_COT' | 'RO_RI_SECRET'> = {
  [CANARY.tenantBCustomer]: 'RO_RI_TENANT',
  [CANARY.tenantBOrder]: 'RO_RI_TENANT',
  [CANARY.salary]: 'RO_RI_COT',
  [CANARY.costPrice]: 'RO_RI_COT',
  [CANARY.webhookSecret]: 'RO_RI_SECRET',
  [CANARY.globalSetting]: 'RO_RI_TENANT',
};

/** Tìm canary trong bất kỳ chuỗi nào — dùng cho body, CSV, log, HTML */
export function findCanaries(haystack: string): string[] {
  return ALL_CANARIES.filter((c) => haystack.includes(c));
}
