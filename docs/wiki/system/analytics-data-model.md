---
title: "Analytics — Mô Hình Dữ Liệu Chung (Data Model)"
page_type: reference
is_hidden: true
department: all
tags: [analytics, data-model, reference]
created: 2026-07-15
updated: 2026-09-21
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
- **Cache 2 tầng TTL 60 phút** (`QUERY_TTL_MIN`, s199+3 2026-09-16 — hạ từ 12h sau khi verify qua `jobs`/
  `job_logs` gohub_dw: ETL fact_fulfillment_revenue/fact_sales_revenue chạy HÀNG GIỜ chứ không phải 1
  lần/ngày như giả định cũ; TTL 12h khiến 2 tab cache độc lập (vd B2B Performance vs Quarter Report) có
  thể lệch nhau tới nửa ngày doanh thu nếu không cùng bấm "Tải lại mới") + cron prewarm 06:30 ICT (giữ
  nguyên 1 lần/ngày — chỉ làm nóng cache đầu ngày, TTL ngắn hơn thì mỗi giờ tự làm mới khi có người xem).
  Dùng `cachedQuery(key, fn, ttlMin)` + `CACHE_HEADERS`. Áp dụng cho 20 route (BOD/B2B/B2C/Channels/
  Quarterly) import trực tiếp `QUERY_TTL_MIN` — vài route khác dùng cache riêng (my-metrics, fulfillment
  `cachedAnalyticsQuery`, all-time mặc định 10') KHÔNG bị ảnh hưởng bởi đổi này.
- **Guard**: `analyticsGuard(req, session)` chặn theo role. Allow-list role của `/api/analytics/query` **phải gồm `creator`** (thiếu → creator thấy bảng rỗng, 403 âm thầm).
- Index gohub_dw = bỏ qua (không có quyền DB) → cache trong app là fix cuối.
- **s200+6 (2026-09-17) — 2 phần vá kiến trúc cache theo yêu cầu Hiếu "giải quyết triệt để" hiện tượng
  đổi setting/target xong vẫn thấy số cũ, phải tự tay bấm "Tải lại mới"**:
  1. **Backend tự invalidate qua cache-key hash (không cần route ghi dữ liệu gọi flush riêng)** — audit
     phát hiện 6 route (`b2b/kpis`, `b2c/kpis`, `b2c/performance`, `b2c/trend`, `b2b/strategic-performance`,
     `monthly-kpis`) fetch `fetchQuarterlySettings().excludedCustomers` **fresh mỗi request** rồi bake vào
     SQL bên trong `cachedQuery`, nhưng **cache key KHÔNG hash theo `excludedCustomers`** → đổi danh sách
     loại trừ ở Quarter Report Settings không tự làm mới các route này (khác `b2b/trend`/`b2b/performance`/
     `quarterly-report`/`quarterly-b2b-customers` — các route này ĐÃ đúng từ trước, có `exclHash(...)`
     trong key). Fix: thêm `exclHash(excludedCustomers)` vào cache key, cùng pattern có sẵn — route write
     `quarterly-settings` KHÔNG cần sửa gì (tự invalidate qua key đổi, không phải qua flush chủ động).
     `partner_tiers` (Vendors/Strategic list riêng, khác `quarterly_tier_keywords`) đã đúng từ s195+8 (gọi
     `flushAnalyticsCache()` full-wipe khi lưu) — không cần sửa thêm.
  2. **ETL-completion-driven flush** (`/api/cron/etl-cache-sync`, KHÔNG đăng ký `vercel.json` — Hobby plan
     giới hạn 1 lần/ngày/job, không đủ tần suất theo kịp ETL chạy hàng giờ) — theo dõi trực tiếp
     `jobs`/`job_logs` (gohub_dw) cho 4 job ảnh hưởng số liệu BI nhiều nhất
     (`ETL_dim`/`ETL_vatdb_cogs`/`ETL_fact_fulfilment_revenue_from_ops_admin_v2`/
     `ETL_fact_sales_revenue_from_gohub_cloud`), lưu `end_time` mới nhất đã thấy vào `app_settings`
     (`etl_cache_sync_last_seen`) — job nào có `end_time` mới hơn → `flushAnalyticsCache()` ngay, không chờ
     TTL 60'. **Cần Hiếu**: thêm 1 job cron-job.org mới (cùng chỗ đang ping browserless keep-alive, xem
     mục "s195") gọi `GET https://<domain>/api/cron/etl-cache-sync` mỗi 10-15 phút với header
     `Authorization: Bearer $CRON_SECRET`. Có sẵn `POST` cùng route (yêu cầu login admin/creator) để tự bấm
     test tay trước khi setup cron-job.org.

## 9. Gotchas chung
- **Vendor 3HK** trong `dim_sku` lưu là `'3HK DATAPOOL'` (CÓ dấu cách) → lọc `REPLACE(UPPER(vendor),' ','')='3HKDATAPOOL'`.
- **Env Vercel**: `ANALYTICS_DB_*` phải tick scope **Preview** (thiếu → query trả `[]` âm thầm).
- **Created mode** không có margin → mọi chỉ số margin/CM1 sẽ = 0; đừng nhầm là "lỗi".
- **Mã nước từ SKU (`decodeSkuDestinationCode`/`getDestinationSQL`, s195+19, 2026-09-11)**: vị trí ký tự
  nước phụ thuộc ĐỘ DÀI sku, không phụ thuộc ký tự đầu — 13 ký tự (chuẩn hiện tại, digit 1-6 hay chữ A-E
  đều 1 ký tự) → nước ở ký tự 3-5; 14 ký tự (legacy) → ký tự 1-3; 15 ký tự (legacy Datapool) → ký tự
  2-4. Bug cũ branch theo ký tự đầu làm sai nước cho ~25% SKU 13 ký tự pháp nhân chữ (US A-E) — đã fix,
  xem comment trong `analytics-helpers.ts`. Dùng ở My Metrics/Products/Region Chart/B2B/B2C performance.

