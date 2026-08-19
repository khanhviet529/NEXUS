/**
 * Phân loại endpoint danh sách — NGUỒN DUY NHẤT cho các lưới tầng 2 lặp trên
 * route inventory (L16 query-budget, L12a scope-subset).
 *
 * Endpoint danh sách = GET, không tham số đường dẫn, nhận `limit`. Chỉ định
 * TƯỜNG MINH thay vì đoán theo tên (`GET /me` cũng là GET không tham số mà
 * không phải danh sách). GET mới chưa phân loại → l16 "không endpoint danh
 * sách nào bị bỏ sót" ĐỎ và chỉ chỗ sửa.
 */
export const LIST_PATHS = new Set([
  '/api/v1/orders',
  '/api/v1/products',
  '/api/v1/customers',
  '/api/v1/users',
  '/api/v1/org-units',
  '/api/v1/roles',
  '/api/v1/audit-logs',
  '/api/v1/notifications',
  '/api/v1/saved-views',
  '/api/v1/approval-authorities',
  '/api/v1/inventory/balances',
  '/api/v1/webhooks/endpoints',
  '/api/v1/webhooks/deliveries',
]);

/**
 * Danh sách CÁ NHÂN — nội dung phụ thuộc CALLER (hộp thư của tôi, view của
 * tôi), không phải scope hẹp/rộng trên cùng một tập dữ liệu. L12a bỏ qua:
 * "narrow ⊆ broad" vô nghĩa khi narrow và broad nhìn hai tập khác nhau.
 * Cách ly tenant của chúng vẫn được L13/U6 phủ.
 */
export const PERSONAL_LIST_PATHS = new Set(['/api/v1/notifications', '/api/v1/saved-views']);
