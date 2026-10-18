# Plan: QA toàn diện nhóm tab Analyst

> File TẠM (docs/plans). Khi xong hoặc Hiếu bỏ plan: chuyển kiến thức còn giá trị sang wiki `docs/wiki/system/` rồi xoá file này.
> Soạn 2026-10-18. Trạng thái: ĐÃ CHỐT HƯỚNG (2026-10-18), chưa bắt đầu G0.

## 0. Mục tiêu và phạm vi

Ba việc Hiếu yêu cầu, thành ba trục:

1. **QA tỉ mỉ từng tab**: từng phần, mục, toggle, bộ lọc, bảng, dòng, cột, từng dữ liệu được query.
2. **Đánh giá liên tab**: quan hệ, phụ thuộc, điểm tương đồng, chỗ lặp, chỗ lệch.
3. **Đánh giá thao tác ghi** (thêm, sửa, xoá: target, chi phí, cấu hình...) và phần hiển thị, UI.

Phạm vi 19 tab nhóm ANALYST: Dashboard, Quarter Report (Tổng quan, Squad Progress, Performance), BOD, All-Time, Channels, B2B (+ VN Ecom theo thời gian), B2C (Advanced, Metric, Performance), Website, Staff, Customers, Vendors, Orders, Inventory (Tồn kho, Kế hoạch nhập hàng), 3HK Data Usage, CS Troubleshoot, Products BI, Product Catalogue, Manage Costs, Scheduled Messages.
Ngoài phạm vi: Management (Users, Settings, Admin), Creator (Argon, Gấu Pro, Bridge...), Thị trường & Báo giá, My Metrics. Tài liệu kỹ thuật làm cơ sở: `Hieu/GoHub-Tai-Lieu-Ky-Thuat-Tab-Analyst.docx`.

## 1. Nguyên tắc

- **Có "nguồn đối chứng độc lập" cho mọi con số.** Không so route với chính route. Đối chứng bằng SQL thô chạy qua `POST /api/analytics/query` (chỉ SELECT, cần phiên Creator trong trình duyệt) hoặc tính tay từ các số thô.
- **Đọc trước, ghi sau.** Toàn bộ pha 1 và 2 chỉ đọc. Pha 3 (ghi) chỉ chạy sau khi Hiếu duyệt cách an toàn ở mục 6.
- **Staging và production dùng CHUNG Supabase và Turso** (đã thấy khi chạy cron: bảng `analytics_monthly_kpis` dùng chung). Mọi lần ghi lên staging là ghi dữ liệu thật. Vì vậy mọi thử nghiệm ghi phải có sao lưu, dùng dòng thử có dấu hiệu nhận biết, và khôi phục.
- **Không đổi giao diện** (màu, bố cục, font, biểu đồ) khi QA, theo UI Strict Lock. Chỉ ghi nhận và đề xuất.
- **Mỗi phát hiện có bằng chứng**: tab, thao tác, tham số, số mong đợi, số thấy, nguồn đối chứng, ảnh hoặc payload.
- Sửa lỗi theo luật repo: staging trước, tsc + lint + vitest, cập nhật wiki, commit sau mỗi việc, KHÔNG merge `main` khi chưa được yêu cầu.

## 2. Pha 0: Chuẩn bị (kiểm kê và công cụ)

