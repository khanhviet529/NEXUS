import { describe, it, expect } from 'vitest';
import { parseCsv } from './parse-csv';

describe('parseCsv (§4.7)', () => {
  it('đọc header và dòng dữ liệu cơ bản', () => {
    expect(parseCsv('code,name\nSP-1,Bút bi\nSP-2,Vở')).toEqual([
      { code: 'SP-1', name: 'Bút bi' },
      { code: 'SP-2', name: 'Vở' },
    ]);
  });

  it('DẤU PHẨY trong tên công ty không làm lệch cột', () => {
    // Đây là lý do không dùng split(','). Tên doanh nghiệp VN đầy dấu phẩy;
    // tách thô làm lệch mọi cột sau đó và người dùng chỉ thấy "lỗi 3.000 dòng".
    expect(parseCsv('code,name\nKH-1,"Công ty TNHH A, B và C"')).toEqual([
      { code: 'KH-1', name: 'Công ty TNHH A, B và C' },
    ]);
  });

  it('dấu nháy kép đôi bên trong trường thành một dấu nháy', () => {
    expect(parseCsv('code,name\nSP-1,"Bút ""siêu bền"""')).toEqual([
      { code: 'SP-1', name: 'Bút "siêu bền"' },
    ]);
  });

  it('xuống dòng bên trong trường có nháy KHÔNG cắt thành hai dòng', () => {
    const rows = parseCsv('code,address\nKH-1,"Số 1 Lê Lợi\nQuận 1, TP.HCM"');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.address).toBe('Số 1 Lê Lợi\nQuận 1, TP.HCM');
  });

  it('chịu được CRLF của Excel Windows', () => {
    expect(parseCsv('code,name\r\nSP-1,Bút\r\n')).toEqual([{ code: 'SP-1', name: 'Bút' }]);
  });

  it('bỏ BOM mà Excel chèn — nếu không thì cột đầu tên là "\\ufeffcode"', () => {
    const rows = parseCsv('﻿code,name\nSP-1,Bút');
    expect(Object.keys(rows[0]!)).toEqual(['code', 'name']);
  });

  it('bỏ dòng trống cuối file — đó là chuyện thường, không phải lỗi', () => {
    expect(parseCsv('code\nSP-1\n\n')).toEqual([{ code: 'SP-1' }]);
  });

  it('thiếu ô cuối dòng thì điền chuỗi rỗng, không undefined', () => {
    expect(parseCsv('code,name,unit\nSP-1,Bút')).toEqual([
      { code: 'SP-1', name: 'Bút', unit: '' },
    ]);
  });

  it('cột trùng tên thì BÁO LỖI, không im lặng ghi đè', () => {
    // Im lặng ghi đè nghĩa là một cột dữ liệu biến mất mà không ai biết.
    expect(() => parseCsv('code,code\nA,B')).toThrow(/xuất hiện hai lần/);
  });

  it('file chỉ có header thì trả mảng rỗng, không ném', () => {
    expect(parseCsv('code,name')).toEqual([]);
  });

  it('file rỗng thì trả mảng rỗng', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
