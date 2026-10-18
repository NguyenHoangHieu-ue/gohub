# Kết quả QA: BOD Report

- Ngày QA: 2026-10-18 · staging · commit `f4ee3187` · Claude
- Kiểm kê gốc: `../inventory/bod.md` · `../queries/bod.md`
- Kỳ thử: Q3 × 4 tổ hợp hộp tích, T9, T7, X-MONTH (mặc định giao diện: Phí ship và Đơn nội bộ đều tích)
- **Đã làm:** số liệu 4 route × 7 biến thể (đối chiếu SQL độc lập), bộ lọc nâng cao (vendors, channelGroups, subChannels), chế độ Created, điều khiển Fulfillment/Created và panel Filters. **Chưa làm:** so sánh kỳ trước/cùng kỳ năm trước (từng ô), biểu đồ và xuất CSV (2 nút tải), bảng "Channel Performance Breakdown" trên DOM từng ô, dự phóng cuối tháng.
- Số phép tự động: **1.371 + 8 bộ lọc**; lệch: **32 phép trong 5 nhóm nguyên nhân** (bên dưới). Phần còn lại ĐẠT.

## A. Đã đạt

| Nhóm kiểm | Kết quả |
|---|---|
| `bod-summary.total_revenue`, `total_margin` (khi Đơn nội bộ tắt), `avg %` | ĐẠT mọi tổ hợp ship |
| `bod-group-margin`: B2B-Strategic (14.608.158.245), B2B-Non-Strategic, B2C so với SQL phân hạng theo từ khoá; Σ nhóm = tổng | ĐẠT |
| `bod-channel-performance`: từng kênh (doanh thu, margin); Σ kênh doanh thu = tổng | ĐẠT |
| `bod-report`: từng ngày (92 ngày Q3) doanh thu và margin; Σ ngày doanh thu = tổng | ĐẠT |
| Bộ lọc `channelGroups=B2C`, `channelGroups=Wholesales` (= B2B), `vendors=3HK DATAPOOL` (doanh thu, margin) | ĐẠT (API đúng; oracle của em thiếu bộ lọc khách loại trừ ở vendor, đã ghi nhận) |
| Giao diện: panel Filters (Tuần/Tháng/Quý/Năm nay, ngày bắt đầu/kết thúc, So sánh, Vendors, Channel Groups, Sub Channels, Product Type, hai hộp tích, Apply Filters) | Có đủ; hai hộp tích mặc định tích |

## Phát hiện