| # | Việc | Kết quả |
|---|---|---|
| 0.1 | **Kiểm kê điều khiển từng tab**: đọc `page.tsx` và `components/*` để liệt kê mọi toggle, dropdown, ô nhập, nút, tab con, cột có sắp xếp, phân trang, xuất file, nút làm mới. Chạy script quét DOM trên staging để đối chiếu danh sách với giao diện thật. | `docs/qa/inventory/<tab>.md`: bảng điều khiển × (tham số gửi lên API, route nhận, hiệu ứng mong đợi) |
| 0.2 | **Kiểm kê dữ liệu**: với mỗi tab, liệt kê mọi route, mọi truy vấn SQL (gồm SQL do giao diện tự sinh: Channels, Vendors, 3HK Usage, Products), bảng nguồn, cột nguồn. | Bảng truy vấn × bảng nguồn × cột × công thức |
| 0.3 | **Bộ đối chứng SQL**: mỗi chỉ số chính (doanh thu, GP, COGS, CM1 thành phần, units, orders, 3HK, khách mới/cũ, tồn kho, usage) có một SQL thô độc lập. | `docs/qa/oracle.sql` + script chạy trong tab trình duyệt |
| 0.4 | **Bộ kỳ thử cố định**: quý đã đóng (Q3), tháng đã đóng (T9), khoảng vắt tháng, tháng đang chạy (MTD), một ngày đơn, ngày tương lai, khoảng rỗng, ngày đầu quý mới, ngày cuối tháng. Kèm chế độ Fulfillment và Created, VN, US, ALL. | Ma trận kỳ thử dùng chung |
| 0.5 | **Khung ghi kết quả**: mỗi ô kiểm có ID, trạng thái (đạt, lỗi, nghi, không áp dụng), mức độ (P0 đến P3), bằng chứng. | `docs/qa/results/<tab>.md` + bảng tổng |
| 0.6 | **Công cụ**: Chrome tự động trên staging (phiên Creator đã có), `fetch` trong trang để gọi API và SQL đối chứng, script Node gọi API bằng Bearer `CRON_SECRET` cho các cặp so sánh, mở rộng `test:consistency`. Chạy tuần tự theo cụm nhỏ vì pool gohub_dw chỉ 3 kết nối. | Bộ script dùng lại được |

## 3. Pha 1: QA từng tab (mẫu kiểm cố định cho mọi tab)

Mỗi tab đi qua cùng 9 nhóm kiểm (A đến I). Phần riêng từng tab ghi ở mục 3.2.

### 3.1 Mẫu kiểm

- **A. Tải trang và trạng thái**: skeleton khi tải, trạng thái rỗng, banner lỗi ("Hiếu đang fix"), mất mạng, API lỗi 500, phiên hết hạn, quyền xem theo vai trò (Admin, Creator, BOD, Manager, Staff, ops-&-cs, product).
- **B. Từng điều khiển**: mỗi toggle, dropdown, chip, ô tìm kiếm, bộ chọn ngày (mọi preset), sắp xếp từng cột, phân trang, mở rộng dòng, nút xuất, nút "Tải lại mới". Với mỗi điều khiển: bật rồi tắt, giá trị biên, đổi liên tiếp nhanh (race giữa hai request), trạng thái được giữ hay mất khi chuyển tab con.
  - Kiểm từ giao diện tới mạng: tham số gửi lên API có đúng điều khiển không (đối chiếu Network), cache key có đổi không.
- **C. Từng con số**: mỗi thẻ KPI, mỗi ô bảng, mỗi dòng tổng, mỗi điểm biểu đồ, mỗi tooltip. Tính lại bằng SQL đối chứng. Dung sai: 0 đồng với tổng nguyên, tối đa 5 đồng cho làm tròn. Kiểm trên toàn bộ ma trận kỳ thử và các tổ hợp bộ lọc (phí ship × đơn nội bộ × khách vận hành = 8 tổ hợp cho tab có ba hộp tích; Fulfillment/Created; ALL/VN/US).
- **D. Công thức dẫn xuất**: %MoM, %QoQ, GPM%, CM1%, projection, pro-rata, AOV, %Contrib, DOI, Usage%, tỷ lệ đạt target. Tính lại bằng tay từ số thô.
- **E. Nhất quán trong tab**: thẻ KPI so với bảng, bảng so với biểu đồ, dòng cha so với dòng con (drill-down), dòng tổng so với tổng các dòng, số hiển thị so với số xuất file.
- **F. Xuất file** (Excel, CSV, docx): đủ dòng (không chỉ trang đang xem), đúng cột, đúng định dạng số và ngày, khớp màn hình.
- **G. Trường hợp biên**: không có dữ liệu, một dòng, quá 500 hoặc 1000 dòng (giới hạn cắt), tên có ký tự đặc biệt, khách không map được, SKU trùng, nước chưa có Zone, tháng chưa đủ 7 ngày, quý vừa bắt đầu, ngày hôm nay chưa có dữ liệu.
- **H. Hiệu năng và cache**: thời gian lần đầu và lần sau, `nocache=1`, dữ liệu cũ sau khi ghi, request thừa hoặc chạy nối tiếp.
- **I. Hiển thị**: định dạng số (vi-VN), đơn vị, nhãn, chú thích, màu theo ý nghĩa (âm, dương), cắt chữ, cuộn ngang, độ rộng cột.

