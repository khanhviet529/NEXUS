/**
 * [CORE] B1 — Bộ tính tiền: thuế, chiết khấu, làm tròn (spec §5B.2/B1).
 *
 * MODULE THUẦN: không phụ thuộc hạ tầng, không I/O — unit test dày (#16).
 * "Tuyệt đối không rải công thức trong service."
 *
 * Sáu câu hỏi B1 được tham số hoá trong MoneyConfig — mỗi dự án CHỐT BẰNG
 * VĂN BẢN rồi khai config, không sửa code:
 *   1. Chiết khấu trước hay sau VAT?           → discountBeforeTax
 *   2. Làm tròn từng dòng hay cả hoá đơn?      → roundingMode
 *   3. Làm tròn đến đơn vị nào?                → roundTo (1 = đồng, 1000 = nghìn)
 *   4. Tổng dòng đã tròn ≠ tổng hoá đơn tròn?  → dòng "điều chỉnh làm tròn" (roundingAdjustment)
 *   5. Chiết khấu tổng phân bổ về dòng?        → allocateOrderDiscount (theo tỉ trọng)
 *   6. Nhiều mức thuế một hoá đơn?             → taxBreakdown tách theo mức
 *
 * Số học: dùng số nguyên "phần vạn" (×10000) cho phép nhân chia trung gian
 * để tránh sai số nhị phân của float ở ngưỡng làm tròn.
 */

export interface MoneyLineInput {
  /** Chuỗi decimal (§3.7) */
  quantity: string;
  unitPrice: string;
  /** % chiết khấu dòng, 0-100 */
  discountPercent?: string;
  /** % VAT của dòng (0, 5, 8, 10…) */
  taxRate?: string;
}

export interface MoneyConfig {
  /** true: chiết khấu áp TRƯỚC khi tính VAT (mặc định — thông lệ VN) */
  discountBeforeTax: boolean;
  /** 'line': làm tròn từng dòng rồi cộng · 'invoice': cộng chính xác rồi tròn một lần */
  roundingMode: 'line' | 'invoice';
  /** Làm tròn đến: 1 = đồng, 100 = trăm, 1000 = nghìn */
  roundTo: 1 | 100 | 1000;
  /** Chiết khấu TỔNG đơn (số tiền), phân bổ về dòng theo tỉ trọng thành tiền */
  orderDiscountAmount?: string;
}

export interface MoneyLineResult {
  lineNo: number;
  /** trước chiết khấu, trước thuế */
  gross: string;
  discount: string;
  /** sau chiết khấu, trước thuế */
  net: string;
  tax: string;
  /** thành tiền dòng (net + tax), ĐÃ tròn nếu roundingMode = line */
  amount: string;
}

export interface TaxBreakdownEntry {
  taxRate: string;
  taxableAmount: string;
  taxAmount: string;
}

export interface MoneyResult {
  lines: MoneyLineResult[];
  subtotal: string; // Σ net
  discountTotal: string; // Σ chiết khấu (dòng + phân bổ)
  taxTotal: string;
  /** Chênh lệch giữa tổng đã tròn và Σ dòng đã tròn — câu hỏi 4 của B1 */
  roundingAdjustment: string;
  total: string;
  taxBreakdown: TaxBreakdownEntry[]; // câu hỏi 6 — bảng kê thuế theo mức
}

export const DEFAULT_MONEY_CONFIG: MoneyConfig = {
  discountBeforeTax: true,
  roundingMode: 'line',
  roundTo: 1,
};

// ---------- số học phần vạn (scaled integer, 4 chữ số thập phân) ----------
const SCALE = 10_000n;

function toScaled(v: string | undefined, fallback = '0'): bigint {
  const s = (v ?? fallback).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Giá trị decimal không hợp lệ: "${v}"`);
  }
  const [int, frac = ''] = s.split('.');
  const fracPadded = (frac + '0000').slice(0, 4);
  const sign = int!.startsWith('-') ? -1n : 1n;
  const intAbs = BigInt(int!.replace('-', ''));
  return sign * (intAbs * SCALE + BigInt(fracPadded));
}

function fromScaled(v: bigint): string {
  const sign = v < 0n ? '-' : '';
  const abs = v < 0n ? -v : v;
  const int = abs / SCALE;
  const frac = abs % SCALE;
  if (frac === 0n) return `${sign}${int}.00`;
  const fracStr = frac.toString().padStart(4, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${sign}${int}.${fracStr}`;
}

/** chia có làm tròn half-up trên bigint */
function divRound(a: bigint, b: bigint): bigint {
  const sign = a < 0n !== b < 0n ? -1n : 1n;
  const absA = a < 0n ? -a : a;
  const absB = b < 0n ? -b : b;
  return sign * ((absA + absB / 2n) / absB);
}

