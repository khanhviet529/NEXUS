import { describe, it, expect } from 'vitest';
import {
  addWorkingDays,
  isWorkingDay,
  isoDayOfWeek,
  workingMinutesBetween,
  VN_DEFAULT_WORKING_HOURS,
  type CalendarConfig,
} from '@nexus/shared';

/**
 * GĐ7d — unit test hàm thuần business calendar (§5C.4).
 * Tiêu chí đóng GĐ7 (§10): "addWorkingDays() tính đúng lễ Việt Nam".
 * Fixture Tết 2026: mùng 1 = 17/02/2026, nghỉ 16–20/02 (5 ngày, theo seed).
 */
const CAL: CalendarConfig = {
  workingHours: Object.fromEntries(
    VN_DEFAULT_WORKING_HOURS.map((d) => [d.dayOfWeek, d.intervals]),
  ),
  holidays: new Set([
    '2026-02-16',
    '2026-02-17',
    '2026-02-18',
    '2026-02-19',
    '2026-02-20',
    '2026-04-26', // Giỗ Tổ (CN — trùng cuối tuần)
  ]),
  recurringHolidays: new Set(['01-01', '04-30', '05-01', '09-02']),
};

describe('GĐ7d — business calendar thuần (§5C.4)', () => {
  it('isoDayOfWeek: 2026-02-13 là Thứ 6 (5), 2026-02-15 là CN (7)', () => {
    expect(isoDayOfWeek('2026-02-13')).toBe(5);
    expect(isoDayOfWeek('2026-02-15')).toBe(7);
  });

  it('isWorkingDay: T6 thường ✓; CN ✗; mùng 1 Tết ✗; lễ recurring 01-01 ✗ mọi năm', () => {
    expect(isWorkingDay('2026-02-13', CAL)).toBe(true);
    expect(isWorkingDay('2026-02-15', CAL)).toBe(false); // CN
    expect(isWorkingDay('2026-02-17', CAL)).toBe(false); // mùng 1 Tết
    expect(isWorkingDay('2026-01-01', CAL)).toBe(false); // Tết dương (recurring)
    expect(isWorkingDay('2027-01-01', CAL)).toBe(false); // recurring áp MỌI năm — nhưng 2027-01-01 là T6
    expect(isWorkingDay('2026-04-30', CAL)).toBe(false); // 30/4 (T5)
  });

  it('addWorkingDays QUA TẾT: T6 13/02 + 1 ngày làm việc → T2 23/02 (bỏ 2 cuối tuần + 5 ngày Tết)', () => {
    expect(addWorkingDays('2026-02-13', 1, CAL)).toBe('2026-02-23');
  });

  it('addWorkingDays lùi: 23/02 - 1 → 13/02 (đối xứng)', () => {
    expect(addWorkingDays('2026-02-23', -1, CAL)).toBe('2026-02-13');
  });

  it('addWorkingDays thường: T2 02/03 + 3 → T5 05/03; +5 → T2 09/03 (qua cuối tuần)', () => {
    expect(addWorkingDays('2026-03-02', 3, CAL)).toBe('2026-03-05');
    expect(addWorkingDays('2026-03-02', 5, CAL)).toBe('2026-03-09');
  });

  it('addWorkingDays qua lễ dương recurring: 31/12/2025 + 1 → 02/01/2026 (01-01 nghỉ)', () => {
    expect(addWorkingDays('2025-12-31', 1, CAL)).toBe('2026-01-02');
  });

  it('workingMinutesBetween trong 1 ngày: 09:00→15:00 = 300 phút (180 sáng + 120 chiều)', () => {
    expect(workingMinutesBetween('2026-03-02T09:00', '2026-03-02T15:00', CAL)).toBe(300);
  });

  it('workingMinutesBetween nhiều ngày qua Tết: T6 13/02 14:00 → T2 23/02 09:00 = 240 phút', () => {
    // T6: 14:00–17:00 = 180'; 14–22/02 toàn nghỉ; T2 23: 08:00–09:00 = 60'
    expect(workingMinutesBetween('2026-02-13T14:00', '2026-02-23T09:00', CAL)).toBe(240);
  });

  it('workingMinutesBetween from ≥ to → 0; giờ nghỉ trưa không tính', () => {
    expect(workingMinutesBetween('2026-03-02T15:00', '2026-03-02T09:00', CAL)).toBe(0);
    expect(workingMinutesBetween('2026-03-02T12:00', '2026-03-02T13:00', CAL)).toBe(0);
  });

  it('calendar toàn ngày nghỉ → ném lỗi thay vì treo vô hạn', () => {
    const empty: CalendarConfig = {
      workingHours: {},
      holidays: new Set(),
      recurringHolidays: new Set(),
    };
    expect(() => addWorkingDays('2026-01-01', 1, empty)).toThrow();
  });

  it('days không nguyên → ném lỗi', () => {
    expect(() => addWorkingDays('2026-01-01', 1.5, CAL)).toThrow();
  });
});
