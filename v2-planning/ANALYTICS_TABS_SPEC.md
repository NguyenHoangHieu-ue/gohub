# Đặc tả Kỹ thuật Toàn bộ 27 Tab Hệ thống GoHub Intel (BI & Core Product Specs)

> Tài liệu này biên soạn 100% chi tiết kỹ thuật, cấu trúc luồng dữ liệu, APIs, trường cơ sở dữ liệu, các công thức toán học và logic truy vấn thực tế cho **tất cả 27 Tab** hoạt động trong GoHub Intel. Đây là cẩm nang kỹ thuật tuyệt đối phục vụ việc xây dựng và tái cấu trúc hệ thống v2 chuẩn chỉ 1-1 không sai lệch số liệu.

---

## PHẦN I: NHÓM TÁC VỤ PHÂN TÍCH & BÁO CÁO (BI & ANALYTICS)

### 1. TAB BI DASHBOARD (TỔNG QUAN VÀ BÁO CÁO QUÝ) — Path: `/analytics`
Báo cáo tổng quan hoạt động kinh doanh toàn diện của công ty, cung cấp các chỉ số KPI hiệu năng tức thì, xu hướng doanh thu và biểu đồ phân bổ quốc gia.

*   **APIs chính**: 
    *   `GET /api/analytics/kpis`: Cards KPI Doanh thu, Đơn hàng, Units, AOV kỳ này so kỳ trước.
    *   `GET /api/analytics/revenue-chart`: Doanh thu theo ngày, phân nhóm B2B Strategic, B2B Non-Strategic, B2C và Internal.
    *   `GET /api/analytics/region-chart`: Doanh thu phân chia theo Quốc gia đích (giải mã từ SKU).
    *   `GET /api/analytics/b2b/tier-performance`: Doanh thu B2B phân bổ theo Tiers (Strategic, VIP, Gold, Silver).
    *   `GET /api/analytics/quarterly-report`: Truy vấn bảng tổng hợp Quý phục vụ modal "Báo cáo Quý" (s112).
*   **Logic Phân tách Nhóm B2B Strategic vs Non-Strategic** (ISSUE-DASH-4):
    Sử dụng trường `dim_customer.price_list_name` kết nối qua `getCustomerStrategicSql()`:
    *   **Strategic B2B**: Khi `price_list_name` là `NULL` hoặc không chứa các từ khóa `VIP`, `GOLD`, `SILVER`.
    *   **Non-Strategic B2B**: Khi `price_list_name` khớp với các từ khóa `VIP`, `GOLD`, `SILVER`.
    *   *Loại trừ*: B2C Customer US/VN và B2B Ops.
*   **Báo cáo Quý (s112 Modal)**:
    *   *Công thức*: $\text{CM1} = \text{Gross Profit} - \text{Channel Cost} - \text{Group Cost}$
    *   *Dự phóng pro-rata*: 
        $$\text{Revenue Projected} = \text{Revenue MTD} \times \left( \frac{\text{Số ngày trong tháng}}{\text{Số ngày đã qua}} \right)$$

---

### 2. TAB BOARD OF DIRECTORS (BOD) REPORT — Path: `/analytics/bod`
Báo cáo tài chính tổng hợp cấp điều hành cao cấp, hiển thị bức tranh toàn cảnh doanh thu, biên lợi nhuận gộp, lợi nhuận đóng góp CM1, và tỷ trọng của đối tác chiến lược 3HK.

*   **APIs chính**:
    *   `GET /api/analytics/bod-summary`: KPI Cards (Revenue, GP, GPM%, CM1, CM1%, 3HK Contribution %).
    *   `GET /api/analytics/bod-group-margin`: Phân rã doanh thu & biên lợi nhuận theo Nhóm kênh (B2B Strategic, B2B Non-Strategic, B2C).
    *   `GET /api/analytics/bod-channel-performance`: Doanh thu và lợi nhuận gộp theo từng Tháng x Kênh.