/** làm tròn về bội của roundTo (half-up) */
function roundScaled(v: bigint, roundTo: number): bigint {
  const unit = BigInt(roundTo) * SCALE;
  return divRound(v, unit) * unit;
}

function pct(v: bigint, percentScaled: bigint): bigint {
  // v × (percent/100) — percent cũng ở thang SCALE
  return divRound(v * percentScaled, 100n * SCALE);
}

// ---------------------------------------------------------------------------

export function calculateMoney(
  inputs: MoneyLineInput[],
  config: MoneyConfig = DEFAULT_MONEY_CONFIG,
): MoneyResult {
  interface Working {
    lineNo: number;
    gross: bigint;
    discount: bigint;
    net: bigint;
    tax: bigint;
    amount: bigint;
    taxRate: bigint;
  }

  // 1. Tính dòng: gross → chiết khấu dòng → net
  const lines: Working[] = inputs.map((input, i) => {
    const qty = toScaled(input.quantity);
    const price = toScaled(input.unitPrice);
    const gross = divRound(qty * price, SCALE);
    const discount = pct(gross, toScaled(input.discountPercent, '0'));
    return {
      lineNo: i + 1,
      gross,
      discount,
      net: gross - discount,
      tax: 0n,
      amount: 0n,
      taxRate: toScaled(input.taxRate, '0'),
    };
  });

  // 2. Phân bổ chiết khấu TỔNG về dòng theo tỉ trọng net (câu hỏi 5)
  //    Dòng cuối nhận phần dư — tổng phân bổ LUÔN khớp đúng số nhập
  const orderDiscount = toScaled(config.orderDiscountAmount, '0');
  if (orderDiscount > 0n) {
    const totalNet = lines.reduce((s, l) => s + l.net, 0n);
    if (totalNet > 0n) {
      let allocated = 0n;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const share =
          i === lines.length - 1
            ? orderDiscount - allocated // phần dư về dòng cuối
            : divRound(orderDiscount * line.net, totalNet);
        allocated += i === lines.length - 1 ? 0n : share;
        line.discount += share;
        line.net -= share;
      }
    }
  }

  // 3. Thuế: TRƯỚC hay SAU chiết khấu (câu hỏi 1)
  for (const line of lines) {
    const taxBase = config.discountBeforeTax ? line.net : line.gross;
    line.tax = pct(taxBase, line.taxRate);
  }

  // 4. Làm tròn (câu hỏi 2 + 3)
  let roundingAdjustment = 0n;
  let total: bigint;
  if (config.roundingMode === 'line') {
    // Tròn TỪNG DÒNG rồi cộng — tổng = Σ dòng, không lệch, không cần điều chỉnh
    for (const line of lines) {
      line.amount = roundScaled(line.net + line.tax, config.roundTo);
    }
    total = lines.reduce((s, l) => s + l.amount, 0n);
  } else {
    // Giữ dòng chính xác, tròn MỘT LẦN ở tổng — chênh lệch ghi thành
    // "điều chỉnh làm tròn" (câu hỏi 4)
    for (const line of lines) line.amount = line.net + line.tax;
    const exact = lines.reduce((s, l) => s + l.amount, 0n);
    total = roundScaled(exact, config.roundTo);
    roundingAdjustment = total - exact;
  }

  // 5. Bảng kê thuế theo mức (câu hỏi 6)
  const byRate = new Map<string, { taxable: bigint; tax: bigint }>();
  for (const line of lines) {
    const key = fromScaled(line.taxRate);
    const entry = byRate.get(key) ?? { taxable: 0n, tax: 0n };
    entry.taxable += config.discountBeforeTax ? line.net : line.gross;
    entry.tax += line.tax;
    byRate.set(key, entry);
  }

  return {
    lines: lines.map((l) => ({
      lineNo: l.lineNo,
      gross: fromScaled(l.gross),
      discount: fromScaled(l.discount),
      net: fromScaled(l.net),
      tax: fromScaled(l.tax),
      amount: fromScaled(l.amount),
    })),
    subtotal: fromScaled(lines.reduce((s, l) => s + l.net, 0n)),
    discountTotal: fromScaled(lines.reduce((s, l) => s + l.discount, 0n)),
    taxTotal: fromScaled(lines.reduce((s, l) => s + l.tax, 0n)),
    roundingAdjustment: fromScaled(roundingAdjustment),
    total: fromScaled(total),
    taxBreakdown: [...byRate.entries()]
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([taxRate, v]) => ({
        taxRate,
        taxableAmount: fromScaled(v.taxable),
        taxAmount: fromScaled(v.tax),
      })),
  };
}
