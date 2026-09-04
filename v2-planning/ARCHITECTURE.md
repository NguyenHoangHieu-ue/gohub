# Tài liệu Kiến trúc Kỹ thuật Chi tiết (GoHub Intel v2 Blueprint)

> Tài liệu này mô tả chi tiết thiết kế hệ thống, kiến trúc lớp dữ liệu, thiết kế API, cơ chế phân quyền, quản lý cache, và tiêu chuẩn kiểm thử tự động của GoHub Intel v2.

---

## I. KIẾN TRÚC LỚP DỮ LIỆU HỢP NHẤT (UNIFIED DATABASE LAYER)

Để giải quyết vấn đề phân mảnh và phức tạp hóa luồng kết nối trong v1, GoHub Intel v2 áp dụng mô hình **Unified Data Layer (Lớp dữ liệu hợp nhất)** thông qua việc đóng gói các DB clients trong thư mục `src/core/db/`.

```
                  ┌─────────────────────────────────────────┐
                  │          Next.js App & API Routes       │
                  └────────────────────┬────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │       src/core/db/ (Unified DB)     │
                    └──────┬───────────────┬──────────────┬┘
                           │               │              │
    ┌──────────────────────▼──────┐ ┌──────▼──────┐ ┌─────▼───────────────┐
    │  gohub_dw (Postgres GCP)    │ │  Supabase   │ │  Turso (SQLite)     │
    │  - Báo cáo tài chính, đơn   │ │  - Catalog  │ │  - Chi phí B2B      │
    │  - Doanh thu, COGS          │ │  - Wiki, Target│ │ - Bản đồ nước      │
    └─────────────────────────────┘ └─────────────┘ └─────────────────────┘
```

### 1. Quản lý Kết nối và Pool Connection
*   **`gohub_dw`**: Sử dụng `pg-pool` với cơ chế serverless optimization (tự giải phóng kết nối sau 10 giây không hoạt động) tránh tràn RAM do Vercel Serverless Functions sinh ra nhiều instance.
*   **Supabase**: Sử dụng `@supabase/supabase-js` để thực hiện query dữ liệu catalog sản phẩm và CS tickets.
*   **Turso**: Sử dụng `@libsql/client` kết nối tới SQLite đám mây siêu nhẹ để tra cứu nhanh chi phí B2B và mã quốc gia.

### 2. Các bảng dữ liệu chính (DB Table Catalog)
*   **`gohub_dw` Fact & Dim**:
    *   `fact_fulfillment_revenue` & `fact_sales_revenue`
    *   `dim_order_source`, `dim_sku`, `dim_customer`, `dim_staff`
*   **Supabase Application DB**:
    *   `app_settings`: Lưu trữ cấu hình JSON chung (`fx` - tỷ giá, `3hk` - hệ số, `partner_tiers`, `b2c_kpi_targets`, `role_permissions`).
    *   `kb_wiki_pages`: Lưu dữ liệu trang trí tri thức đồng bộ từ Obsidian.
*   **Turso Config DB**:
    *   `b2b_customer_cost_monthly`: Bảng chi phí động của khách hàng B2B theo từng tháng.
    *   `okr_lark_events` & `okr_lark_message_log`: Log tin nhắn và hàng chờ duyệt SLA.

---

## II. THIẾT KẾ LỚP API PHÂN CẤP (CLEAN API ROUTING)

Các API endpoints được đặt trong `src/app/api/` và phân tách rõ ràng theo nhóm nghiệp vụ:

### 1. Nhóm API Báo cáo Phân tích (`/api/analytics/`)
*   `GET /api/analytics/bod-summary`: Trả về dữ liệu KPI strip của trang quản trị BOD (Revenue, GP, CM1, 3HK%).
*   `GET /api/analytics/b2b/kpis`: Trả về tổng quan hiệu suất sỉ B2B.
*   `GET /api/analytics/b2b/performance`: Trả về bảng chi tiết phân nhóm Strategic vs Non-Strategic.
*   `GET /api/analytics/b2c/monthly`: Trả về báo cáo tháng bán lẻ B2C (Revenue, CAC, Leads, CR, Spend).
*   `GET /api/analytics/b2c/metric`: Trả về bảng YTD Monthly cho B2C.

### 2. Nhóm API Cấu hình & Ngân sách (`/api/config/`)
*   `GET/POST /api/config/b2c-budget`: Quản lý ngân sách marketing của B2C theo vùng (US/VN).
*   `GET/POST /api/config/b2c-kpi-targets`: Thiết lập KPI targets (CAC, ROAS) cho bán lẻ.
*   `GET/POST /api/config/b2b-customer-costs`: Nhập chi phí động cho khách hàng sỉ.

### 3. Nhóm API OKRs & SLA (`/api/okr/`)
*   `GET /api/okr/my-metrics`: Toàn bộ chỉ số hiệu suất của cá nhân Hiếu.
*   `GET /api/okr/sku-scan`: Chạy thuật toán tự động quét SKU Pareto 80% đóng góp để tính weighted delta.
*   `POST /api/okr/lark-events/[id]/review`: API để phê duyệt/từ chối/chỉnh sửa giờ xử lý của các case SLA.

