# Sổ tay Công thức & Logic Phân tích Toàn Hệ thống (GoHub Analytics Registry)

> Tài liệu này tổng hợp 100% công thức toán học, logic lọc, định nghĩa tài chính và quy tắc kết nối cơ sở dữ liệu từ phiên bản GoHub Intel v1. Hệ thống mới (v2) bắt buộc phải tuân thủ và triển khai chính xác 1-1 các công thức dưới đây.

---

## I. CHỈ SỐ TÀI CHÍNH QUẢN TRỊ (MANAGEMENT FINANCIAL METRICS)

Các chỉ số tài chính tuân thủ theo tiêu chuẩn Báo cáo Quản trị Doanh nghiệp (BOD):

### 1. Doanh thu (Revenue)
*   **Công thức**: 
    $$\text{Revenue} = \sum(\text{doanh\_thu\_amount})$$
*   **Ý nghĩa**: Tổng số tiền thu về từ việc bán sản phẩm SIM/eSIM.
*   **Trường dữ liệu**:
    *   *Chế độ Fulfillment (Mặc định)*: `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd`
    *   *Chế độ Created (Ngày tạo đơn)*: `fact_sales_revenue.sales_revenue_amount_vnd`

### 2. Giá vốn (COGS)
*   **Công thức**:
    $$\text{COGS} = \sum(\text{cogs\_amount})$$
*   **Ý nghĩa**: Tổng chi phí nhập phôi SIM/eSIM và gói cước trực tiếp từ các nhà cung cấp (3HK, WM...).
*   **Trường dữ liệu**:
    *   *Chế độ Fulfillment (Mặc định)*: `fact_fulfillment_revenue.cogs_amount_vnd`
    *   *Chế độ Created (Ngày tạo đơn)*: Mặc định bằng **0** (Bảng `fact_sales_revenue` không chứa trường giá vốn).

### 3. Lợi nhuận gộp (Gross Profit - GP)
*   **Công thức**:
    $$\text{Gross Profit} = \text{Revenue} - \text{COGS}$$
*   **Trường dữ liệu**:
    *   *Chế độ Fulfillment (Mặc định)*: `fact_fulfillment_revenue.gross_profit_vnd`
    *   *Chế độ Created*: Bằng **0** (hoặc bằng chính doanh thu do COGS = 0, tuy nhiên không mang ý nghĩa quản trị lợi nhuận).

### 4. Biên lợi nhuận gộp (Gross Profit Margin - GPM%)
*   **Công thức**:
    $$\text{GPM \%} = \frac{\text{Gross Profit}}{\text{Revenue}} \times 100$$

### 5. Chi phí Vận hành Kênh (Operation Cost - OpCost)
Chi phí này được nhập thủ công và phân bổ dựa trên kênh (Channel) hoặc khách hàng (Customer):
*   **Kênh bán lẻ B2C**: Lấy từ bảng Supabase `analytics_channel_costs` (Ads, Platform Fee, Sponsor Products, Media) hoặc bảng tổng hợp `analytics_channel_group_costs`.
*   **Kênh bán sỉ B2B**: Lấy từ bảng Turso `b2b_customer_cost_monthly` dựa trên `customer_code`.
*   **Cách phân bổ Group Cost**: Chi phí cấp nhóm kênh (ví dụ: nhóm B2B) được phân bổ theo tỷ trọng doanh thu (Revenue Share) giữa các phân nhóm/khách hàng con để tránh việc cộng trùng 2 lần:
    $$\text{Group Cost phân bổ cho A} = \text{Tổng Group Cost} \times \frac{\text{Revenue of A}}{\text{Tổng Revenue của Group}}$$

### 6. Lợi nhuận đóng góp 1 (Contribution Margin 1 - CM1)
*   **Công thức**:
    $$\text{CM1} = \text{Gross Profit} - \text{Operation Cost}$$
*   **Biên CM1%**:
    $$\text{CM1 \%} = \frac{\text{CM1}}{\text{Revenue}} \times 100$$

### 7. Tỷ trọng Doanh thu 3HK (3HK Contribution %)
*   **Công thức**:
    $$\text{3HK Contribution \%} = \frac{\sum(\text{Revenue WHERE vendor ILIKE '3HKDATAPOOL'})}{\text{Total Revenue}} \times 100$$