### 3.2 Phần riêng từng tab

Thứ tự đề xuất: tab có nhiều tiền và nhiều logic trước. Mức ưu tiên: P = cao, T = trung bình, X = thấp.

| Ưu tiên | Tab | Trọng tâm kiểm riêng |
|---|---|---|
| P | **Quarter Report** (Tổng quan) | Bảng "Tổng hợp theo Tháng" (Actual và PR), thẻ KPI, bảng B2B theo Nhóm × Tháng (từng nhóm, Organization, mã khách con, drill-down), B2C theo Kênh × Tháng (mã nguồn con), lifecycle B2B/B2C (bấm từng ô, danh sách), futureScale, QoQ, mọi hộp tích, ALL/VN/US, Tải lại mới, xuất Excel (bảng, KH của nhóm), "Sửa chi tiết" CH.Cost, "Sửa target" |
| P | **Quarter Report** (Squad Progress, Performance) | Thẻ GP, 4 thẻ squad, đánh giá rủi ro (5 mức), khớp từng khách với Tổng quan, bảng Performance theo tháng, target tháng quý sau, cột cả năm, quý chưa đủ dữ liệu, bấm ô KH, filter + sort, flat view so với per-squad (lịch sử lỗi field-mismatch) |
| P | **BOD** | Thẻ summary (kỳ trước, cùng kỳ năm trước), Group Margin, bảng kênh (cha, con), biểu đồ ngày, projection, hai hộp tích, Created, nút tải CSV hai biểu đồ, so với Quarter và Channels |
| P | **Channels** | Overview và Single Channel, mọi dropdown (nhóm, kênh), thẻ KPI so với bảng so với Total, sub-channel, bộ lọc vendor, loại sản phẩm (BE không nhận lọc này: chia lại theo doanh thu), Top Products, Daily, so sánh kỳ, dự phóng CM1 từng dòng |
| P | **B2B** | KPI Actual và Projected, Strategic Partners, Tier, CH.Cost từng khách (Turso hay fallback), mở rộng dòng khách, TOTAL OTHERS, VN Ecom (khách, shop, sub-shop, modal Cost, TOTAL), trang `/b2b/ecom` (tháng, tuần, quý; Est.) |
| P | **B2C** | Advanced (năm mục, tháng chọn, MKT Profit Report, tiến độ so mục tiêu), Metric (từng dòng × tháng, Web/App), Performance (groupBy kênh, vendor, SKU, nước, khách; ba hộp tích; cắt 1000 dòng; cột VN/US) |
| P | **Staff** | Leaderboard, mở rộng nhân viên, sparkline, hai kiểu biểu đồ, Σ CM1 khách so với CM1 nhân viên, gán khách (`sales_pic_code` so với `staff_code`) |
| P | **All-Time** | Ba ô KPI (trọng số), chart theo metric, mọi view, tháng dở, filter tier |
| P | **Dashboard** | Dải thị trường, thẻ KPI, chart, region, nguồn, kênh, đơn gần đây, Monthly Summary (3 tháng + chiếu), Báo cáo Quý, Target Progress |
| T | **Orders** | Mọi bộ lọc (single day, range, Entity, Group, Channel, Source, PIC, hai ô Yes/No), phân trang, tìm kiếm phía trình duyệt, tổng toàn kỳ, export đủ trang, Created (GP = 0), đơn SIM vật lý (fulfiled_date rỗng) |
| T | **Vendors** | Vendor mặc định, bảng phân bổ (Khách hàng / Kênh), bấm dòng lọc SKU, %Contrib, %MoM, Export, tổng bảng so với thẻ KPI |
| T | **Customers** | Chọn danh sách khách, tier, CH.Cost theo tháng thật, KPI `change` tuyệt đối |
| T | **Products BI** | Region, category, vendor, kênh, top SKU, mã nước SKU (13/14/15 ký tự), xuất |
| T | **3HK Data Usage** | Định nghĩa "SIM thuộc kỳ", bốn tab (Tất cả, Daily, Fixed, Unlimited), phân loại ký tự thứ 8, loại mã K, breakdown mã, sub-variant, Zone × Tháng (drill-down nước), đối chiếu số NCC, múi giờ ngày cuối |
| T | **Inventory** | Tồn kho (VN/US, SIM/eSIM, cảnh báo 4 mức, DOI, HSD, expand kho), Kế hoạch (lưới tuần, gợi ý, ghi đè tay, cảnh báo, "Cần đặt PO"), PO tracker, export |
| T | **Manage Costs** | Ba bảng target B2C, B2C KPI target, Budget (VN/US/Total), modal Chi phí B2C, cột Actual |
| T | **Scheduled Messages** | Danh sách, tạo, sửa, bật tắt, Test, `inferPeriod`, Weekly Report (số liệu so với các tab nguồn) |
| X | **Website** | Web và App, GA4 và GSC, destination, export |
| X | **CS Troubleshoot** | Năm sub-tab, TBS Rate (tử và mẫu cùng bộ lọc), Sync Lark, export |
| X | **Product Catalogue** | Chọn nước, bộ lọc chip, thẻ gói, ngăn chi tiết, giá vốn theo vai trò, banner độ tươi, tab Theo nhà cung cấp |