*   **Chỉ số đóng góp 3HK%**:
    Tỷ lệ doanh thu mang lại từ sản phẩm của đối tác 3HK.
    ```sql
    SELECT SUM(CASE WHEN TRIM(f.sku) IN
             (SELECT DISTINCT TRIM(sku) FROM dim_sku WHERE TRIM(vendor) ILIKE '3HKDATAPOOL')
           THEN f.<revenueCol> ELSE 0 END) AS r_3hk,
           SUM(f.<revenueCol>) AS r_total
    FROM <mainTable> f WHERE <dateFilter>
    ```
    $$\text{3HK Contribution \%} = \frac{\text{r\_3hk}}{\text{r\_total}} \times 100$$
*   **Vá lỗi chi phí B2B chuẩn hóa (s162)**:
    CM1 của nhóm B2B trên trang BOD bắt buộc phải trừ chi phí động `b2b_customer_cost_monthly` từ Turso chứ không được dùng channel costs rỗng của Supabase, đảm bảo khớp tuyệt đối với tab B2B Performance.

---

### 3. TAB B2B PERFORMANCE (HIỆU SUẤT BÁN SỈ) — Path: `/analytics/b2b`
Phân tích hiệu quả kinh doanh của nhóm khách sỉ B2B, tách biệt hiệu suất giữa các Tier đối tác và theo dõi chi tiết chi phí động.

*   **APIs chính**:
    *   `GET /api/analytics/b2b/kpis`: Cards KPI doanh thu sỉ, GP sỉ, CM1 sỉ, và Biên CM1% sỉ.
    *   `GET /api/analytics/b2b/performance`: Bảng tổng hợp phân rã theo khách hàng (Strategic vs Non-Strategic).
    *   `GET /api/analytics/b2b/trend`: Chuỗi doanh thu và CM1 sỉ theo thời gian.
    *   `GET /api/analytics/b2b-customer-costs?month=YYYY-MM`: Lấy danh sách chi phí động của từng khách sỉ từ Turso.
*   **Quy trình tính Chi phí động (CH.Cost - s168/s169)**:
    Hệ thống quét bảng Turso `b2b_customer_cost_monthly` cho tháng tương ứng:
    *   *Chi phí dạng Amount (Cố định)*: Cộng trực tiếp số tiền VND.
    *   *Chi phí dạng Percent (%)*: Áp phần trăm trực tiếp lên Doanh thu thực tế phát sinh của khách hàng trong kỳ:
        $$\text{CH.Cost (Percent)} = \text{Revenue của KH} \times \text{Percent Value}$$
    *   *Fallback*: Nếu khách hàng không được nhập chi phí trong Turso -> Fallback dùng chi phí kênh `gpm2` (channel costs) trong Supabase.
*   **Gotchas quan trọng (s168b)**:
    Khi xem chi tiết (expand row) một khách hàng để phân rã ra các Sub-channels: Tổng CM1 của các sub-channels phải khớp 100% với CM1 của khách hàng cha. Do đó phần chi phí động từ Turso và group-cost phải được phân bổ xuống từng sub-channel dựa trên tỷ trọng doanh thu phát sinh của sub-channel đó.

---

### 4. TAB B2C PERFORMANCE (HIỆU SUẤT BÁN LẺ) — Path: `/analytics/b2c`
Báo cáo phân tích phễu bán lẻ B2C theo mô hình 5 Section của Apple, tập trung đo lường ROAS và tỷ lệ chuyển đổi khách hàng mới/quay lại.

*   **Advanced Dashboard (5 Section)**:
    *   *S1 Revenue Rolling*: Doanh thu rolling 6 tháng chia theo vùng VN/US/Total + Tiến độ MTD so với target.
    *   *S2 Customers*: Lượng khách hàng mới (New) vs quay lại (Returning). Gọi API Admin `/v1/internal/customers/revenue` lấy trực tiếp `byUserType` của summary page 1 để tăng tốc độ tải.
    *   *S3 CAC & Leads*: Đo lường giá có một Lead (CPL) và giá mua một khách mới (CAC) dựa trên leads kéo về từ Chatwoot/Turso.
    *   *S4 Website CR*: Tỷ lệ chuyển đổi mua hàng trên Web kéo từ dữ liệu GA4 properties.
    *   *S5 Marketing Cost & ROAS*: Tổng tiền chi tiêu MKT (bao gồm chi phí nhóm `b2c` trong `analytics_channel_group_costs` + chi phí kênh trong `analytics_channel_costs`) so sánh trực tiếp với doanh thu để ra chỉ số ROAS.
