/**
 * Đọc CSV tối thiểu nhưng ĐÚNG — hàm thuần, test được không cần DOM.
 *
 * Không dùng `split(',')`: dữ liệu nghiệp vụ VN đầy tên công ty có dấu phẩy
 * ("Công ty TNHH A, B") và địa chỉ nhiều dòng. Tách thô làm lệch cột và người
 * dùng chỉ thấy "import lỗi 3.000 dòng" mà không hiểu vì sao.
 *
 * Hỗ trợ: dấu nháy kép bọc trường, `""` là một dấu nháy, xuống dòng trong
 * trường có nháy, CRLF, BOM. KHÔNG hỗ trợ dấu phân cách khác `,` — thêm khi
 * có file thật cần.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text.replace(/^﻿/, ''));
  const header = rows.shift();
  if (!header) return [];

  const columns = header.map((h) => h.trim());
  const duplicate = columns.find((c, i) => columns.indexOf(c) !== i);
  if (duplicate) {
    throw new Error(`Cột "${duplicate}" xuất hiện hai lần — sửa tiêu đề rồi tải lại.`);
  }

  return rows
    // Dòng trống cuối file là chuyện thường, không phải lỗi
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => {
      const record: Record<string, string> = {};
      columns.forEach((c, i) => {
        record[c] = (r[i] ?? '').trim();
      });
      return record;
    });
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      // CRLF: bỏ qua \n ngay sau \r
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
