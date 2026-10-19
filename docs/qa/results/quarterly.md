# Kết quả QA: Quarter Report (Tổng quan, Squad Progress, Performance)

- Ngày QA: 2026-10-18 · Môi trường: staging · Commit đang chạy: `f4ee3187` · Người thực hiện: Claude
- Kiểm kê gốc: `../inventory/quarterly.md` · `../queries/quarterly.md` · Oracle: `../oracle.md`
- Kỳ thử dùng: Q3 (đủ), Q2, Q4 (đang chạy, kiểm pro-rata), biến thể ALL/VN/US × Phí ship × Đơn nội bộ
- **Phạm vi G1 đã làm:** số liệu API của cả ba subtab (đối chiếu SQL độc lập), toàn bộ điều khiển đầu trang (tham số gửi lên), thẻ KPI, bảng tháng, Performance. **Chưa làm (chuyển sang đợt sau):** thao tác ghi (target, CH.Cost, cài đặt, squad; thuộc G6), xuất Excel/CSV, đối chiếu DOM từng ô của bảng B2B theo Nhóm × Tháng, hiển thị di động.
- Tổng số phép kiểm tự động: **≈ 4.270**, 0 lệch số liệu. Phát hiện: 1 P1, 1 P2, 3 P3 (bên dưới).

## A. Số liệu đã đối chiếu độc lập (đều ĐẠT)

| Nhóm kiểm | Kỳ · biến thể | Số phép | Kết quả |
|---|---|---|---|
| `quarterly-report`: từng tháng × (B2B, B2C, Tổng): doanh thu, GP, doanh thu 3HK; CM1 = GP − chi phí kênh − chi phí nhóm; %CM1; %3HK; Tổng = B2B + B2C | Q3 × 7 biến thể (ALL ship0/int0, ship1/int1, ship1/int0, ship0/int1; VN; US; VN ship0) | 619 | ĐẠT |
| `quarterly-report`: `totalRevenue` từng kênh B2B (20) và B2C (6) so với SQL theo kênh; Σ kênh = tổng quý | như trên | (gồm trong 619) | ĐẠT |
| Chi phí khách B2B (Turso) từng tháng so với tính lại từ bản ghi chi phí × doanh thu khách; chi phí kênh B2C (Supabase); chi phí nhóm B2B/B2C ALL, VN, US (quy tắc "Global" → US) | Q3 T7, T8, T9 × ship0/ship1 | 30 | ĐẠT (B2C chi phí kênh = 0 cả quý: chưa nhập) |
| `quarterly-b2b-customers`: 222 khách × (doanh thu, GP, 3HK, chi phí Turso, CM1, từng tháng); phân hạng theo từ khoá `price_list_name`; Σ hạng = `quarterTotal.b2b` | Q3 ALL ship1/int1 | 2.405 | ĐẠT (222 khách API = 222 khách SQL) |
| B2C: doanh thu và GP từng kênh × tháng; drill-down mã nguồn (6 kênh có `members`); `prevQuarterTotals` doanh thu/GP so với SQL Q2 | Q3, Q2 | 250 | ĐẠT |
| `squad-progress`: 2 squad, 208 khách: doanh thu, GP, 3HK theo squad và theo từng khách; PIC thuộc đúng squad; Σ squad + KH chưa gán (12.779.285 đ) = B2B không ship; Σ tier = số khách | Q3 | 640 | ĐẠT |
| `squad-progress` pro-rata Q4 (17/92 ngày): doanh thu, GP, 3HK, CM1 PR = thực tế × 92/17 cho squad và từng khách | Q4 | 8 tỷ lệ | ĐẠT (5,4118 mọi chỗ) |
| Điều khiển đầu trang → tham số API: Q1…Q4, năm, ALL/VN/US, hai hộp tích, Xem báo cáo, Tải lại mới | — | 13 thao tác | Tham số đúng (xem mục B) |
| Bảng "Tổng hợp theo Tháng" trên giao diện so với API (doanh thu, GP, kênh, nhóm, CM1, %CM1, 3HK) | Q3 | 3 dòng × 9 cột | ĐẠT (lệch 1 đ do làm tròn, xem Q-05) |

## B. Điều khiển (đầu trang) → tham số gửi lên