---

## III. QUY TRÌNH PHÂN QUYỀN CHẶT CHẼ (ROLE-BASED ACCESS CONTROL)

Hệ thống quản trị và phân tích có tính bảo mật cao, do đó phân quyền truy cập là bắt buộc:

### 1. Phân cấp Vai trò Người dùng (User Roles)
*   **`admin`**: Toàn quyền cấu hình hệ thống, sửa đổi tỷ giá, xem toàn bộ báo cáo và cấu hình.
*   **`creator`**: Vai trò vận hành hệ thống AI và cấu hình OKRs, được quyền ghi đè chi phí và quản lý webhook.
*   **`manager`**: Xem toàn bộ các báo cáo BI nhưng không sửa được cấu hình, tỷ giá.
*   **`staff`**: Bị ẩn toàn bộ giá vốn (COGS), biên lợi nhuận gộp (GPM%), và CM1. Chỉ được xem số lượng đơn, doanh thu và các tab nghiệp vụ thông thường.

### 2. Triển khai Lớp Bảo vệ (Security Guards)
*   Sử dụng **Middleware** hoặc helper **`analyticsGuard(req, session)`** tại đầu mỗi API Route để chặn quyền truy cập trái phép và tự động ghi log bảo mật (`access_audit_log`).
*   Tuyệt đối không kiểm tra quyền hoàn toàn ở Client-side; mọi kết quả trả về từ API đều phải được lọc thuộc tính tương ứng với Role của Token đăng nhập (ví dụ: gỡ sạch cột COGS khỏi JSON trả về cho tài khoản `staff`).

---

## IV. CƠ CHẾ CACHE THÔNG MINH HAI TẦNG (SMART L2 CACHING)

Báo cáo BI có lượng truy vấn rất lớn nhưng dữ liệu trong kho `gohub_dw` chỉ thay đổi một lần một ngày. Do đó hệ thống v2 áp dụng kiến trúc Cache 2 tầng:

1.  **L1 Cache (In-Memory)**: Cache lưu trực tiếp trong bộ nhớ RAM của Serverless Instance với thời gian sống (TTL) là **5 phút** để tránh việc người dùng F5 tải lại trang liên tục kích hoạt query DB.
2.  **L2 Cache (Supabase/Redis Cache Table)**: Cache tập trung chia sẻ giữa các Vercel Instances với TTL là **12 giờ**. 

### Quy trình Xóa Cache theo Nhóm (Scoped Cache Flush):
Khi người dùng sửa chi phí hoặc target, hệ thống không xoá sạch toàn bộ DB Cache mà chỉ xoá các Key có prefix khớp với nghiệp vụ đó để giữ hiệu năng tải trang cao:
*   Sửa chi phí khách hàng B2B → Chỉ xoá cache có tiền tố: `b2b-kpis`, `b2b-perf`, `b2b-trend`.
*   Sửa ngân sách/chi phí B2C → Chỉ xoá cache có tiền tố: `b2c-kpis`, `b2c-perf`, `b2c-trend`.

---

## V. KIỂM THỬ TỰ ĐỘNG & BẢO MẬT TRƯỚC KHI DEPLOY (CI/CD SPEC)

Hệ thống mới thiết lập quy trình kiểm thử nghiêm ngặt thông qua GitHub Actions nhằm triệt tiêu lỗi runtime:

### 1. Kiểm thử Biên dịch & Kiểu dữ liệu (TypeScript & Linter)
*   Mỗi khi tạo Pull Request (PR) vào nhánh `staging`, GitHub Runner sẽ tự động khởi chạy:
    ```bash
    npm run lint && tsc --noEmit
    ```
    *Chặn không cho phép Merge PR nếu có bất kỳ lỗi linter hoặc khớp kiểu dữ liệu tĩnh.*

### 2. Kiểm thử Logic Tài chính (Vitest Unit Tests)
*   Xây dựng bộ test suite `src/__tests__/formulas.test.ts` để kiểm tra độ chính xác của các thuật toán:
    *   Tính toán tỷ giá chéo và tính COGS của 3HK.
    *   Xử lý logic 3 bộ lọc chuẩn (Ship fee, Internal ops, Ops customers).
    *   Thuật toán quét Pareto 80% doanh thu tích lũy SKU.

### 3. Kiểm thử Giao diện (Playwright Smoke Tests)
*   Tự động hóa kịch bản chạy giả lập trình duyệt trên môi trường ảo:
    *   Đăng nhập tài khoản test với Role `staff` -> Xác nhận không thể truy cập trang `/analytics/bod` và các trường GPM/COGS bị ẩn thành công.
    *   Đăng nhập tài khoản `admin` -> Click mở đồ thị -> Xác nhận đồ thị hiển thị đúng, không bị lỗi `NaN` và nhãn chữ dài được cắt chuỗi thông minh.