Mỗi tab được chia nhỏ thành các đợt làm việc (mỗi đợt một nhóm điều khiển và bảng) để có thể báo cáo từng phần.

## 4. Pha 2: Đánh giá liên tab

| # | Việc | Kết quả |
|---|---|---|
| 2.1 | **Ma trận chỉ số × tab**: mỗi chỉ số (doanh thu, GP, CM1, 3HK%, orders, units, khách) xuất hiện ở tab nào, route nào tính, bộ lọc nào áp, cách tính chi phí và pro-rata nào. | Bảng "cùng chỉ số, khác chỗ" |
| 2.2 | **Danh sách cặp phải bằng nhau** (mở rộng `test:consistency` từ 23 lên khoảng 60 điều kiện): thêm All-Time so với Quarter, B2C Advanced so với B2C Performance, Squad Progress so với Tổng quan từng khách, Customers so với B2B Tier, Vendors so với Products theo vendor, Dashboard Region so với Products, Orders tổng so với kpis, Weekly Report so với các tab nguồn, snapshot so với trang. | Test chạy được, mỗi cặp có dung sai và lý do khác biệt có chủ đích |
| 2.3 | **Phát hiện bản chép logic**: các hàm SQL tự sinh ở giao diện (Channels, Vendors, 3HK Usage, Products) so với hàm dùng chung ở server; các bảng, cột giống nhau nhưng tính khác nhau. | Danh sách "tương đồng nhưng không dùng chung hàm" |
| 2.4 | **Đồ thị phụ thuộc**: thao tác ghi (target, chi phí, cài đặt loại trừ, tier) làm cache nào hết hạn, tab nào bị ảnh hưởng, tab nào KHÔNG cập nhật dù phải cập nhật. | Sơ đồ ghi → cache → tab |
| 2.5 | **Khác biệt có chủ đích so với lỗi**: phân loại từng khác biệt (ví dụ Dashboard gồm ship, Channels luôn loại ship; B2B chỉ so Actual) và nêu rõ cách người dùng nhận biết. | Danh sách "hiểu lầm có thể xảy ra" kèm gợi ý nhãn hoặc chú thích |
| 2.6 | **Quan hệ dữ liệu giữa các nguồn**: gohub_dw, Supabase, Turso, nguồn ngoài; chỗ ghép ở trình duyệt (3HK sub-variant), chỗ đọc tươi ngoài cache. | Bản đồ nguồn |

## 5. Pha 3: Đánh giá chức năng thêm, sửa, xoá và hiển thị

### 5.1 Kiểm kê thao tác ghi

| Nhóm | Thao tác | Kho | Cổng quyền |
|---|---|---|---|
| Quarter Report | Target quý B2B/B2C; CH.Cost từng khách (nhập, sửa, xoá); target từng khách và Organization; target squad (quý, tháng quý sau); target tháng cấp công ty; cài đặt loại trừ và tier; cấu hình squad | Turso, Supabase `b2b_customer_targets`, `app_settings` | admin, creator, bod, b2b, b2c, staff (tuỳ thao tác) |
| B2B VN Ecom | Chi phí khách, shop, sub-shop (ghi, xoá) | Turso `b2b_ecom_cost_monthly` | `canWrite("b2b")` |
| Manage Costs | Target B2C (Revenue, 3HK%, CM1%); B2C KPI target; Budget VN/US; chi phí kênh; chi phí nhóm | Supabase | `writable_tabs` chứa `targets` |
| Inventory | Watchlist SKU (thêm, sửa, xoá), lưới tuần (ô ghi đè), PO (thêm, sửa, xoá), ngưỡng cảnh báo | Supabase | admin, creator, manager, staff |
| Scheduled | Lịch (thêm, sửa, xoá, bật tắt, Test), Create Weekly Report | Supabase | admin, creator, `writable_tabs` chứa `scheduled` |
| CS Troubleshoot | Sync Lark | Supabase | quyền xem tab |

