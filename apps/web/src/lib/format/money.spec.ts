import { describe, it, expect } from 'vitest';
import { formatMoney, parseMoneyInput } from './money';

/**
 * TẦNG 1 (mẫu) — unit thuần, không DOM. Rẻ nhất, chạy nhiều nhất.
 * §3.7: tiền là CHUỖI, FE không parse float để tính.
 */
describe('format/money — tầng 1: unit thuần', () => {
  it('chèn phân cách nghìn, giữ nguyên phần thập phân có nghĩa', () => {
    expect(formatMoney('1234567')).toBe('1.234.567');
    expect(formatMoney('1234567.50')).toBe('1.234.567,5');
    expect(formatMoney('999')).toBe('999');
  });

  it('rỗng/null → "0", không NaN', () => {
    expect(formatMoney(null)).toBe('0');
    expect(formatMoney(undefined)).toBe('0');
    expect(formatMoney('')).toBe('0');
  });

  it('KHÔNG mất chữ số ở số lớn (float sẽ làm tròn ở đây)', () => {
    const big = '9007199254740993'; // > Number.MAX_SAFE_INTEGER
    expect(formatMoney(big)).toBe('9.007.199.254.740.993');
  });

  it('parseMoneyInput: hiển thị VN → chuỗi decimal chuẩn cho BE', () => {
    expect(parseMoneyInput('1.234.567,5')).toBe('1234567.5');
    expect(parseMoneyInput(' 1.000 ')).toBe('1000');
    expect(parseMoneyInput('12a3')).toBe('123');
  });
});