| Thao tác | Request phát sinh | Nhận xét |
|---|---|---|
| Q2 / Q3 / đổi năm | `quarterly-report`, `quarterly-b2b-customers`, `quarterly-targets`, `b2b-customer-targets`, `quarterly-customer-lifecycle` (b2c, summary) | Đúng |
| VN / US / ALL | `quarterly-report`, `quarterly-targets`, `quarterly-customer-lifecycle` — KHÔNG gọi lại `quarterly-b2b-customers` | Bảng B2B theo Nhóm × Tháng có ô ALL/VN/US riêng (Q-03) |
| Bỏ tích Phí ship / Đơn nội bộ | thiếu `includeShip` / `includeInternalOps` trong các request, 4 route gọi lại | Đúng |
| Xem báo cáo | chỉ `quarterly-report` | Không làm mới B2B customers, lifecycle, targets |
| Tải lại mới | `POST quarterly-cache-flush` → `quarterly-report` + `quarterly-b2b-customers` (`refresh=1`) | KHÔNG làm mới lifecycle và targets (Q-02) |

## Phát hiện

| # | Mức | Mô tả | Bằng chứng | Nguyên nhân gốc | Đề xuất |
|---|---|---|---|---|---|
| **Q-01** | **P1** | **%QoQ CM1 B2B sai: có ba cơ sở "CM1 quý trước" khác nhau trên cùng một màn hình.** Q3: thẻ "Tổng hợp cả Quý — B2B" hiện QoQ −13,6% (cơ sở 3.736.238.878); tab Performance hiện −7% (cơ sở 3.466.403.051); bảng hạng khách cộng lại ra +0,1% (cơ sở 3.225.054.661, chỉ khách còn hoạt động ở Q3). Q4 so Q3: `prevQuarterTotals.b2bCm1` = 4.147.111.193 trong khi CM1 B2B thật của Q3 là 3.227.769.413 (lệch 919.341.780, 28%). Q2 so Q1 thì khớp (4.233.156.967). | Oracle: Q2 B2B GP 5.805.571.082 − chi phí khách (chỉ KH có doanh thu tháng đó) 2.339.168.032 = 3.466.403.051, đúng bằng `quarterly-report`(Q2). `prevQuarterTotals.b2bCm1` = GP − chi phí **chỉ dạng amount, mọi KH kể cả KH không có doanh thu tháng đó** = 5.805.571.082 − 2.069.332.204 (khớp từng đồng) | `quarterly-report/route.ts` khoảng dòng 535-550: nhánh tính CM1 quý trước (ghi chú trong mã: "amount type only — không có per-customer revenue Q trước") | Dùng chính `quarterTotal.cm1` của quý trước (đã có sẵn ở tab Performance), hoặc gọi lại logic quý đủ cho quý trước. Thêm test: `prevQuarterTotals.b2bCm1` = `quarterTotal.b2b.cm1` của quý liền trước. |
| Q-02 | P2 | "Tải lại mới" không làm mới tiles lifecycle (B2B/B2C) và target; "Xem báo cáo" chỉ tải lại `quarterly-report`. Sửa target hay đổi dữ liệu rồi bấm làm mới có thể vẫn thấy lifecycle cũ (cache 60 phút đến 6 giờ). | Log request mục B | `refreshAll` chỉ gọi flush + report + b2b-customers | Cho "Tải lại mới" gọi cả lifecycle (nocache) và targets |
| Q-03 | P3 | Bộ chọn ALL/VN/US ở đầu trang không đổi bảng "B2B — Chi tiết theo Nhóm × Tháng" (bảng có ô ALL/VN/US riêng). Người dùng chọn VN ở đầu trang vẫn thấy bảng B2B theo ALL. | Log: VN không gọi `quarterly-b2b-customers` | Thiết kế hai bộ chọn độc lập | Hiển thị nhãn khu vực trên bảng hoặc đồng bộ hai bộ chọn |
| Q-04 | P3 (NGHI) | Lifecycle: tile B2B đếm 220 khách (mới 62 + tiếp tục 158) trong khi bảng hạng có 222 khách (2 khách doanh thu ròng 0 chỉ có ở bảng hạng). "Mới 62" gồm 1 khách không có doanh thu B2B (`DqvTnTuEpw`: doanh thu cả năm nhưng nằm ở nhóm không phải B2B; ngày đơn B2B đầu 2026-07-31). Khách mới theo "đơn đầu có doanh thu" (Headout `DbGQfyUqYR`: đơn tháng 5-6 doanh thu 0, tính mới từ tháng 8) khác `MIN(fulfiled_date)` thô. Tổng doanh thu 3 tile vẫn bằng doanh thu B2B (17.802.861.687). | SQL `b2b_first_order` so với `quarterly-customer-lifecycle` | Bảng `b2b_lifecycle` (ETL) và định nghĩa "đơn đầu tiên" | Hiếu xác nhận định nghĩa "khách mới"; cân nhắc loại khách 0 doanh thu khỏi đếm |
| Q-05 | P3 | Làm tròn từng thành phần: doanh thu tổng tháng 7 = 8.058.395.818 (B2B + B2C đã làm tròn) trong khi SQL ra 8.058.395.819 và Dashboard hiện ...819. Lệch 1 đồng giữa các tab. | Bảng tháng so với oracle | Làm tròn B2B và B2C rồi cộng | Cộng trước, làm tròn sau (hoặc chấp nhận, ghi chú) |