## 10. Hiệu năng — quy tắc bắt buộc khi viết SQL/route analytics (s203, 2026-09-21)

**Đo thật là gốc của mọi quyết định** — `/api/analytics/perf-probe` (creator-only) đo độ trễ từ vùng chạy function tới từng kho;
log `[analytics-db] SLOW wait=… run=…` (mọi query >1,5s) tách "chờ slot pool" khỏi "DB chạy lâu". Số đo s203 (function ở iad1):
gohub_dw ~30ms/query đơn giản · Turso ~150ms · **Supabase 280-450ms MỖI lần đọc/ghi** (bảng cache tới 1,3s vì JSON lớn) ·
Vercel Runtime Cache 4-15ms. Người dùng VN → edge HKG → function iad1 ⇒ ~280ms RTT tối thiểu mỗi request API.

**Quy tắc SQL**
- ⛔ KHÔNG bọc `TRIM()` lên cột PHÍA `dim_customer` trong JOIN/EXISTS. `TRIM(f.customer_code) = TRIM(c.code)` khiến Postgres không
  dùng khoá chính → join 355k dòng mất **9,6-10,9s**; `TRIM(f.customer_code) = c.code` chỉ ~1s, kết quả y hệt (đã verify:
  `dim_customer.code` 355.391 dòng và `fact.customer_code` 618.658 dòng đều không có khoảng trắng thừa/NULL/rỗng).
  `TRIM` phía fact vẫn giữ. Route mới: theo mẫu `LEFT JOIN dim_customer c ON TRIM(f.customer_code) = c.code`.
- Mỗi query quét cả bảng fact ~0,5-1s (không có index ngoài khoá chính, Hiếu không có DDL). Gộp nhiều query cùng bộ lọc thành 1 query
  hạt mịn rồi tách ở JS (mẫu: `lib/analytics-engine/quarter-rows.ts` gộp 7 query Quarter Report → 2).
- Nguồn I/O độc lập trong 1 route (query fact + chi phí Supabase + Turso + settings) → `Promise.all`, đừng `await` nối tiếp.
  Pool gohub_dw `max=3`/instance: nhiều query song song tự xếp hàng, không sợ.
- Đừng đưa vào cache một khối > 2MB (trần Runtime Cache; ghi lỗi chỉ `console.warn "[analytics-cache] L2 set lỗi"` rồi mất L2). Khối lớn
  → nén (mẫu: `packLifecycleRows`, 112k KH ~3,4MB → ~0,7MB gzip+base64) hoặc tách phần cần hiển thị.

**Kiến trúc cache (`cachedQuery`, `lib/analytics-helpers.ts`)**
- L1 Map trong instance (TTL 45s) + **L2 = Vercel Runtime Cache** (`@vercel/functions getCache`, namespace `aq`, dùng chung mọi
  instance trong vùng, sống qua deploy/cold start) — thay Supabase `analytics_query_cache` (bảng đó CHỈ còn registry prewarm
  `sqlreg:`/`urlreg:`). Runtime Cache tách `preview`/`production` → staging và production KHÔNG dùng chung cache.
- **Stale-while-revalidate**: hết TTL (mặc định 60' — `QUERY_TTL_MIN`) mà còn ≤ 6h → TRẢ NGAY bản cũ + tính lại ở nền (`waitUntil`).
  Người dùng không còn chờ cold-query trừ khi (a) khoá mới (khoảng ngày/bộ lọc chưa ai xem), (b) bản cũ > 6h, (c) `nocache=1`.
- Xoá cache: `flushByDeps([...])`/`flushAnalyticsCacheByPrefixes([...])` → `expireTag` (tag `dep:<tên>`, `pfx:<phần trước ':' đầu tiên>`);
  `flushAnalyticsCache()` = mốc **hard** (mọi bản cũ bị bỏ, tính lại đồng bộ) — route GHI dữ liệu dùng các hàm này như cũ.
  `softExpireAll()` = mốc **soft** (mọi cache thành "hết TTL", vẫn phục vụ bản cũ + làm mới nền) — dùng khi ETL nạp xong
  (`/api/cron/etl-cache-sync` gọi nó rồi prewarm 30 URL gần nhất, 3 luồng) thay cho xoá cứng.
- `nocache=1` (nút "Tải lại mới", prewarm cron) = `bypass`: tính lại ĐỒNG BỘ và ghi đè cache. Route B2C Advanced dùng `live=1`
  (bỏ snapshot nhưng vẫn qua cache SWR) — KHÔNG gửi `nocache=1` mỗi lượt xem.
- `lib/memo.ts` — memo 15-20s TRONG instance cho cấu hình đọc ở mọi request (`fetchQuarterlySettings`, `getPartnerTiers`,
  `user/me`, layout phân quyền), có dedupe request đồng thời; route ghi gọi `memoInvalidate(prefix)`.
- Request đồng thời cùng cache-key tới 1 instance chỉ chạy `fn` 1 lần (in-flight dedupe).