*   **Metric Dashboard (YTD Monthly với MoM%)**:
    *   `Revenue` / `Gross Profit` (Tách riêng Total, Web, App).
    *   `CM1` (Doanh thu B2C - chi phí MKT).
    *   `Orders` / `AOV` / `Traffic` (Sessions từ GA4) / `Users` (Active Users từ GA4).
    *   `Customer Count` (New vs Returning của Web và App).

---

### 5. TAB CHANNEL PERFORMANCE (HIỆU SUẤT KÊNH BÁN HÀNG) — Path: `/analytics/channels`
Cung cấp hai góc nhìn: Tổng quan toàn bộ các kênh bán hàng (All Channels Overview) và Phân tích chuyên sâu một kênh bất kỳ (Single Channel Deep-Dive).

*   **APIs chính**:
    *   `GET /api/analytics/channels/performance`: Tất cả các kênh bán hàng kèm doanh thu, GP, orders, units, CM1.
*   **Query logic tính CM1 per kênh**:
    *   **Kênh sỉ B2B**: Lấy Margin trừ chi phí khách hàng từ Turso (phân bổ theo doanh thu) + Chi phí nhóm kênh phân bổ.
    *   **Kênh lẻ B2C**: Lấy Margin trừ chi phí kênh từ Supabase `analytics_channel_costs` + Chi phí nhóm kênh phân bổ.
*   **Single Channel Deep-Dive**:
    Hiển thị xu hướng doanh thu, cơ cấu sản phẩm bán chạy nhất (Top SKU) của kênh đó, và phân rã chi tiết theo sub-channel dựa trên trường `dim_order_source.sapo_name`.

---

### 6. TAB PRODUCTS PERFORMANCE (HIỆU SUẤT SẢN PHẨM) — Path: `/analytics/products`
Quản lý doanh số bán hàng của danh mục sản phẩm, phân loại SKU trọng điểm và hiển thị phân phối địa lý theo quốc gia.

*   **APIs chính**:
    *   `GET /api/analytics/products/report`: Trả về danh sách SKU kèm Doanh thu, GP, Margin% và số lượng bán.
*   **Pareto 80% SKU**: Đánh dấu SKU trọng điểm đóng góp vào 80% doanh thu tích lũy:
    1.  Sắp xếp danh sách SKU theo doanh thu giảm dần.
    2.  Tính doanh thu tích lũy (Cumulative Revenue) và tỷ lệ phần trăm tích lũy.
    3.  Đánh dấu `is_key = true` cho các SKU có tỷ lệ phần trăm tích lũy $\le 80\%$.
*   **Phân phối Địa lý (Region)**: Giải mã quốc gia đích từ chuỗi ký tự SKU bằng hàm `getDestinationSQL` và map tên nước thông qua Turso `country_codes`.

---

### 7. TAB VENDORS PERFORMANCE (HIỆU SUẤT NCC BÁN RA) — Path: `/analytics/vendors`
Xem hiệu quả bán ra và cơ cấu lợi nhuận của các gói cước được chia theo nhà cung cấp gốc (`dim_sku.vendor`).

*   **APIs chính**:
    *   `GET /api/analytics/vendors/report`: Tổng doanh thu, GP, units, và orders theo từng NCC.
*   **Gotchas khớp chuỗi**: Nhà cung cấp 3HK trong bảng `dim_sku` được lưu là `'3HK DATAPOOL'` (có khoảng trắng). Câu lệnh SQL bắt buộc phải xử lý loại bỏ khoảng trắng hoặc so sánh không nhạy chữ:
    ```sql
    WHERE REPLACE(UPPER(vendor), ' ', '') = '3HKDATAPOOL'
    ```

---