### 5.2 Mẫu kiểm cho MỖI thao tác ghi

1. **Quyền**: vai trò được phép thấy nút, vai trò không được phép (nút ẩn hay bấm được rồi 403 im lặng), kiểm cả hai phía giao diện và API (lịch sử: B2C target bị 403 câm vì sai khoá quyền).
2. **Kiểm tra đầu vào**: rỗng, âm, bằng 0, phần trăm trên 100, số thập phân, rất lớn, chữ thay vì số, dấu phân cách vi-VN, ký tự đặc biệt, trùng khoá.
3. **Vòng đời**: tạo → đọc lại → sửa → đọc lại → xoá → đọc lại. Kiểm khoá (id) nên là upsert hay chèn trùng.
4. **Ngữ nghĩa xoá**: xoá thật hay đặt về 0; ảnh hưởng tới các cấp cha con (VN Ecom: cấp cha không cộng dồn).
5. **Lan truyền**: sau khi lưu, các tab liên quan có đổi ngay không (cache `deps`, `flushByDeps`, CDN `no-store`); tab nào không đổi dù phải đổi.
6. **Hiển thị trạng thái**: dirty-state của nút Lưu, đang lưu, lưu xong, lỗi (thông báo rõ), khoá nút khi đang tải dữ liệu cũ (lịch sử lỗi ghi đè bản trống).
7. **Dấu vết**: `updated_by`, `updated_at`, lịch sử có hay không, có hoàn tác không.
8. **Đồng thời**: hai người sửa cùng lúc (ghi đè nhau), thao tác lặp nhanh.
9. **Ràng buộc nghiệp vụ**: mối quan hệ giữa các giá trị nhập (target tháng so với target quý; Σ ba tháng; ALL so với B2B + B2C; target Organization và target mã con; tổng chi phí nhóm VN/US theo từ khoá "Global").
10. **Dữ liệu mẫu và khôi phục** (mục 6).

### 5.3 Đánh giá hiển thị và UI

- Tính nhất quán thành phần: `StatTile`, `DataTable`, skeleton, bảng viết tay còn lại, biểu đồ (`CHART_PALETTE`).
- Định dạng: `formatNumber` (vi-VN) so với `toLocaleString()` trần; đơn vị (đồng, tr, tỷ); số âm; phần trăm một hay hai chữ số; ngày.
- Nhãn và thuật ngữ: CM1 hay GPM2, "Actual", "PR", "Est."; chú thích công thức (tooltip) có đúng với công thức thật không.
- Trạng thái rỗng, lỗi, tải; nút xuất có ở mọi bảng quan trọng hay không; "Tải lại mới" có ở mọi tab hay không.
- Điều hướng: trạng thái giữ khi đổi tab con; URL chia sẻ được hay không; khoảng ngày mặc định từng tab; đặt lại (Reset).
- Truy cập: `aria-label`, bàn phím, tương phản, màn hình hẹp (cuộn ngang, clip bảng lồng).
- Ghi nhận và đề xuất, KHÔNG tự đổi giao diện khi chưa có chỉ thị.

## 6. An toàn khi thử ghi (cần Hiếu duyệt trước pha 3)

Vì staging và production dùng chung Supabase và Turso:

- **Cách đề xuất**: (a) sao lưu từng bảng và khoá sẽ chạm (JSON trong `Hieu/qa-backup/`) trước mỗi đợt ghi; (b) chỉ ghi vào một **tháng hoặc mã thử** không ảnh hưởng số thật (ví dụ tháng tương lai xa, mã khách thử có tiền tố `QA_`, SKU thử, lịch thử không có webhook thật); (c) khôi phục từ bản sao lưu và xác nhận bằng đọc lại ngay sau mỗi đợt; (d) không gọi bất kỳ nút nào gửi tin Lark thật.
- **Không thử**: xoá dòng dữ liệu thật; ghi vào tháng đang dùng cho báo cáo; thay cài đặt loại trừ hoặc tier thật (chỉ đọc và phân tích mã); gửi Weekly Report ra Lark.
- Với thao tác không thể thử an toàn (ví dụ cài đặt loại trừ ảnh hưởng mọi tab): đánh giá bằng đọc mã và mô phỏng trên bản sao cấu hình trong test cục bộ.

