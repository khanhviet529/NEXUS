/**
 * [CORE nhẹ] Business calendar — spec §5C.4.
 * HÀM THUẦN như money-calculator: đầu vào là config đã nạp từ DB, đầu ra là
 * giá trị — không chạm hạ tầng, unit test dày.
 *
 * Quy ước thời gian: mọi ngày là chuỗi 'YYYY-MM-DD', mọi thời điểm là
 * 'YYYY-MM-DDTHH:mm' NAIVE theo múi giờ của lịch (caller tự convert trước) —
 * tránh toàn bộ lỗi DST/UTC trong tính toán ngày làm việc.
 */

export interface WorkingInterval {
  /** 'HH:mm' */
  from: string;
  to: string;
}

export interface CalendarConfig {
  /** ISO-8601 dayOfWeek 1=Thứ 2 … 7=CN → các khoảng làm việc; thiếu key = ngày nghỉ */
  workingHours: Readonly<Record<number, readonly WorkingInterval[]>>;
  /** Ngày nghỉ cụ thể 'YYYY-MM-DD' (Tết, Giỗ Tổ — seed theo năm) */
  holidays: ReadonlySet<string>;
  /** Ngày nghỉ lặp hằng năm 'MM-DD' (1/1, 30/4, 1/5, 2/9) */
  recurringHolidays: ReadonlySet<string>;
}

const DAY_MS = 86_400_000;

function toUtcDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO dayOfWeek: 1=Thứ 2 … 7=CN */
export function isoDayOfWeek(date: string): number {
  const dow = toUtcDate(date).getUTCDay(); // 0=CN
  return dow === 0 ? 7 : dow;
}

export function isHoliday(date: string, cal: CalendarConfig): boolean {
  return cal.holidays.has(date) || cal.recurringHolidays.has(date.slice(5));
}

/** Ngày làm việc = có khoảng giờ khai cho thứ đó VÀ không phải ngày nghỉ */
export function isWorkingDay(date: string, cal: CalendarConfig): boolean {
  const intervals = cal.workingHours[isoDayOfWeek(date)];
  if (!intervals || intervals.length === 0) return false;
  return !isHoliday(date, cal);
}

/**
 * Cộng n ngày làm việc (n ≠ 0, âm = lùi). Kết quả LUÔN là ngày làm việc.
 * Dùng cho hạn thanh toán, hạn xử lý (§5C.4). Chặn vòng lặp vô hạn khi
 * config toàn ngày nghỉ: quét tối đa 3.660 ngày → ném lỗi.
 */
export function addWorkingDays(date: string, days: number, cal: CalendarConfig): string {
  if (!Number.isInteger(days)) throw new Error('days phải là số nguyên');
  const step = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);
  let cursor = toUtcDate(date);
  let guard = 0;
  while (remaining > 0) {
    if (++guard > 3_660) throw new Error('Calendar không có ngày làm việc trong 10 năm');
    cursor = new Date(cursor.getTime() + step * DAY_MS);
    if (isWorkingDay(toDateString(cursor), cal)) remaining--;
  }
  return toDateString(cursor);
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
}

/**
 * Số phút LÀM VIỆC giữa hai thời điểm naive 'YYYY-MM-DDTHH:mm' (from < to).
 * Đếm phần giao giữa [from, to] và các khoảng làm việc của từng ngày làm việc.
 */
export function workingMinutesBetween(from: string, to: string, cal: CalendarConfig): number {
  const [fromDate, fromTime] = from.split('T') as [string, string];
  const [toDate, toTime] = to.split('T') as [string, string];
  if (from >= to) return 0;

  let total = 0;
  let cursor = toUtcDate(fromDate);
  const end = toUtcDate(toDate);
  let guard = 0;
  while (cursor.getTime() <= end.getTime()) {
    if (++guard > 3_660) throw new Error('Khoảng thời gian vượt 10 năm');
    const day = toDateString(cursor);
    if (isWorkingDay(day, cal)) {
      const dayFrom = day === fromDate ? minutesOf(fromTime) : 0;
      const dayTo = day === toDate ? minutesOf(toTime) : 24 * 60;
      for (const iv of cal.workingHours[isoDayOfWeek(day)] ?? []) {
        const lo = Math.max(dayFrom, minutesOf(iv.from));
        const hi = Math.min(dayTo, minutesOf(iv.to));
        if (hi > lo) total += hi - lo;
      }
    }
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return total;
}