*   **Lưu ý**: Khớp chuỗi vendor sử dụng `TRIM(UPPER(vendor)) = '3HKDATAPOOL'` (loại bỏ khoảng trắng dư thừa).

---

## II. CHỈ SỐ BÁN LẺ B2C (B2C PERFORMANCE METRICS)

Đo lường toàn diện hiệu quả kinh doanh bán lẻ từ phễu chuyển đổi (Traffic → Leads → Customers → Sales):

### 1. Giá mua lại khách hàng (Customer Acquisition Cost - CAC)
*   **Công thức**:
    $$\text{CAC} = \frac{\text{Tổng chi phí Marketing thực tế}}{\text{Số lượng khách hàng mới (New Customers)}}$$
*   **Khách hàng mới**: Được định nghĩa là khách hàng phát sinh đơn hàng đầu tiên (`customer_code` xuất hiện lần đầu trên hệ thống). Lấy từ Admin API `/v1/internal/customers/revenue` (Summary Page 1).

### 2. Hiệu suất quảng cáo (Return on Ad Spend - ROAS)
*   **Công thức**:
    $$\text{ROAS} = \frac{\text{Doanh thu bán lẻ B2C}}{\text{Tổng chi phí Marketing thực tế}}$$

### 3. Chi phí cho mỗi Lead (Cost Per Lead - CPL)
*   **Công thức**:
    $$\text{CPL} = \frac{\text{Tổng chi phí Marketing thực tế}}{\text{Tổng số Leads (Chatwoot/Omni/Turso)}}$$
*   **Quy tắc đếm Leads**: Chỉ tính các Lead có trạng thái thuộc tập: `New Lead`, `New Lead EC`, `Sales Consulting`, `Waiting Payment`, `Need Sales Follow-up`, `Purchased`. Loại bỏ các trạng thái không phát sinh tư vấn thật như: `No Need`, `Handover To CS`, `Internal Checking`, `Order Issue`, `Resolved`, `Troubleshoot`.

### 4. Tốc độ chi tiêu Marketing (Spend Pace)
*   **Công thức**:
    $$\text{Spend Pace} = \frac{\text{Chi phí thực tế phát sinh}}{\text{Ngân sách Marketing được duyệt (Budget)}} \times 100\%$$

### 5. Tỷ lệ chuyển đổi website (Conversion Rate - CR)
*   **Công thức**:
    $$\text{CR} = \frac{\text{Số lượng đơn hàng hoàn tất}}{\text{Tổng số lượt truy cập (Sessions từ GA4)}} \times 100\%$$

---

## III. QUY TẮC LỌC CHUẨN TRONG SQL (STANDARD FILTERS SQL SPEC - S132)

Để đảm bảo số liệu báo cáo khớp 100% với số liệu kiểm toán (raw data), tất cả câu truy vấn SQL chạy trên `gohub_dw` bắt buộc phải được ghép các đoạn điều kiện lọc chuẩn động dưới đây:

### 1. Phí vận chuyển (`shipFilter`)
*   *Mục tiêu*: Loại bỏ dòng phí ship `SHIPPINGFEE0` để lấy doanh thu sản phẩm thuần.
*   *SQL Snippet*:
    ```sql
    -- Khi includeShip = false
    AND f.sku != 'SHIPPINGFEE0'
    ```

### 2. Đơn hàng nội bộ (`internalOpsFilter`)
*   *Mục tiêu*: Loại bỏ các đơn giao dịch nội bộ của công ty (có COGS nhưng doanh thu = 0, gây GP âm nặng).
*   *SQL Snippet (Khi đã JOIN bảng s = dim_order_source)*:
    ```sql
    -- Khi includeInternalOps = false
    AND UPPER(COALESCE(s.group_name, '')) != 'INTERNAL-TRANSACTION'
    ```
*   *SQL Snippet (Dùng subquery khi chưa JOIN bảng order source - `internalOpsFilterByCode`)*:
    ```sql
    -- Khi includeInternalOps = false
    AND f.order_source_code NOT IN (
        SELECT code FROM dim_order_source 
        WHERE UPPER(COALESCE(group_name, '')) = 'INTERNAL-TRANSACTION'
    )
    ```