## Còn lại của Quarter Report (đợt sau)

- Xuất Excel/CSV: bảng B2B theo Nhóm × Tháng (`Export`, `Xuất Excel` khách của nhóm), Squad Progress (`Export Excel`), CSV lifecycle; mẫu Template/Import CH.Cost.
- Đối chiếu DOM từng ô: bảng B2B theo Nhóm × Tháng (4 hạng × 3 tháng + Cả Quý, Organization, mã con), B2C theo Kênh × Tháng, lifecycle (bấm từng ô), `Hướng dẫn`, biểu đồ.
- Thao tác ghi (G6): Target quý, target từng khách và Organization, CH.Cost (Sửa chi tiết, Import), Cài đặt (loại trừ, tier), Cấu hình Squad, Target Squad, Target tháng cấp công ty.
- Biến thể còn chưa quét: US và VN cho bảng khách; so sánh quý khác (Q1, Q4 đầy đủ).

## Bổ sung giao diện (2026-10-19, Chrome, staging, Creator, Q3-2026 ALL)

| Hạng mục | Kết quả |
|---|---|
| Bảng "B2B — Chi tiết theo Nhóm × Tháng" (Cả Quý): 4 hạng × (số KH, revenue, GM, ch.cost, CM1, %CM1, %QoQ, 3HK) so với `quarterly-b2b-customers` | ĐẠT, 0 lệch |
| Danh sách KH hạng Strategic mở ra: 17 KH hiển thị theo mã (còn lại gom trong Organization) so với API | ĐẠT (lệch tối đa 1 đ do làm tròn hiển thị) |
| Tile Lifecycle: B2B mới 62 / quay lại 158 / rời bỏ 112.081; B2C mới 4.679 / quay lại 2.546 | Khớp API |
| Xuất Excel bảng B2B Nhóm × Tháng (`b2b_nhom_thang_Q3-2026_ALL.xlsx`): 227 dòng = 1 tiêu đề + 4 hạng + 222 KH; revenue, GM, ch.cost, CM1, 3HK so với API | ĐẠT, 0 lệch |

Cách kiểm xuất file không lưu file: chặn `URL.createObjectURL` và `HTMLAnchorElement.click` rồi đọc Blob xlsx (zip không nén).

Ghi nhận P3: số KH ở tile Lifecycle không có dấu chấm nghìn ("112081", "4679") trong khi nơi khác có.
Chưa làm: bảng B2C theo Kênh × Tháng, drill Tháng/Ngày/Sản phẩm, Organization, Template/Import, xuất lifecycle CSV, Squad Progress xuất Excel.

## Bổ sung giao diện lần 2 (2026-10-19, Q3-2026 ALL)

| Hạng mục | Kết quả |
|---|---|
| Bảng "B2C — Chi tiết theo Kênh × Tháng": 6 kênh × 3 tháng × (revenue, GM, ch.cost, CM1, %CM1, %3HK) so với `quarterly-report`; Σ kênh = `quarterTotal.b2c.revenue` (5.107.979.434) | ĐẠT, 0 lệch |
| Squad Progress: thẻ Squad 1 (192 KH, doanh thu 12,0 tỷ = 64% target, GP 3,1 tỷ) so với `squad-progress` | ĐẠT |
| Xuất Excel Squad Progress (`squad_progress_Q3_2026.xlsx`): sheet Squad Summary (2 squad) và Customer Detail (208 KH: revenue, PR, CM1 PR) so với API | ĐẠT, 0 lệch |
| Tab Performance: doanh thu, GP, CM1 Q3; Q2 (B2B 19.736.039.253, CM1 B2B 3.466.403.051, CM1 B2C 2.649.397.212) so với `quarterTotal`, `prevQuarterTotals` | ĐẠT (1 đ làm tròn ở tổng doanh thu Q2). %QoQ CM1 B2B thẻ "Chỉ số Quý" = −6,9% khớp Performance −7% (Q-01 đã sửa) |

| # | Mức | Mô tả | Đề xuất |
|---|---|---|---|
| Q-06 | P3 | Xuất Excel Squad Progress: cột "Leader" ghi mã Lark thô (`lark_ou_d7c1…`) trong khi giao diện hiện tên ("Ngoc Han") | Tra tên như giao diện khi xuất |