### 8. TAB MANAGE COSTS (TARGETS & COSTS) — Path: `/analytics/targets`
Thiết lập kế hoạch (Targets) doanh thu B2C, CM1%, tỷ lệ 3HK% theo tháng, đối chiếu thực tế phát sinh và nhập chi phí marketing B2C.

*   **APIs chính**:
    *   `GET /api/analytics/targets-summary`: Bảng so sánh Target (Supabase `analytics_target_planning`) vs Thực tế (`gohub_dw` dùng Fulfillment mode).
    *   `POST /api/config/b2c-budget`: Thiết lập ngân sách B2C tiếp thị (Ads, Platform, Sponsor, Media) và chi phí B2C group cost.

---

### 9. TAB STAFF PERFORMANCE (HIỆU SUẤT NHÂN VIÊN) — Path: `/analytics/staff`
Theo dõi và đánh giá doanh số, số lượng khách hàng hoạt động, và lợi nhuận CM1 mang về từ từng nhân viên kinh doanh (Sales PIC).

*   **APIs chính**:
    *   `GET /api/analytics/staff-report`: Doanh số toàn bộ Sales PIC, doanh thu tổng, doanh thu 3HK, số lượng khách hàng, CM1.
    *   `GET /api/analytics/staff-report/customers`: Trả về danh sách chi tiết khách hàng của 1 Sales PIC kèm doanh số.
*   **Mapping PIC chuẩn hóa (sales_pic_code)**:
    Tránh sai lệch gán khách hàng (f.staff_code trong bảng fact có thể bị sai lệch). Logic chuẩn sử dụng hàm `COALESCE` kết hợp thông tin phụ trách từ danh mục khách hàng:
    ```sql
    COALESCE(dim_customer.sales_pic_code, f.staff_code)
    ```
*   **Tính CM1 của Staff**:
    $$\text{CM1 Staff} = \sum(\text{gross\_profit\_vnd của Staff đó}) - \text{Phần phân bổ Group Cost B2B/B2C theo tỷ trọng Doanh thu}$$

---

### 10. TAB ALL-TIME REPORT (HIỆU SUẤT LỊCH SỬ) — Path: `/analytics/all-time`
Phân tích xu hướng tài chính dài hạn đa năm, tách biệt dữ liệu giữa B2B Strategic, B2B Non-Strategic và B2C.

*   **APIs chính**:
    *   `GET /api/analytics/all-time-performance`: Lấy chuỗi dữ liệu doanh thu, GP, CM1 theo từng tháng qua nhiều năm.
*   **Derived Group (Phân nhóm Phái sinh - s131)**:
    Doanh thu và CM1 được phân rã theo nhóm phái sinh dựa trên `getCustomerStrategicSql()` kết nối với `quarterly-settings` để xác định chính xác Strategic vs Non-Strategic.
*   **Gotchas (s162)**:
    Tương tự các tab khác, CM1 B2B trong báo cáo lịch sử bắt buộc phải trừ chi phí động từ Turso `b2b_customer_cost_monthly` để số liệu thống nhất qua các năm.

---

### 11. TAB QUARTER REPORT (BÁO CÁO CM1 QUÝ) — Path: `/analytics/quarterly`
Báo cáo chiến lược theo từng quý (Q1-Q4) so sánh trực tiếp số liệu thực tế, số liệu dự phóng Pro-rata và chỉ tiêu Target Quý của B2B & B2C.

*   **APIs chính**:
    *   `GET /api/analytics/quarterly-report`: Bảng tổng hợp CM1 theo từng tháng trong quý, có tính dự phóng pro-rata tháng hiện tại.
    *   `GET /api/analytics/quarterly-b2b-customers`: Chi tiết kết quả sỉ B2B phân rã theo Tier và danh sách khách hàng.
    *   `POST /api/analytics/quarterly-targets`: Cập nhật chỉ tiêu Target Revenue, Target CM1, và Target 3HK% lưu vào bảng Turso `target_planning_quarter`.
