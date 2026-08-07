import type { WorkingInterval } from './business-calendar';

/**
 * [DATA SEED] Lễ Việt Nam cho business calendar (§5C.4).
 * ĐÃ CHỐT 2026-08-07: lễ âm lịch (Tết, Giỗ Tổ) là DATA seed theo năm,
 * KHÔNG dùng thư viện âm lịch. Đây là dữ liệu tenant tự sửa được trên UI —
 * lịch nghỉ chính thức mỗi năm do Chính phủ công bố có thể lệch 1-2 ngày,
 * nghiệp vụ đối chiếu và cập nhật, không phải việc của code.
 */

/** Lễ dương lịch lặp hằng năm — 'MM-DD' */
export const VN_RECURRING_HOLIDAYS: ReadonlyArray<{ monthDay: string; name: string }> = [
  { monthDay: '01-01', name: 'Tết Dương lịch' },
  { monthDay: '04-30', name: 'Ngày Giải phóng miền Nam' },
  { monthDay: '05-01', name: 'Quốc tế Lao động' },
  { monthDay: '09-02', name: 'Quốc khánh' },
];

/**
 * Lễ âm lịch theo năm — 'YYYY-MM-DD'.
 * Tết: nghỉ [30 tháng chạp → mùng 4] quanh mùng 1 (5 ngày, xấp xỉ luật hiện hành).
 * Sau 2030: bổ sung data — job nhắc ở GĐ9 system operations.
 */
export const VN_LUNAR_HOLIDAYS: ReadonlyArray<{ date: string; name: string }> = [
  // Tết Nguyên đán (mùng 1: 17/02/2026)
  { date: '2026-02-16', name: 'Tết Nguyên đán' },
  { date: '2026-02-17', name: 'Tết Nguyên đán' },
  { date: '2026-02-18', name: 'Tết Nguyên đán' },
  { date: '2026-02-19', name: 'Tết Nguyên đán' },
  { date: '2026-02-20', name: 'Tết Nguyên đán' },
  { date: '2026-04-26', name: 'Giỗ Tổ Hùng Vương' },
  // (mùng 1: 06/02/2027)
  { date: '2027-02-05', name: 'Tết Nguyên đán' },
  { date: '2027-02-06', name: 'Tết Nguyên đán' },
  { date: '2027-02-07', name: 'Tết Nguyên đán' },
  { date: '2027-02-08', name: 'Tết Nguyên đán' },
  { date: '2027-02-09', name: 'Tết Nguyên đán' },
  { date: '2027-04-15', name: 'Giỗ Tổ Hùng Vương' },
  // (mùng 1: 26/01/2028)
  { date: '2028-01-25', name: 'Tết Nguyên đán' },
  { date: '2028-01-26', name: 'Tết Nguyên đán' },
  { date: '2028-01-27', name: 'Tết Nguyên đán' },
  { date: '2028-01-28', name: 'Tết Nguyên đán' },
  { date: '2028-01-29', name: 'Tết Nguyên đán' },
  { date: '2028-04-04', name: 'Giỗ Tổ Hùng Vương' },
  // (mùng 1: 13/02/2029)
  { date: '2029-02-12', name: 'Tết Nguyên đán' },
  { date: '2029-02-13', name: 'Tết Nguyên đán' },
  { date: '2029-02-14', name: 'Tết Nguyên đán' },
  { date: '2029-02-15', name: 'Tết Nguyên đán' },
  { date: '2029-02-16', name: 'Tết Nguyên đán' },
  { date: '2029-04-23', name: 'Giỗ Tổ Hùng Vương' },
  // (mùng 1: 03/02/2030)
  { date: '2030-02-02', name: 'Tết Nguyên đán' },
  { date: '2030-02-03', name: 'Tết Nguyên đán' },
  { date: '2030-02-04', name: 'Tết Nguyên đán' },
  { date: '2030-02-05', name: 'Tết Nguyên đán' },
  { date: '2030-02-06', name: 'Tết Nguyên đán' },
  { date: '2030-04-12', name: 'Giỗ Tổ Hùng Vương' },
];

/** Giờ hành chính mặc định: Thứ 2–6, sáng 08:00–12:00 chiều 13:00–17:00 */
export const VN_DEFAULT_WORKING_HOURS: ReadonlyArray<{
  dayOfWeek: number; // ISO 1=Thứ 2 … 7=CN
  intervals: readonly WorkingInterval[];
}> = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  intervals: [
    { from: '08:00', to: '12:00' },
    { from: '13:00', to: '17:00' },
  ],
}));