## 7. Pha 4: Báo cáo và sửa lỗi

- **Báo cáo theo tab** (`docs/qa/results/<tab>.md`) và **báo cáo tổng** (docx): bảng phát hiện theo mức độ (P0 sai số tiền hoặc mất dữ liệu; P1 sai số ở trường hợp thường gặp hoặc 403 câm; P2 không nhất quán, hiểu lầm, thiếu chức năng; P3 giao diện, nhãn).
- **Backlog sửa**: nhóm theo nguyên nhân gốc (không theo tab) để sửa một lần cho nhiều chỗ; mỗi nhóm một commit, có test khoá (thêm vào `test:consistency` hoặc test tĩnh).
- **Cập nhật wiki** từng tab và `analytics-data-model.md`; cập nhật tài liệu docx.
- Hiếu duyệt backlog trước khi sửa; không merge `main` nếu chưa được yêu cầu rõ.

## 8. Thứ tự và ước lượng

| Giai đoạn | Nội dung | Ước lượng |
|---|---|---|
| G0 | Pha 0 (kiểm kê, oracle, công cụ) | 1 phiên dài |
| G1 | Nhóm tiền: Quarter Report (3 subtab), BOD, Channels | 3 đến 4 phiên |
| G2 | B2B (+ VN Ecom), B2C (3 subtab), Staff, All-Time, Dashboard | 3 đến 4 phiên |
| G3 | Orders, Vendors, Customers, Products, 3HK Usage, Inventory | 3 phiên |
| G4 | Manage Costs, Scheduled, Website, CS, Catalogue | 2 phiên |
| G5 | Pha 2 (liên tab) và mở rộng test so cặp | 1 đến 2 phiên |
| G6 | Pha 3 (ghi) — sau khi duyệt mục 6 | 2 đến 3 phiên |
| G7 | Báo cáo tổng, backlog, sửa lỗi P0 và P1 | 2 phiên + sửa |

Sau mỗi giai đoạn có báo cáo ngắn (đạt, lỗi, nghi) để Hiếu duyệt trước khi sang giai đoạn kế.

## 9. Rủi ro

- **Giới hạn gohub_dw**: pool 3 kết nối, mỗi truy vấn quét fact 0,5 đến 1 giây; QA tuần tự theo cụm nhỏ, tránh bắn song song nhiều truy vấn đối chứng.
- **Dữ liệu thay đổi trong lúc QA** (ETL chạy hằng giờ): chỉ đối chứng trên kỳ đã đóng; kỳ đang chạy so cùng thời điểm hoặc ghi mốc thời gian.
- **Ghi dữ liệu thật**: xem mục 6.
- **Khối lượng lớn**: khoảng 19 tab × 9 nhóm kiểm × nhiều kỳ và tổ hợp bộ lọc. Chiến lược: tự động hoá phần tính số (script API + SQL đối chứng), kiểm tay trên giao diện phần điều khiển, bố cục, xuất file.
- **Giao diện tự động hoá** có thể bị hộp thoại chặn, tab đăng xuất, hoặc trang tải chậm; ghi nhận và dừng hỏi khi lặp lại.

## 10. Quyết định đã chốt (Hiếu, 2026-10-18)

1. **Thử ghi**: thử ghi AN TOÀN trên staging theo mục 6 (sao lưu, chỉ ghi tháng hoặc mã thử tiền tố QA_, khôi phục và đọc lại, không xoá dữ liệu thật, không gửi Lark).
2. **Thứ tự**: tab tiền và logic trước (mục 3.2 và 8).
3. **Song song**: KHÔNG dùng nhiều tác tử; làm tuần tự một mạch.
4. **Đầu ra**: báo cáo từng giai đoạn; nhóm lỗi theo nguyên nhân gốc; sửa P0 và P1 SAU KHI Hiếu duyệt backlog (staging-first, có test, không merge main).