*   **Phương pháp Dự Phóng (Pro-rata Projection Engine - s135)**:
    Hệ thống áp dụng duy nhất cơ chế dự phóng **Per-Month** thống nhất:
    *   *Tháng đã hoàn thành*: Hệ số `factor = 1` (Lấy số actual thực tế).
    *   *Tháng hiện tại*: Nếu số ngày đã trôi qua trong tháng $\ge 7$ ngày:
        $$\text{factor} = \frac{\text{Tổng số ngày trong tháng}}{\text{Số ngày đã trôi qua}}$$
        Nếu số ngày đã trôi qua $< 7$ ngày: Giữ nguyên `factor = 1` (tránh nhảy số đột biến đầu tháng).
    *   *Tháng tương lai*: Elapsed = 0, loại bỏ khỏi summary.
    *   *Công thức Pro-rata cả quý*:
        $$\text{Prorata Quý} = \sum(\text{Actual tháng đã xong}) + (\text{Actual tháng hiện tại} \times \text{factor})$$
*   **Cấu trúc Target Per-KH B2B (s151/s152)**:
    Dữ liệu target cấp khách hàng được lưu trữ trong Supabase `b2b_customer_targets`:
    *   Các trường: `target_rev` (doanh thu quý), `target_cm1` (CM1 quý), `target_3hk_pct` (tỷ lệ 3HK target).
    *   **Target 3HK Revenue**: Người dùng có thể nhập tay trực tiếp, nếu để trống hệ thống tự tính:
        $$\text{Target 3HK Rev} = \text{target\_rev} \times \frac{\text{target\_3hk\_pct}}{100}$$

---

### 12. TAB MY METRICS (OKR TRACKING) — Path: `/analytics/my-metrics`
Bảng quản trị OKRs cá nhân đo lường hiệu năng công việc của vai trò Product Operations Executive.

*   **APIs chính**:
    *   `GET /api/analytics/my-metrics`: Tổng hợp điểm OKRs dựa trên 5 KPI cốt lõi.
    *   `GET /api/analytics/my-metrics/sku-scan`: Quét toàn bộ hệ thống để xếp hạng SKU Pareto 80% doanh thu và tính Weighted Delta Gross Margin.
    *   `GET /api/analytics/my-metrics/lark-events`: Danh sách các case SLA/Vendor speed pending review từ Lark.
*   **Thuật toán SKU Scan tính Weighted Delta GM (s167)**:
    1.  **Bước 1**: Lấy danh sách tất cả các SKU có phát sinh đơn hàng trong quý hiện tại và quý trước.
    2.  **Bước 2**: Sắp xếp SKU theo doanh thu giảm dần, xác định nhóm đóng góp 80% doanh thu tích lũy (`is_key = true`).
    3.  **Bước 3**: Tính biến động biên lợi nhuận gộp ($\Delta \text{ Margin\%}$) của từng SKU trọng điểm hoặc SKU mới (so baseline 36.7%).
    4.  **Bước 4**: Điểm KPI SKU Gross Margin chính thức là:
        $$\text{Weighted Delta GM} = \frac{\sum (\Delta \text{Margin\%}_i \times \text{Revenue}_i)}{\sum \text{Revenue}_i} \quad \text{với } i \in \{ \text{SKU Trọng điểm } \cup \text{ SKU Mới} \}$$

---

### 13. TAB ORDERS PERFORMANCE (DANH SÁCH ĐƠN HÀNG) — Path: `/analytics/orders`
Bảng chi tiết đơn hàng phục vụ đắc lực việc kiểm tra danh sách đơn hàng thực tế phát sinh từ `gohub_dw`.

*   **APIs chính**:
    *   `GET /api/analytics/order-report`: Trả về dữ liệu danh sách đơn hàng chi tiết (Ngày, PIC, Khách hàng, Loại eSIM/SIM, Doanh thu, GP, Tier KH).
*   **Gotchas truy vấn**:
    *   Khi bật chế độ "Ngày tạo đơn", cột CM1/GP bắt buộc phải hiển thị bằng `0` do bảng `fact_sales_revenue` không chứa cột giá vốn.
    *   Danh sách SKU trong đơn hàng có nhiều mã được gom nhóm sử dụng hàm `STRING_AGG(DISTINCT f.sku, ', ')`.

---

