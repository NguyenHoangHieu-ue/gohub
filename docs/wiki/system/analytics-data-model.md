---
title: "Analytics — Mô Hình Dữ Liệu Chung (Data Model)"
page_type: reference
is_hidden: true
department: all
tags: [analytics, data-model, reference]
created: 2026-07-15
updated: 2026-07-15
status: active
---

# Analytics — Mô Hình Dữ Liệu Chung (Data Model)

> Trang **nền** cho MỌI tab analytics. Hầu hết tab (BOD, Channels, B2B, Orders, Products, Vendors, Customers, Staff, Fulfillment, All-Time, Dashboard, Targets…) đọc **cùng bộ bảng + cùng abstraction** này. Đọc trang này 1 lần → khỏi tra lại code cho từng tab.

---

## 1. Kho dữ liệu
- **Analytics DB = `gohub_dw`** (PostgreSQL trên GCP, LIVE). Env: `ANALYTICS_DB_*` trong `web/.env.local`. Đây là **nguồn sự thật** cho doanh thu/đơn/khách/nhân viên/lưu lượng.
- **Supabase** = sản phẩm/KB/cấu hình (partner tiers, channel costs, KPI targets, GA4 config…).
- **Turso** = `country_codes` (map nước) + vài config intel.
- Query analytics chạy qua endpoint **`POST /api/analytics/query`** (SELECT-only) hoặc các route API riêng.

## 2. Bảng FACT (số liệu)
| Bảng | Nội dung | Cột ngày |
|---|---|---|
| `fact_fulfillment_revenue` | Doanh thu **đã xuất/giao** (Fulfillment) — mặc định của hầu hết báo cáo | `fulfiled_date` |
| `fact_sales_revenue` | Doanh thu **theo ngày tạo đơn** (Sales/Created) | `created_date` |
| `fact_data_usage` | Lưu lượng data 3HK (xem [analytics-3hk-usage](analytics-3hk-usage.md)) | `first_report_date` |

## 3. Bảng DIM (danh mục)
| Bảng | Vai trò | Cột hay dùng |
|---|---|---|
| `dim_order_source` | Kênh bán | `code`, `channel_name`, `group_name` (B2B/B2C), `sub_group_name` (Websites/Mobile-App/Social…), `sapo_name` |
| `dim_sku` | Sản phẩm/SKU | `sku`, `vendor`, `category_name`, `type_of_sim` |
| `dim_customer` | Khách hàng | `code` (UNIQUE, khoá join), `name`. Từ 2026-07-21 thêm 12 cột (`sapocustomerid`, `organization`, `organization_code`, `customer_group_code`, `portal_type`, `invoice_subject_type`, `recon_cycle`, `price_list_code`, `currency_code`, `sales_pic_code`, `payment_term_code`, `status`) — hiện đa số NULL. Report chỉ dùng `code`+`name`; join `TRIM(customer_code)=TRIM(code)` khớp 100%, `code` không trùng nên KHÔNG nhân dòng. |
| `dim_staff` | Nhân viên | `code`, `name` |
| `dim_location` | Chi nhánh (KHÔNG phải nước!) | `location_id`, `location_name` |

> ⚠️ Map SKU→**nước đích** KHÔNG dùng `dim_location`; dùng vị trí ký tự trong `sku` + `country_codes` (Turso). Xem `getDestinationSQL`/`getCountryMappings`.

## 4. ⭐ Abstraction chung: `getAnalyticsSource(dateColumn)`

Hầu hết tab có toggle **"Fulfillment" vs "Created"** (nút ở đầu trang). Hàm `getAnalyticsSource` (trong `lib/analytics-helpers.ts`) đổi toàn bộ bảng/cột theo lựa chọn đó:

| Field | Fulfillment (mặc định) | Created (Sales) |
|---|---|---|
| `mainTable` | `fact_fulfillment_revenue` | `fact_sales_revenue` |
| `revenueCol` | `fulfilled_revenue_amount_vnd` | `sales_revenue_amount_vnd` |
| `quantityCol` | `fulfilled_quantity` | `quantity` |
| `dateCol` | `fulfiled_date` | `created_date` |
| `marginCol` (Gross Profit) | `gross_profit_vnd` | `0` *(bảng sales không có margin/cogs)* |
| `cogsCol` | `cogs_amount_vnd` | `0` |

→ **Khi ở chế độ "Created", margin/COGS = 0** (bảng sales không có). Chỉ Fulfillment mới có Gross Profit/CM1.

## 5. Lọc ngày & so sánh kỳ (`lib/analytics-helpers.ts`)
- `getDateFilter(sd, ed, dateCol)` → `f.<dateCol>::date BETWEEN sd AND ed` (hoặc mặc định N ngày gần nhất).
- `getPrevDateFilter(...)` → kỳ liền trước cùng độ dài (để tính MoM/so sánh).
- `safeDate()` / `safeCompanyCode()` → chống SQL injection cho tham số ngày/thị trường.
- `companyCode`: `ALL` | `VN` | `US` — lọc `f.company_code` (thị trường). Truyền vào getDateFilter ở nhiều route.

## 6. Kênh B2B vs B2C
- Phân biệt bằng `dim_order_source.group_name` = `'B2B'` / `'B2C'`.
- B2C tabs luôn lọc `WHERE UPPER(s.group_name) = 'B2C'`; B2B lọc `'B2B'`.
- "Strategic partners" (B2B) = danh sách trong Supabase `app_settings` (partner tiers) → so bằng `channel_name ILIKE ANY(...)`.

## 7. Thuật ngữ tài chính (chuẩn Management Report, đổi từ s74)
- **Revenue** = doanh thu.
- **Gross Profit (GP)** = Revenue − COGS (chi phí sản phẩm).
- **GPM %** = GP / Revenue.
- **CM1 (Contribution Margin 1)** = GP − Operation Cost (phí sàn/quảng cáo/tài trợ SP…). *(label cũ GP2/GPM2 đã đổi thành CM1; data key lowercase `gpm2`/`gpm2_percent` GIỮ nguyên để không vỡ shape.)*
- **CM1 %** = CM1 / Revenue.
- **3HK Contribution %** = Revenue từ SP 3HK (`vendor ILIKE '3HKDATAPOOL'`) / Total Revenue.

## 8. Cache & Bảo mật
- **Cache 2 tầng TTL 12h** (data gohub_dw đổi 1 lần/ngày) + cron prewarm 06:30 ICT. Dùng `cachedQuery(key, fn, ttlMin)` + `CACHE_HEADERS`.
- **Guard**: `analyticsGuard(req, session)` chặn theo role. Allow-list role của `/api/analytics/query` **phải gồm `creator`** (thiếu → creator thấy bảng rỗng, 403 âm thầm).
- Index gohub_dw = bỏ qua (không có quyền DB) → cache trong app là fix cuối.

## 9. Gotchas chung
- **Vendor 3HK** trong `dim_sku` lưu là `'3HK DATAPOOL'` (CÓ dấu cách) → lọc `REPLACE(UPPER(vendor),' ','')='3HKDATAPOOL'`.
- **Env Vercel**: `ANALYTICS_DB_*` phải tick scope **Preview** (thiếu → query trả `[]` âm thầm).
- **Created mode** không có margin → mọi chỉ số margin/CM1 sẽ = 0; đừng nhầm là "lỗi".