| # | Mức | Mô tả | Bằng chứng | Nguyên nhân gốc | Đề xuất |
|---|---|---|---|---|---|
| **B-01** | **P1** | **TOTAL COGS, UNITS SOLD và 3HK doanh thu trong `bod-summary` không áp bất kỳ bộ lọc chuẩn nào** (ship, nội bộ, KH Inactive, KH loại trừ, nhóm B2B/B2C), trong khi Revenue và Margin có áp. Hệ quả: tắt Phí ship thì doanh thu giảm nhưng COGS và units đứng yên (Q3: units 152.550 thay vì 151.825; COGS 14.579.016.731 thay vì 14.542.187.968); Revenue − COGS ≠ Gross Margin ở mặc định (Q3 ship1/int1: Δ44.869 = khách loại trừ); 3HK Contribution % lấy tử số thô trên mẫu số đã lọc (Q3 lệch 161.000 đ, cả kỳ trước và cùng kỳ năm trước). Với `vendors=3HK DATAPOOL`, units lệch 158. | 20 phép lệch ở Q3 4 tổ hợp, T9, T7, X-MONTH. Mã: `fetchAggregates()` trong `bod-summary/route.ts`: `WHERE (điều kiện kỳ) ${extraFilters}` không có `sfx` | Truy vấn gộp COGS/units/3HK (tối ưu s203) bỏ quên bộ lọc | Thêm `shipFilter`, `internalOpsFilterByCode`, `excludeInactiveCustomers`, `makeExcludeSqlByCode` và giới hạn nhóm vào truy vấn; thêm vào `test:consistency` điều kiện `COGS = Revenue − Margin`. |
| **B-02** | **P1** | **Hộp tích "Đơn nội bộ" không có tác dụng ổn định: chỉ hiện lỗ gộp của nhóm INTERNAL-TRANSACTION nếu nhóm đó có doanh thu > 0.** Khi doanh thu nhóm bằng 0 (Q3, T7, T9, X-MONTH), thẻ Gross Margin, CM1 và bảng nhóm bỏ lỗ nội bộ, còn bảng kênh vẫn có dòng Internal-Transaction. Hệ quả: tổng CM1 các kênh ≠ thẻ CM1 (Q3: −36.783.894; T9 −12.599.811; T7 −10.642.226; X-MONTH −11.242.013); thẻ Total COGS (đã gồm chi phí nội bộ) + Gross Margin ≠ Revenue. Với kỳ MTD 01–17/10 nhóm Other có doanh thu 401.585 nên cả hai đều gồm và khớp — kết quả phụ thuộc vào kỳ. | Phép lệch "Σ kênh gpm2 = summary.total_gpm2" và "summary.total_margin" ở mọi tổ hợp int1 | `finalizeGroupMargin` (`bod-data.ts`) có `.filter(g => g.revenue > 0)` | Giữ nhóm có GP khác 0, hoặc chuẩn hoá để thẻ và bảng cùng gồm/loại. |
| B-03 | P2 | Tổng CM1 trong biểu đồ ngày (`bod-report`) khác thẻ CM1 một khoảng nhỏ nhưng ổn định: Q3 +2.905.601; T9 +688.131; T7 +332.119; X-MONTH +1.286.240 (sau khi trừ phần nội bộ). | Phép "Σ ngày gpm2 = summary.total_gpm2" | Cách rải chi phí khách theo ngày (amount chia đều, percent theo doanh thu ngày) khác cách tính theo tháng | Ghi chú trên biểu đồ hoặc thống nhất cách rải. |
| B-04 | **P1** | **Chế độ Created: 3/5 request trả HTTP 500 (`syntax error at or near ".0"`); giao diện KHÔNG báo lỗi, các thẻ giữ nguyên số của chế độ Fulfillment** (ảnh chụp: nút Created sáng nhưng Total Revenue vẫn 3.843.899.741, CM1 972.313.306). Người dùng tưởng đó là số theo ngày tạo đơn. | Log: `bod-summary`, `bod-group-margin`, `bod-channel-performance` 500; `bod-report` 200 | Xem F-01 (lỗi chung `SUM(f.0)`) và giao diện nuốt lỗi | Sửa F-01; hiển thị banner khi route lỗi (đã có chuẩn "Hiếu đang fix") và xoá số cũ. |
| B-05 | P2 | Thẻ "so với tháng trước" (dự phóng: "vs Last Month Actual") gọi `bod-summary` tháng trước KHÔNG kèm `includeShip` và `includeInternalOps`, trong khi kỳ hiện tại có kèm → so hai cơ sở lọc khác nhau (vd hôm nay: kỳ hiện tại gồm ship + nội bộ, tháng trước loại). | Log khi bấm Created/Fulfillment: request `startDate:2026-09-01 endDate:2026-09-30` không có hai cờ | `bod/page.tsx` dựng request tháng trước riêng | Truyền cùng cờ lọc. |
| B-06 | P3 (NGHI) | `subChannels=Klook` trả 0 doanh thu (bộ lọc khớp `sapo_name`, không phải `channel_name`). Cần thử bằng giá trị thật của danh sách "Sub Channels" trên giao diện. | `bod-summary?subChannels=Klook` | `getBODFilters` dùng `sapo_name` | Kiểm lại bằng dropdown thật; nếu danh sách là `channel_name` thì là lỗi. |

## Ghi chú

- Phát hiện B-01 và B-02 chỉ hiện khi chạy tổ hợp hộp tích khác mặc định hoặc kỳ có nhóm nội bộ doanh thu 0. Test so cặp tab hiện chỉ chạy `includeShip`/`includeInternalOps` mặc định API (loại): cần thêm biến thể tích sẵn (giao diện mặc định).
- Bảng "Channel Performance Breakdown": Σ kênh = Total CM1 chỉ khi mọi nhóm đều có doanh thu > 0 (xem B-02).