### 14. TAB 3HK DATA USAGE (LƯU LƯỢNG 3HK) — Path: `/analytics/3hk-usage`
Báo cáo theo dõi sát hao hụt lưu lượng tiêu thụ GB của nhà mạng 3HK.

*   **APIs chính**:
    *   `GET /api/analytics/3hk/usage-report`: Thống kê lưu lượng tiêu thụ thực tế thu thập từ bảng `fact_data_usage` so sánh trực tiếp với dung lượng gói danh nghĩa để phân tích tỷ lệ hao hụt thực tế phục vụ tối ưu hóa hệ số COGS 3HK.

---

### 15. TAB SQL EXPLORER (TRUY VẤN TỰ DO) — Path: `/analytics/sql`
Công cụ thực thi SQL trực quan cho quản trị viên và hệ thống AI.

*   **APIs chính**:
    *   `POST /api/analytics/query`: Tiếp nhận câu lệnh SELECT và thực thi trực tiếp trên GCP Postgres `gohub_dw`.
*   **Bảo mật**: Chặn hoàn toàn các câu lệnh DDL/DML (INSERT, UPDATE, DELETE, DROP) và giới hạn kết quả trả về tối đa 500 dòng để tránh rò rỉ dữ liệu hoặc treo hệ thống.

---

### 16. TAB WEBSITE ANALYTICS (GA4 & GSC) — Path: `/analytics/website`
Theo dõi lưu lượng truy cập (sessions, active users, purchases, revenue) từ Google Analytics 4 và thứ hạng tìm kiếm từ Search Console.

*   **APIs chính**:
    *   `GET /api/analytics/website`: Gọi API Google Analytics Data API lấy metrics `activeUsers`, `sessions`, `ecommercePurchases`, `purchaseRevenue`.
    *   `GET /api/analytics/gsc`: Gọi API Google Search Console lấy số liệu clicks, impressions, và average position.
*   **Platform Toggle - Web vs App (s156)**:
    *   *Chế độ Web*: Lọc GA4 theo `hostName` (lấy từ siteUrl cấu hình). Hiển thị Search Console.
    *   *Chế độ App*: Lọc GA4 theo `platform IN ('ios', 'android')` sử dụng Firebase Analytics property ID `465150028`. Ẩn Search Console.

---

### 17. TAB INVENTORY PLAN (KẾ HOẠCH NHẬP HÀNG TUẦN) — Path: `/analytics/fulfillment`
Kế hoạch restock nhập hàng tuần từng SKU (cho cả thị trường VN/US) kết hợp PO tracker thay thế hoàn toàn tab theo dõi kho vật lý cũ (s160).

*   **APIs chính**:
    *   `GET/POST /api/analytics/inventory-plan/skus`: Quản lý watchlist các SKU cần theo dõi restock (gồm target weeks coverage, safety weeks, lead time).
    *   `GET/POST /api/analytics/inventory-plan/weekly`: Trả về bảng ô lưới 14 tuần tới.
    *   `GET/POST /api/analytics/inventory-po`: PO Tracker theo dõi các đơn hàng PO đang đặt NCC.
*   **Logic gợi ý Restock tuần (server-side - `lib/inventory-plan.ts`)**:
    *   Tính vận tốc bán: `velocity = Doanh thu 30 ngày gần nhất / 30 * 7`.
    *   Tính toán roll-forward từng tuần:
        $$\text{tồn trước khi nhập} = \text{tồn đầu tuần} - \text{bán dự kiến (forecast)}$$
        $$\text{gợi ý nhập} = \text{tồn trước khi nhập} < (\text{safety\_weeks} \times \text{velocity}) ? \max(0, \text{target\_coverage} \times \text{velocity} - \text{tồn trước khi nhập}) : 0$$
        $$\text{tồn đầu tuần kế tiếp} = \text{tồn trước khi nhập} + \text{số lượng nhập}$$
    *   *Cảnh báo "Đặt PO ngay"*: Khi tuần có tồn kho đầu tuần rơi vào mức âm (<0) nằm trong khoảng thời gian `lead_time_weeks` kể từ hiện tại.

---