### 3. Loại bỏ khách hàng Ops / Test (`excludeOpsByCode`)
*   *Mục tiêu*: Loại bỏ các tài khoản sỉ/lẻ phục vụ nội bộ/vận hành (ví dụ: B2B Ops, B2C Customer VN, B2C Customer US).
*   *SQL Snippet*:
    ```sql
    -- Loại bỏ danh sách tên khách hàng bị loại trừ (excludedCustomers)
    AND COALESCE(TRIM(f.customer_code), '') NOT IN (
        SELECT TRIM(code) FROM dim_customer 
        WHERE name IN ('B2B Ops', 'B2C Customer US', 'B2C Customer VN') -- danh sách động từ config
    )
    ```

### 4. Loại bỏ khách hàng Inactive (`excludeInactiveCustomers`)
*   *Mục tiêu*: Loại bỏ các tài khoản sỉ có tên chứa "INACTIVE" để số liệu B2B Performance khớp tuyệt đối với Quarter Report.
*   *SQL Snippet*:
    ```sql
    AND NOT EXISTS (
        SELECT 1 FROM dim_customer ic 
        WHERE TRIM(ic.code::text) = TRIM(f.customer_code) 
          AND UPPER(COALESCE(ic.price_list_name, '')) LIKE '%INACTIVE%'
    )
    ```

---

## IV. CÔNG THỨC KHAI THÁC QUỐC GIA TỪ SKU (SKU GEOGRAPHICAL PARSING SQL)

Do bảng `dim_location` chỉ chứa thông tin chi nhánh lấy hàng vật lý ("Tân Sơn Nhất", "ESIM Only"...) chứ không chứa địa bàn sử dụng của sản phẩm, hệ thống bắt buộc phải giải mã (decode) mã quốc gia đích trực tiếp từ chuỗi ký tự SKU.

### 1. Biểu thức SQL giải mã Quốc gia đích (`getDestinationSQL`)
Dựa trên cấu trúc đặt tên họ SKU thực tế của GoHub:
*   **Họ SKU bắt đầu bằng số** (Catalog cũ): Mã nước nằm ở ký tự 3 đến 5 (độ dài 3) -> Ví dụ: `2CTHACBF05010` -> `THA` (Thái Lan).
*   **Họ SKU bắt đầu bằng chữ 'E'** (eSIM mới): Mã nước nằm ở ký tự 2 đến 4 (độ dài 3) -> Ví dụ: `EJPNBCPY500M30D` -> `JPN` (Nhật Bản).
*   **Họ SKU khác** (Sản phẩm legacy, 3HK...): Mã nước nằm ở ký tự 1 đến 3 (độ dài 3) -> Ví dụ: `CHN3D07GBFY05D` -> `CHN` (Trung Quốc).

```sql
CASE
  WHEN f.sku ~ '^[1-6]'            THEN UPPER(SUBSTRING(f.sku, 3, 3))
  WHEN f.sku ~ '^E'               THEN UPPER(SUBSTRING(f.sku, 2, 3))
  WHEN f.sku ~ '^[A-DF-Z]{3}[0-9]' THEN UPPER(SUBSTRING(f.sku, 1, 3))
  ELSE UPPER(SUBSTRING(f.sku, 1, 3))
END
```

### 2. Ánh xạ Mã nước ra Tên quốc gia (`getCountryMappings`)
Mã nước 3 chữ cái thu được từ biểu thức trên sẽ được JOIN hoặc map thủ công với bảng SQLite **`country_codes`** trên Turso:
```sql
-- Query lấy bảng mã nước sống động
SELECT code, country FROM country_codes
```
*Ví dụ: `THA` -> `Thailand`, `JPN` -> `Japan`, `CHN` -> `China`.*

---

## V. CÔNG THỨC GIÁ NHẬP & TỶ GIÁ (3HK COGS & FX RATES)

### 1. Công thức tính GB tiêu thụ thực tế của 3HK
Do 3HK tính phí dựa trên dữ liệu tiêu thụ thực tế thay vì dung lượng danh nghĩa, hệ số thực tế (Default Coefficients) được áp dụng để tính toán giá nhập kế hoạch (COGS):

