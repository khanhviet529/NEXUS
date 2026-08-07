import { describe, it, expect } from 'vitest';
import { calculateMoney, type MoneyConfig } from '@nexus/shared';

/**
 * Test §8.2 #16 — GOLDEN TESTS bộ tính tiền B1:
 * chiết khấu trước/sau VAT, làm tròn dòng vs hoá đơn, nhiều mức thuế,
 * phân bổ chiết khấu tổng. Số kỳ vọng TÍNH TAY, đặt cứng.
 */
describe('B1 — bộ tính tiền (§8.2 #16)', () => {
  const cfg = (over: Partial<MoneyConfig> = {}): MoneyConfig => ({
    discountBeforeTax: true,
    roundingMode: 'line',
    roundTo: 1,
    ...over,
  });

  it('một dòng đơn giản: 2 × 100.000, VAT 10% → 220.000', () => {
    const r = calculateMoney([{ quantity: '2', unitPrice: '100000', taxRate: '10' }], cfg());
    expect(r.lines[0]!.gross).toBe('200000.00');
    expect(r.taxTotal).toBe('20000.00');
    expect(r.total).toBe('220000.00');
  });

  it('chiết khấu TRƯỚC VAT: 100.000 -10% → thuế trên 90.000', () => {
    const r = calculateMoney(
      [{ quantity: '1', unitPrice: '100000', discountPercent: '10', taxRate: '10' }],
      cfg({ discountBeforeTax: true }),
    );
    expect(r.lines[0]!.net).toBe('90000.00');
    expect(r.taxTotal).toBe('9000.00'); // 10% của 90.000
    expect(r.total).toBe('99000.00');
  });

  it('chiết khấu SAU VAT: thuế trên gross 100.000 — LỆCH với case trước đúng 1.000', () => {
    const r = calculateMoney(
      [{ quantity: '1', unitPrice: '100000', discountPercent: '10', taxRate: '10' }],
      cfg({ discountBeforeTax: false }),
    );
    expect(r.taxTotal).toBe('10000.00'); // 10% của 100.000 (gross)
    expect(r.total).toBe('100000.00'); // 90.000 + 10.000
  });

  it('làm tròn TỪNG DÒNG vs CẢ HOÁ ĐƠN — lệch 1 đồng kinh điển', () => {
    // 3 dòng × 33.33 gross, VAT 8%: mỗi dòng 35.9964
    const lines = Array.from({ length: 3 }, () => ({
      quantity: '1',
      unitPrice: '33.33',
      taxRate: '8',
    }));

    const perLine = calculateMoney(lines, cfg({ roundingMode: 'line', roundTo: 1 }));
    // mỗi dòng tròn 36 → tổng 108, KHÔNG có điều chỉnh
    expect(perLine.lines[0]!.amount).toBe('36.00');
    expect(perLine.total).toBe('108.00');
    expect(perLine.roundingAdjustment).toBe('0.00');

    const perInvoice = calculateMoney(lines, cfg({ roundingMode: 'invoice', roundTo: 1 }));
    // chính xác 107.9892 → tròn 108, điều chỉnh +0.0108
    expect(perInvoice.total).toBe('108.00');
    expect(perInvoice.roundingAdjustment).toBe('0.0108');
  });

  it('làm tròn đến NGHÌN đồng', () => {
    const r = calculateMoney(
      [{ quantity: '1', unitPrice: '123456', taxRate: '10' }],
      cfg({ roundTo: 1000 }),
    );
    // 123.456 + 12.345,6 = 135.801,6 → tròn nghìn = 136.000
    expect(r.total).toBe('136000.00');
  });

  it('NHIỀU MỨC THUẾ một hoá đơn → bảng kê tách theo mức (câu hỏi 6)', () => {
    const r = calculateMoney(
      [
        { quantity: '1', unitPrice: '100000', taxRate: '10' },
        { quantity: '1', unitPrice: '200000', taxRate: '8' },
        { quantity: '1', unitPrice: '50000', taxRate: '0' },
      ],
      cfg(),
    );
    expect(r.taxBreakdown).toEqual([
      { taxRate: '0.00', taxableAmount: '50000.00', taxAmount: '0.00' },
      { taxRate: '8.00', taxableAmount: '200000.00', taxAmount: '16000.00' },
      { taxRate: '10.00', taxableAmount: '100000.00', taxAmount: '10000.00' },
    ]);
    expect(r.taxTotal).toBe('26000.00');
    expect(r.total).toBe('376000.00');
  });

  it('chiết khấu TỔNG phân bổ theo tỉ trọng, dòng cuối nhận phần dư (câu hỏi 5)', () => {
    const r = calculateMoney(
      [
        { quantity: '1', unitPrice: '100000' }, // 1/3
        { quantity: '1', unitPrice: '200000' }, // 2/3
      ],
      cfg({ orderDiscountAmount: '10000' }),
    );
    expect(r.lines[0]!.discount).toBe('3333.3333');
    expect(r.lines[1]!.discount).toBe('6666.6667'); // phần dư — tổng ĐÚNG 10.000
    expect(r.discountTotal).toBe('10000.00');
    expect(r.subtotal).toBe('290000.00');
  });

  it('số lượng thập phân + đơn giá lẻ: 12.5 × 3.333 = 41.6625', () => {
    const r = calculateMoney([{ quantity: '12.5', unitPrice: '3.333' }], cfg({ roundingMode: 'invoice' }));
    expect(r.lines[0]!.gross).toBe('41.6625');
    expect(r.total).toBe('42.00');
  });

  it('tổng các dòng LUÔN khớp tổng hoá đơn khi làm tròn theo dòng (câu hỏi 4)', () => {
    const lines = Array.from({ length: 7 }, (_, i) => ({
      quantity: '3',
      unitPrice: `${1000 + i * 111}.79`,
      discountPercent: '7.5',
      taxRate: i % 2 === 0 ? '10' : '8',
    }));
    const r = calculateMoney(lines, cfg({ roundingMode: 'line' }));
    const sum = r.lines.reduce((s, l) => s + Number(l.amount), 0);
    expect(sum.toFixed(2)).toBe(Number(r.total).toFixed(2));
    expect(r.roundingAdjustment).toBe('0.00');
  });

  it('input rác → ném lỗi rõ ràng, không im lặng ra NaN', () => {
    expect(() => calculateMoney([{ quantity: 'abc', unitPrice: '1' }])).toThrow(/không hợp lệ/);
  });
});