### 18. TAB GẤU PRO (CREATOR AI CHAT) — Path: `/analytics/creator/ai`
AI Workspace cao cấp độc quyền dành riêng cho vai trò `creator` (Hiếu) để phân tích dữ liệu, tự động sinh truy vấn và tìm kiếm web.

*   **APIs chính**:
    *   `POST /api/creator-ai/chat`: Tiếp nhận tin nhắn trò chuyện không lưu DB (in-memory state).
*   **Hệ thống Tools của Gấu Pro**:
    *   `executeSQL`: Truy vấn PostgreSQL `gohub_dw` tự do (không áp guardian).
    *   `querySupabase`: Đọc/ghi toàn bộ 38 bảng Supabase (bao gồm các bảng nhạy cảm như users, config).
    *   `queryGA4` / `queryGSC`: Truy xuất dữ liệu SEO và Website.
    *   `webSearch`: Tìm kiếm Google Search grounding trực tiếp.
*   **Cơ chế xuất Excel không giới hạn dòng**:
    Khi Gấu Pro sinh bảng dữ liệu SQL lớn (>200 dòng, LLM bị cắt cụt), Gấu Pro sẽ đặt nhãn \`sql:\` chứa câu lệnh SELECT gốc cuối marker \`\`\`export. Nút "Xuất Excel" trên FE sẽ gọi API chạy lại câu lệnh SQL này từ phía server để sinh file `.xlsx` đầy đủ dữ liệu thực tế.

---

### 19. TAB CUSTOMER PERFORMANCE (B2B) — Path: `/analytics/customers`
Phân tích sâu cơ cấu doanh thu, margin, số lượng mua theo từng đối tác sỉ B2B.

*   **APIs chính**:
    *   `GET /api/analytics/customer/report`: Trả về danh sách khách hàng sỉ kèm doanh thu, GP, số lượng mua, sản phẩm mua nhiều nhất, và kênh mua hàng.
*   **Quy tắc kết nối**:
    Khớp dữ liệu khách hàng sử dụng điều kiện: `TRIM(f.customer_code) = TRIM(dim_customer.code)`.

---

### 20. TAB USER FEEDBACK (GÓP Ý NGƯỜI DÙNG) — Path: `/analytics/feedback`
Nơi tập trung tiếp nhận và xử lý các ý kiến đóng góp của người dùng hệ thống.

*   **APIs chính**:
    *   `GET/POST /api/feedbacks`: Đọc/Ghi dữ liệu feedback trực tiếp từ bảng Supabase `feedbacks`. Chỉ Admin/Creator có quyền xem danh sách và cập nhật trạng thái xử lý (`status`).

---

### 21. TAB CS TROUBLESHOOT HUB (SỰ CỐ KHÁCH HÀNG) — Path: `/analytics/cs-troubleshoot`
Giao diện tra cứu và phân tích sự cố khách hàng phục vụ bộ phận CS.

*   **APIs chính**:
    *   `GET /api/reports/cs-troubleshoot`: Truy cập tìm kiếm full-text search trên bảng Supabase `lark_cs_tickets` (24,712 tickets) đồng bộ định kỳ từ Lark Base API lúc 02:00 UTC hàng ngày.

---

### 22. TAB TỔ GẤU (GROUP CHAT & KNOWLEDGE WIKI) — Path: `/analytics/to-gau`
Không gian trao đổi nội bộ, chia sẻ tài liệu và quản lý wiki ngữ nghĩa (gộp Note + Knowledge base từ s163).

*   **APIs chính**:
    *   `GET/POST /api/to-gau/groups`: Quản lý danh sách group chat.
    *   `GET/POST /api/to-gau/groups/[id]/members`: Quản lý thành viên group chat.
*   **Khắc phục lỗi trùng lặp danh tính (Identity Collision - s163)**:
    Toàn bộ định danh người dùng chuyển sang sử dụng trường **`session.user.username`** duy nhất thay thế trường `email` cũ (do 43 tài khoản đăng nhập Lark OAuth có email bị trống `NULL` dẫn đến việc trùng danh tính rỗng `""` và xem lén được dữ liệu của nhau).
*   **Tài liệu Wiki ngữ nghĩa**:
    Tài liệu tạo riêng trong group Tổ Gấu sẽ lưu vào bảng chung `kb_wiki_pages` nhưng có `visibility_mode = 'groups'` và liên kết bảng nối `kb_wiki_page_groups` để giới hạn chỉ thành viên nhóm Tổ Gấu đó được phép xem tài liệu.

---

## PHẦN II: NHÓM TÁC VỤ NGHIỆP VỤ & QUẢN TRỊ SẢN PHẨM (CORE ADMIN)

### 23. TAB GOHUB AI CHATBOT (BÉ GẤU THÔNG THÁI) — Path: `/chatbot`
Nền tảng quản lý hội thoại và phân vùng bảo mật của Bé Gấu trên giao diện Web và Lark.

*   **Cơ cấu định tuyến**: Classifier AI nhận diện Intent -> Router ngắt dòng (clarification) -> context.ts xây dựng ngữ cảnh sạch truyền vào LLM.
*   **Bảo mật Guardian**: Chèn `role_filters` vào SQL khi người dùng truy vấn BI, tự động lược bỏ cột giá vốn COGS và trường nhạy cảm nếu vai trò người dùng không khớp quyền xem giá vốn.

---

### 24. TAB NCC CATALOG (GAP NCC & BULK IMPORT) — Path: `/ncc`
Quản lý danh mục đối tác, phân tích khoảng trống thị trường (Gap) và tạo sản phẩm tự động.

*   **APIs chính**:
    *   `GET /api/ncc/worldmove`: Đọc catalog của WorldMove (8,921 dòng).
    *   `POST /api/ncc/import-preview`: Tiếp nhận tệp Excel, chạy kiểm tra định dạng và trả về cảnh báo trước khi ghi đè catalog.
    *   `POST /api/ncc/import-confirm`: Lưu hàng loạt SKU mới tạo tự động vào DB GoHub.

---

### 25. TAB REFERENCE COUNTRIES (QUỐC GIA THAM CHIẾU) — Path: `/countries`
Master Data địa lý phục vụ chuẩn hóa hiển thị và giải mã địa điểm.

*   **APIs chính**:
    *   `GET /api/countries`: Đọc danh mục quốc gia (`ref_countries`), châu lục, nhà mạng đối tác (`ref_vendors`).
*   **Lưu ý**: Khác biệt với bảng `country_codes` trên Turso (bảng `country_codes` chỉ dùng riêng cho giải mã SKU của BI Analytics).

---

### 26. TAB PROMOTIONS (QUẢN LÝ KHUYẾN MÃI) — Path: `/promotions`
Chính sách chiết khấu, khuyến mãi và đặc quyền viễn thông (telco perks).

*   **APIs chính**:
    *   `GET/POST /api/promotions`: Đọc dữ liệu ưu đãi admin tạo từ bảng Supabase `promotions` kết hợp đặc quyền `telco_perks` nằm trong JSONB `metadata` của listings để làm nguồn cho Chatbot AI tự động tư vấn khi khách hàng hỏi.

---

### 27. TAB SYSTEM SKUS (DANH MỤC SKU 4 TẦNG CORE CATALOG) — Path: `/skus`
Báo cáo và quản lý catalog sản phẩm cốt lõi của GoHub được phân rã thành 4 tầng riêng biệt để tránh trộn lẫn dữ liệu.

*   **Mô hình 4 tầng**:
    $$\text{Product (Gói thương mại)} \rightarrow \text{SKU (Mã kho bán)} \rightarrow \text{Listing (Đăng bán trên sàn)} \rightarrow \text{Item (Mã sim vật lý NCC)}$$
*   **listings dùng JSONB `metadata` (s89 Phase 2)**:
    Toàn bộ truy vấn thông tin listings chuyển sang đọc từ trường JSONB `metadata` (chứa hơn 40 keys/row) thay thế các cột phẳng cũ chuẩn bị bị DROP ở Phase 3.
*   **Truy vấn giá vốn**: Đọc trường `latest_cogs` và quy đổi giá vốn VND/USD thông qua tỷ giá nội bộ lưu trong `app_settings`.