*   **Gói Fixed Data** (Dung lượng cố định):
    $$\text{GB thực tế} = \text{Dung lượng gói (GB)} \times 0.55$$
*   **Gói Daily Data** (Dung lượng theo ngày):
    $$\text{GB thực tế} = \text{Dung lượng mỗi ngày (GB)} \times \text{Số ngày} \times 0.40$$
*   **Gói Unlimited 10 Mbps**:
    $$\text{GB thực tế} = 1.8 \text{ GB} \times \text{Số ngày}$$
*   **Gói Unlimited 5 Mbps**:
    $$\text{GB thực tế} = 1.6 \text{ GB} \times \text{Số ngày}$$

*Hệ số này có thể điều chỉnh linh hoạt trong Admin Panel.*

### 2. Tra cứu giá vùng (Zone Pricing)
*   **Châu Á 12 nước**: $5.0 \text{ HKD/GB}$
*   **Châu Âu + Mỹ**: $7.0 \text{ HKD/GB}$
*   **Úc + New Zealand**: $6.5 \text{ HKD/GB}$

### 3. Công thức quy đổi tiền tệ đa lớp (Multi-layer FX Conversion)
Tỷ giá nội bộ hiện hành (Tháng 06/2026):
*   $1 \text{ USD} = 26.394 \text{ VND}$ (Lưu trong `fx.usd_vnd`)
*   $1 \text{ USD} = 7.798 \text{ HKD}$ (Lưu trong `fx.hkd_usd`)
*   $1 \text{ USD} = 31.452 \text{ TWD}$ (Lưu trong `fx.twd_usd`)

**Công thức quy đổi giá nhập 3HK ra VND**:
$$\text{Giá nhập (VND)} = \left( \frac{\text{GB thực tế} \times \text{Giá vùng HKD/GB}}{7.798} \right) \times 26.394$$

---

## VI. CƠ CHẾ QUÉT KPI CHỦ ĐỘNG (OKR ACTIVE AUTO-SCAN - S167)

### 1. SKU Gross Margin KPI (Auto-scan toàn hệ thống)
Hệ thống tự động quét toàn bộ SKU phát sinh giao dịch trong quý thay thế cơ chế tag tay cũ:
1.  **Bước 1**: Truy vấn danh sách SKU và tính doanh thu tích lũy quý này vs quý trước.
2.  **Bước 2**: Đánh giá Pareto 80% đóng góp doanh thu để lọc ra tập **SKU trọng điểm** (`is_key = true`).
3.  **Bước 3**: Tính biến động Margin% ($\Delta \text{ Margin\%}$) của từng SKU trọng điểm hoặc SKU mới phát sinh trong quý so với baseline chung $36.7\%$.
4.  **Bước 4**: Tính chỉ số thay đổi Margin có trọng số (Weighted Delta GM) - đây là điểm KPI chính thức:
    $$\text{Weighted Delta GM} = \frac{\sum (\Delta \text{Margin\%}_i \times \text{Revenue}_i)}{\sum \text{Revenue}_i} \quad \text{với } i \in \{ \text{SKU Trọng điểm } \cup \text{ SKU Mới} \}$$

### 2. SLA & Vendor Selection Speed (Lark AI review queue)
Hệ thống không tự động tính trực tiếp giờ phản hồi nhằm tránh AI nhận diện sai luồng chat. Quy trình gồm:
1.  **Capture**: Lark Webhook bắt real-time tin nhắn, ghi vào `okr_lark_message_log`.
2.  **Phân nhóm (Threading)**: Ghép các tin nhắn có chung `Thread Root ID` thành một chuỗi hội thoại.
3.  **Phân tích (AI Classify)**: Gemini AI quét hội thoại để xác định thời điểm gửi yêu cầu (`request_time`) và thời điểm hoàn tất xử lý (`completion_time`), phân loại thuộc nhóm `sla` hoặc `vendor_speed`.
4.  **Duyệt (Review Queue)**: Đưa vào hàng chờ duyệt `/analytics/my-metrics/lark-events`. Quản trị viên bấm Xác nhận/Sửa giờ thì dữ liệu mới được chính thức tính vào KPI trung bình quý.
