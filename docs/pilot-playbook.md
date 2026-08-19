# GĐ C — PLAYBOOK DỰ ÁN THÍ ĐIỂM

| | |
|---|---|
| **Ai làm** | **Bạn.** Agent hỗ trợ code nghiệp vụ, **cấm chạm boilerplate** |
| **Thời gian** | **5 ngày, hạn cứng.** Chưa xong = đó là kết quả, không gia hạn |
| **Đầu ra** | `FRICTION.md` + bốn số đo |
| **Điều kiện bắt đầ** | N3 (test #37) xong · C0 xong và đã sửa nhóm BLOCKER |

> **Đọc trước khi bắt đầu:** pilot có thể cho ra câu trả lời không dễ nghe — rằng
> boilerplate tiết kiệm ít hơn kỳ vọng. Đó là kết quả **có giá trị nhất**, vì nó
> chỉ đúng chỗ cần đầu tư. Nếu bạn bước vào với mong muốn nó chứng minh luận đề
> "2 ngày", bạn sẽ vô thức bỏ qua ma sát và mất cả tuần này.

---

# 1. Chọn dự án

## 1.1 Tiêu chí, theo thứ tự quan trọng

| # | Tiêu chí | Vì sao |
|---|---|---|
| **1** | **Nhu cầu thật, nhưng KHÔNG có deadline khách hàng** | Có hạn → bạn âm thầm đi đường tránh thay vì ghi ma sát. **Phép đo chết ngay tại đó** |
| 2 | Nghiệp vụ bạn **hiểu sẵn** | Không mất thời gian học nghiệp vụ, chỉ đo boilerplate |
| 3 | Đủ nhỏ để xong trong 5 ngày | |
| 4 | Chạm đủ bốn thứ ở §1.2 | Thiếu thì không kiểm chứng được gì |

## 1.2 Bốn thứ dự án BẮT BUỘC có

| Phải có | Chạm phần nào của boilerplate |
|---|---|
| **1 chứng từ nhiều dòng** | `grid-entry` · `calculateMoney` · field array · đánh số chứng từ |
| **1 luồng duyệt 2 bước** | state machine · `approval_authorities` · luật không-tự-duyệt |
| **2–3 danh mục** | `gen:module` tổ hợp đơn giản — đo tốc độ lặp |
| **1 báo cáo** | Report framework — thứ hứa "2 giờ/báo cáo" |

**Đừng làm một bảng CRUD.** Nó xanh trong nửa ngày và không chứng minh gì.

## 1.3 Ba ứng viên cụ thể

| Dự án | Chứng từ nhiều dòng | Duyệt | Danh mục | Báo cáo |
|---|---|---|---|---|
| **Quản lý đề xuất mua hàng** | Đề xuất có nhiều dòng vật tư | Trưởng bộ phận → Giám đốc, có hạn mức | Vật tư · Nhà cung cấp · Bộ phận | Chi theo bộ phận/tháng |
| **Quản lý kho cho shop nhỏ** | Phiếu nhập/xuất nhiều dòng | Duyệt phiếu xuất trên hạn mức | Hàng hoá · Kho · Đối tác | Tồn kho · Doanh thu |
| **Quản lý tài sản/thiết bị** | Phiếu cấp phát nhiều thiết bị | Duyệt cấp phát | Thiết bị · Phòng ban · Nhà cung cấp | Thiết bị theo phòng · Sắp bảo hành |

**Tôi nghiêng về "đề xuất mua hàng"**: nó là nghiệp vụ Việt Nam thuần, chạm đủ bốn thứ, và luồng duyệt có hạn mức là phần boilerplate đầu tư nặng nhất mà chưa ai dùng thật.

## 1.4 Cố ý KHÔNG làm trong pilot

- Multi-tenant với nhiều tenant thật → chỉ dùng một tenant, cách ly đã có test riêng
- Module [OPT]: webhook, SLA, comment, SSO
- Mobile
- Preset thứ ba

---

# 2. Ba luật của pilot

## 2.1 KHÔNG SỬA BOILERPLATE

```
Gặp ma sát  →  GHI vào FRICTION.md  →  ĐI ĐƯỜNG TRÁNH  →  tiếp tục
```

Hai lý do, lý do thứ hai mới là lý do thật:
1. Sửa = mất con số "có bao nhiêu ma sát"
2. **Sửa = pilot 5 ngày biến thành refactor 2 tuần.** Đây là cách pilot chết phổ biến nhất

**Ngoại lệ duy nhất:** không đi tiếp được bằng bất kỳ đường tránh nào. Khi đó sửa tối thiểu, đánh dấu `[BLOCKER-FIXED]`, ghi rõ đã sửa gì.

## 2.2 GHI NGAY, KHÔNG GHI CUỐI NGÀY

Ma sát mất tính chính xác sau 20 phút. Bạn sẽ nhớ *"chỗ đó hơi lằng nhằng"* thay vì *"tôi mất 25 phút vì playbook §3.2 không nói phải chạy `gen:api` sau khi đổi DTO"*.

Mở `FRICTION.md` cạnh editor. Ghi trong lúc còn đang vấp.

## 2.3 HẠN CỨNG 5 NGÀY

Chưa xong sau 5 ngày → **dừng, ghi lại đã tới đâu**. Đó là kết quả hợp lệ và quan trọng.

Gia hạn = phá phép đo, vì luận đề cần kiểm là *"bao lâu thì xong"*.

---

# 3. Bốn số đo — chốt ngưỡng TRƯỚC khi bắt đầu

Điền ngưỡng của bạn vào, rồi mới khởi động. Không có số chốt trước thì bạn sẽ hợp lý hoá bất cứ kết quả nào.

| # | Số đo | Ngưỡng đề xuất | Ngưỡng của bạn |
|---|---|---|---|
| M1 | Tới màn hình chạy được đầu tiên | ≤ 4 giờ | ____ |
| M2 | Toàn bộ app dùng được | ≤ 3 ngày | ____ |
| **M3** | **Số file CỦA BOILERPLATE phải sửa** | **≤ 5** | ____ |
| M4 | Số lần phải đọc **source** boilerplate | ≤ 10 | ____ |

**M3 quan trọng nhất.** Boilerplate tốt thì bạn chỉ viết code nghiệp vụ trong `modules/` và `features/`. Sửa quá 5 file hạ tầng nghĩa là nó chưa đủ tổng quát cho dự án thứ hai — và đó là phát hiện lớn.

**M4 đo chất lượng tài liệu.** Mỗi lần phải mở source vì docs không nói là một lỗ tài liệu.

---

# 4. Vai của agent

| | Được | KHÔNG được |
|---|---|---|
| Agent | Viết code nghiệp vụ dự án pilot | Sửa **bất kỳ** file nào trong boilerplate |
| Agent | Trả lời câu hỏi về boilerplate | Cải thiện tài liệu boilerplate |
| Agent | Chạy `gen:module`, viết test nghiệp vụ | Thêm tính năng vào boilerplate |

Thực tế bạn sẽ dùng AI, nên loại nó ra là đo sai quy trình thật.

**Một tín hiệu đáng đo:** mỗi lần agent phải **đọc source `nexus`** để trả lời được câu hỏi, đó là **một điểm ma sát** — đo trực tiếp chất lượng tài liệu. Yêu cầu agent khai mỗi lần nó phải làm vậy.

### Prompt mở đầu cho agent

```
Tôi đang làm dự án thí điểm để kiểm chứng boilerplate NEXUS.
Bạn giúp tôi viết code NGHIỆP VỤ của dự án này.

CẤM TUYỆT ĐỐI: sửa bất kỳ file nào trong boilerplate (design-system/,
common/, infra/, tools/, docs/). Gặp hạn chế của boilerplate → NÓI TÔI
BIẾT, đi đường tránh, KHÔNG sửa nó.

Mỗi lần bạn phải MỞ SOURCE của boilerplate để trả lời được (vì docs/
không nói), hãy khai rõ: "Phải đọc source: <file> vì <docs không nói gì>".
Tôi đang đếm số đó.

Đọc trước: docs/fe-playbook.md · docs/cookbook.md · README
```

---

# 5. Lộ trình 5 ngày

## Ngày 0 — 2 giờ, chuẩn bị

```
1. Clone nexus → thư mục dự án mới, xoá .git, git init
2. Thực hiện bảng cắt gọt §11 — BẤM GIỜ, ghi từng dòng
3. make setup — BẤM GIỜ
4. Playbook FE §1: palette, preset, density — BẤM GIỜ, mục tiêu 90 phút
5. Sau khi đặt brandHue: pnpm test:a11y   ← BẮT BUỘC
6. Tạo FRICTION.md, mở cạnh editor
```

C0 đã chạy các bước này một lần rồi, nhưng **bạn phải tự chạy lại**: C0 do agent làm, và nó có ngữ cảnh mà bạn không có. Con số của bạn mới là con số thật.

## Ngày 1 — Danh mục + chứng từ

```
Sáng   gen:module × 3 danh mục. Ghi thời gian TỪNG module.
       → Module thứ 3 nhanh hơn module thứ 1 bao nhiêu?
         Nếu không nhanh hơn, generator chưa giúp gì.
Chiều  gen:module chứng từ chính (list-detail + grid-entry + workflow)
       → M1: mốc "màn hình chạy được đầu tiên"
```

## Ngày 2 — Nghiệp vụ chứng từ

```
Nhập liệu nhiều dòng, tính tiền, đánh số chứng từ
Nhập HOÀN TOÀN bằng bàn phím — không chuột. Enter phải xuống dòng.
Ghi: có phải sửa calculateMoney không? có phải tự viết field array không?
```

## Ngày 3 — Duyệt

```
State machine, approval_authorities, hạn mức, không-tự-duyệt
Ghi: cấu hình hạn mức mất bao lâu? tài liệu §5C.12 có đủ không?
     có phải đọc source approval không?
```

## Ngày 4 — Báo cáo + hoàn thiện

```
1 báo cáo qua report framework. Tài liệu hứa 2 giờ — đo thật.
Import/export nếu nghiệp vụ cần.
```

## Ngày 5 — Dùng thật + viết kết luận

```
Sáng   Tự nhập dữ liệu thật 1–2 tiếng như một người dùng
       Đây là lúc ma sát UX lộ ra, không phải lúc code
Chiều  Hoàn thiện FRICTION.md, điền bốn số đo, viết phán quyết
```

---

# 6. `FRICTION.md`

```markdown
# FRICTION — Dự án thí điểm <tên>

## 0. Bối cảnh
Dự án: · Nghiệp vụ: · Ngày bắt đầu:
Ngưỡng đã chốt trước: M1 __ · M2 __ · M3 __ · M4 __

## 1. Bốn số đo
| # | Số đo | Ngưỡng | Thực tế | Đạt? |
|---|---|---|---|---|
| M1 | Màn hình đầu tiên |  |  |  |
| M2 | App dùng được |  |  |  |
| M3 | File boilerplate phải sửa |  |  |  |
| M4 | Số lần đọc source |  |  |  |

## 2. Thời gian từng bước vs tài liệu
| Bước | Tài liệu nói | Thực tế | Lệch |
|---|---|---|---|
| Bảng cắt gọt §11 | — |  |  |
| make setup | < 30 phút |  |  |
| Playbook FE §1 | 90 phút |  |  |
| gen:module #1 | — |  |  |
| gen:module #3 | — |  |  |
| 1 báo cáo | 2 giờ |  |  |

## 3. Ma sát
| # | Loại | Bước | Mất bao lâu | Mô tả | Đường tránh đã dùng | Lẽ ra boilerplate nên |
|---|---|---|---|---|---|---|

Loại:
  TÀI LIỆU     docs không nói, nói sai, hoặc nói mơ hồ
  GENERATOR    phải làm tay việc gen:module lẽ ra nên làm
  THIẾU        boilerplate không có thứ mọi dự án đều cần
  SAI          có nhưng chạy sai
  UX           dùng được nhưng khó chịu
  ĐỌC SOURCE   phải mở source vì docs không đủ  → cộng vào M4

## 4. File boilerplate đã phải sửa   → cộng vào M3
| File | Vì sao phải sửa | Đây là lỗ hổng tổng quát hay riêng dự án này? |

Cột thứ ba quan trọng: "riêng dự án này" thì bỏ qua,
"lỗ hổng tổng quát" thì phải chảy về boilerplate.

## 5. Cái gì HOẠT ĐỘNG TỐT
Đừng chỉ ghi cái xấu. Cái gì tiết kiệm thời gian rõ rệt?
Biết cái nào đáng giữ cũng quan trọng như biết cái nào cần sửa.

## 6. Phán quyết về luận đề "3 tuần → 2 ngày"
Đạt / Không đạt / Đạt một phần — kèm số liệu.

Nếu KHÔNG đạt: thời gian đi đâu? Ba nguyên nhân lớn nhất là gì?

## 7. Nên chảy về boilerplate — theo thứ tự ưu tiên
| # | Việc | Từ ma sát # | Ước lượng | Tiết kiệm được gì cho dự án sau |

## 8. Nên CẮT khỏi boilerplate
Cái gì có mà không dùng tới lần nào trong pilot?
Đây là câu hỏi ít ai đặt, và câu trả lời thường gây bất ngờ.
```

Mục 8 đáng chú ý: sau pilot bạn sẽ biết mình **không dùng** tới thứ gì. Nếu một tính năng đã tồn tại mà không ai chạm trong dự án thật đầu tiên, đó là ứng viên cắt — hoặc ít nhất là ứng viên hạ ưu tiên cho ba preset còn lại.

---

# 7. Bốn cách pilot chết — biết trước để tránh

| Cách chết | Dấu hiệu | Cách chặn |
|---|---|---|
| **Sửa boilerplate giữa đường** | *"để tôi sửa nhanh cái này rồi tiếp"* | Luật §2.1. Đường tránh, không sửa |
| **Ghi ma sát cuối ngày** | `FRICTION.md` chỉ có mục chung chung | Mở file cạnh editor, ghi lúc còn vấp |
| **Gia hạn** | *"thêm 2 ngày nữa là xong"* | Hạn cứng. Chưa xong là kết quả |
| **Chọn dự án khách hàng có deadline** | Bạn im lặng đi đường tránh | Tiêu chí §1.1 số 1 |

---

# 8. Sau pilot

`FRICTION.md` quyết định GĐ D, không phải phỏng đoán. Cụ thể ba câu mà hôm nay **không thể** trả lời:

| Câu hỏi | Trả lời bằng |
|---|---|
| Shell thứ ba nên là `top-nav` hay `workspace`? | Pilot có cần cái nào không |
| `gen:module` nên hỏi những câu nào? | Bạn đã phải sửa tay gì sau khi sinh |
| `card-grid` / `compact-list` có thật cần? | Pilot có lần nào muốn hiển thị khác table |

Và một câu quan trọng hơn cả ba: **nếu M3 > 10** (phải sửa hơn 10 file hạ tầng) thì đừng làm GĐ D. Sửa tính tổng quát của boilerplate trước, vì thêm ba preset lên một nền chưa đủ tổng quát chỉ nhân ba vấn đề.
