-- v28b: Seed Creator Knowledge Base — định nghĩa toàn bộ database schema
-- Chạy SAU v28_creator_kb.sql trong Supabase SQL Editor

INSERT INTO creator_kb (key, category, title, content) VALUES

-- ═══════════════════════════════════════════════════════════════════════════
-- CATEGORY: notes — Kiến trúc tổng thể
-- ═══════════════════════════════════════════════════════════════════════════

('db_architecture_overview', 'notes', 'Kiến trúc Database tổng thể', '## 3 Database của GoHub Intel

| Database | Loại | Mục đích | Ai có quyền đụng |
|---|---|---|---|
| **Supabase** | PostgreSQL (cloud) | Sản phẩm PM + config hệ thống + KB/Wiki | Server-side (supabaseAdmin) |
| **gohub_dw** | PostgreSQL (GCP) | Analytics DW — fact doanh thu/đơn/usage | Chỉ đọc (SELECT) qua queryAnalytics() |
| **Turso** | SQLite edge | Config intel (FX rates, GA4, B2B costs) | Server-side qua Turso SDK |

**Nguyên tắc quan trọng:**
- PM Supabase = source of truth cho sản phẩm (mã MỚI, thông tin MỚI)
- gohub_dw = lịch sử đơn hàng (còn nhiều mã CŨ lẫn lộn)
- Turso = chỉ config, KHÔNG có fact/transaction data
- **KHÔNG được đụng Turso hay gohub_dw khi update** — chỉ write vào Supabase'),

('db_supabase_overview', 'notes', 'Supabase — Tổng quan các nhóm bảng', '## Supabase: Nhóm bảng và mục đích

### 1. Catalog sản phẩm PM (source of truth)
| Bảng | Mục đích |
|---|---|
| `products` | Product master — mã 8 ký tự, thông tin cấp product |
| `skus` | SKU variants — mã 13 ký tự, COGS, specs chi tiết |
| `listings` | Bảng giá B2C hiển thị trên web |
| `items` | Bảng giá B2B/wholesale với alias gửi đối tác |
| `sku_catalog` | Cache lookup nhanh SKU theo nhóm nước |

### 2. Catalog NCC (nhà cung cấp)
| Bảng | Mục đích |
|---|---|
| `ncc_worldmove` | Catalog WorldMove — 8.921 rows, có flag exist=Yes/No |
| `ncc_3hk` | Catalog 3HK zones + giá HKD/GB |
| `ncc_datapool` | 3HK Datapool (throttle_speed, country) |
| `ncc_products_unified` | Catalog NCC hợp nhất |
| `ncc_vendor_config` | Cấu hình vendor NCC |
| `data_file_registry` | Tracking file NCC đã import |

### 3. Bảng tham chiếu
| Bảng | Mục đích |
|---|---|
| `ref_countries` | Danh mục nước (ISO code, tên VN/EN) |
| `ref_categories` | Nhóm nước/category (mã 3 ký tự) |
| `ref_support_countries` | Mapping group code → danh sách nước |
| `ref_vendors` | Danh mục vendor |

### 4. Analytics config (KHÔNG phải fact — fact ở gohub_dw)
| Bảng | Mục đích |
|---|---|
| `analytics_monthly_kpis` | Snapshot KPI tháng: revenue, GP, CM1, 3HK% |
| `analytics_channel_costs` | Operation cost theo kênh (nguồn tính CM1) |
| `analytics_channel_group_costs` | Operation cost theo group kênh |
| `analytics_target_planning` | Kế hoạch target |
| `analytics_cost_input_settings` | Cấu hình nhập chi phí |
| `b2c_report_monthly_snapshots` | Snapshot báo cáo B2C theo tháng |
| `analytics_feedbacks` | Feedback user trên các tab analytics |

### 5. Knowledge Base / Wiki
| Bảng | Mục đích |
|---|---|
| `kb_wiki_pages` | Trang wiki nội bộ (title, content, version, is_hidden) |
| `kb_wiki_versions` | Lịch sử versions wiki |
| `kb_documents` | Tài liệu KB upload |
| `kb_chunks` | Chunks + embedding (vector search) |
| `creator_kb` | Knowledge Base riêng của Creator (Gấu Pro) |

### 6. Lịch & thông báo
| Bảng | Mục đích |
|---|---|
| `analytics_scheduled_messages` | Lịch gửi tin Lark (từ analytics tab) |
| `lark_scheduled_messages` | Lịch gửi tin Lark (global) |
| `notifications` | Thông báo trong app (per user) |

### 7. Nhạy cảm — chỉ admin/creator
| Bảng | Mục đích |
|---|---|
| `users` | Tài khoản người dùng (email, role, department) |
| `app_settings` | Cấu hình hệ thống (policy, secrets, portal creds) |
| `conversations` | Hội thoại Bé Gấu (PII) |
| `chat_messages` | Tin nhắn Bé Gấu (PII) |
| `analytics_conversations` | Hội thoại BI analyst (PII) |
| `analytics_messages` | Tin nhắn BI analyst (PII) |
| `lark_chat_history` | Lịch sử chat Lark (PII) |
| `lark_cs_tickets` | Ticket CS từ Lark Base (PII khách hàng) |
| `user_notes` | Ghi chú cá nhân người dùng |
| `sync_log` | Log đồng bộ dữ liệu |'),

('db_gohub_dw_overview', 'notes', 'gohub_dw — Analytics Data Warehouse (PostgreSQL GCP)', '## gohub_dw: Toàn bộ bảng

**Lưu ý quan trọng:**
- ETL chạy lúc **08h mỗi ngày** → dữ liệu hôm nay chưa đầy đủ → LUÔN cắt tại `CURRENT_DATE - 1`
- Chỉ được **đọc** (SELECT/WITH), không được write
- Còn nhiều mã sản phẩm CŨ lẫn lộn với mã mới

### FACT TABLES

**fact_fulfillment_revenue** (~575k rows) — Doanh thu theo ngày fulfil
```
order_code, sku, order_source_code, company_code, location_id,
staff_code, customer_code, currency,
created_date (TEXT), fulfiled_date (TEXT — chỉ 1 chữ "l"!),
fulfilled_quantity, fulfilled_revenue_amount_vnd,
unit_price_after_discount_vnd, unit_cost_price_vnd,
cogs_amount_vnd, gross_profit_vnd
```
→ Bảng CHÍNH cho revenue/GP/CM1. Ưu tiên cột *_vnd.
⚠️ KHÔNG dùng `fact_fulfilment_revenue_power_bi` (Power BI copy, double-count)

**fact_sales_revenue** (~145k rows) — Doanh số theo ngày đặt đơn
```
detail_id, order_code, sku, order_source_code, company_code,
customer_code, staff_code, location_id, item_code,
created_date (TEXT), use_date, completed_date,
status, sales_status, order_type,
quantity, unit_price_vnd, unit_discount_vnd,
allocated_order_discount_vnd, unit_price_after_discount_vnd,
sales_revenue_amount_vnd
```
→ Khác fact_fulfillment_revenue: dùng `created_date` thay vì `fulfiled_date`

**fact_data_usage** (~132k rows) — Mức sử dụng data eSIM 3HK
```
iccid, order_code, sku, sku_type, activation_date, first_report_date,
day_amount, total_data_gb, data_amount_gb, usage_pct,
usage_class (Unused/Low<30%/Medium 30-70%/High>70%/Over 100%),
month_tag (TEXT format YYYY-MM)
```

**data_usage_log** (~1.1M rows) — Log hàng ngày từ 3HK
```
report_date, sales_channel, iccid, offer_name, country, data_gb
```
→ Dùng cho báo cáo usage theo nước. Lọc `report_date IS NOT NULL`

### DIMENSION TABLES

**dim_order_source** — Kênh bán
```
code, name, sapo_name, status,
group_name (B2B/B2C), channel_name, sub_group_name, legal_name
```
→ JOIN: `fact.order_source_code = dim_order_source.code`

**dim_sku** — Thuộc tính SKU
```
sku (TEXT — KHÔNG phải sku_code!), vendor, category_name,
product_type, type_of_sim (eSIM/SIM),
purchase_type, standard_cogs_vnd, cost_source, item_code
```
→ JOIN: `TRIM(fact.sku) = TRIM(dim_sku.sku)`
⚠️ vendor inconsistent: "3HK DATAPOOL" (space) VÀ "3HK" → dùng `REPLACE(UPPER(TRIM(vendor)),'' '','''') LIKE ''3HK%''`

**dim_customer** — Khách hàng (355k rows, 99.7% B2C)
```
code, name (PII!), price_list_name (NULL=B2C; Strategic/VIP/Gold/Silver=B2B tier),
currency_code (VND/USD), status, sales_pic_code,
recon_cycle, invoice_subject_type, payment_term_code
```
→ JOIN: `TRIM(fact.customer_code) = TRIM(dim_customer.code)` — LUÔN TRIM
⚠️ Loại 3 KH hệ thống: name ILIKE ''%B2C Customer%'' OR ILIKE ''%B2B Ops%''

**dim_staff** — Nhân viên
```
code, name, phone (PII!), email (PII!)
```
→ JOIN: `TRIM(fact.staff_code) = TRIM(dim_staff.code)`
⚠️ KHÔNG trả phone/email — là PII. Name được phép show.

**dim_location** — Kho/chi nhánh (KHÔNG phải quốc gia)
```
location_id, location_name
```
Values: Cầu Giấy - Hà Nội, Bạch Đằng - HCM, Tân Sơn Nhất - HCM,
Trần Tống - Đà Nẵng, B2B Only HN/HCM, Kho Tổng, ESIM Only, Unknown (id=0)
→ eSIM/DATAPOOL thường có location_id=0 (bình thường, không phải lỗi)

**dim_date** — Calendar
```
date_code, year, month, week_in_year, day_of_week, year_month
```
⚠️ KHÔNG JOIN dim_date — fact dùng TEXT dates → cast `fulfiled_date::DATE` trực tiếp

**company** — Công ty
```
code (VN/SG/HK/US), name
```
4 entities: GoHub VN, GoHub Singapore, GoHub HK, GoHub Inc (US)

**exchange_rate** — Tỷ giá lịch sử
```
company_code, currency_code, from_date, rate
```'),

('db_turso_overview', 'notes', 'Turso — Config Database (SQLite edge)', '## Turso: Config cho GoHub Intel

**Mục đích:** Lưu config hệ thống Intel (KHÔNG có fact/transaction data)
**Access:** Server-side qua Turso SDK (`TURSO_URL` + `TURSO_AUTH_TOKEN`)
**Rule:** KHÔNG đụng Turso khi update data — chỉ đọc để lấy config

### Các bảng chính

| Bảng | Nội dung |
|---|---|
| `app_config` | Config key-value tổng quát |
| `ga4_configs` | Cấu hình Google Analytics 4 (property IDs) |
| `b2b_customer_cost_monthly` | Chi phí per-customer B2B theo tháng (CH.Cost) |

### app_config keys quan trọng
- `ga4_configs`: JSON array cấu hình GA4 properties
- FX rates được lưu ở đây trước khi sync sang Supabase

**Lưu ý:** Turso là SQLite — syntax khác PostgreSQL (không có ILIKE, dùng LOWER() + LIKE)'),

-- ═══════════════════════════════════════════════════════════════════════════
-- CATEGORY: product_codes — Cấu trúc mã
-- ═══════════════════════════════════════════════════════════════════════════

('product_code_structure', 'product_codes', 'Cấu trúc Product Code (8 ký tự)', '## Product Code = 8 ký tự

```
[source_type(1)][product_type(1)][country_group(3)][vendor_code(2)][data_policy(1)]
```

### source_type (ký tự 1)
**VN entity:**
- `1` = StockDirect
- `2` = InternalGHI
- `3` = MonthlyInv
- `4` = TelcoBalance
- `5` = Datapool
- `6` = Others

**US entity:**
- `A` = StockDirect
- `B` = Internal
- `C` = MonthlyInv
- `D` = TelcoBalance
- `E` = Datapool

### product_type (ký tự 2)
- `A` = Datapack
- `B` = eSIM Profile
- `C` = eSIM Full
- `D` = SIM Frame
- `E` = SIM Full
- `F` = Phí Ship
- `G` = Quà tặng
- `H` = Khác
- `1` = eSIM Full VN
- `2` = SIM Full VN
- `3` = Phí Ship VN
- `4` = Dịch vụ VAT VN

### country_group (ký tự 3-5)
Mã 3 ký tự từ bảng `ref_categories` — có thể là mã nước đơn hoặc nhóm nước đa quốc gia.

### vendor_code (ký tự 6-7)
- `WM` = WorldMove
- `3H` = 3HK
- `3D` = 3HK Datapool
- `JY` = JoyTel
- `CM` = CMLink
- `BC` = Birdy Connect
- `KD` = KDDI

### data_policy (ký tự 8)
- `A` = Daily Unlimited 5Mbps
- `B` = Daily 10Mbps
- `C` = Unlimited 20Mbps
- `D` = Unlimited 100Mbps
- `E` = Fixed 5Mbps
- `F` = Fixed < 2Mbps
- `G` = Fixed 10Mbps
- `H` = Unlimited 5Mbps
- `K` = No data
- `P` = Daily < 2Mbps
- `Y` = Fixed no-throttle
- `Z` = Daily no-throttle

**Ví dụ:** `1CJPNWM1` = VN · eSIM Full · Japan · WorldMove · Daily Unlimited 5Mbps

### Các cột khác trong bảng products
- `tenant`: VN (GoHub JSC) hoặc US (GoHub Inc)
- `kyc_code`: 1 = Không cần KYC, 6 = Cần KYC
- `purchase_type`: Manual Purchase / API Purchase / Only Stock
- `local_phone_number`: Yes/No — có số điện thoại nội địa đi kèm
- `apn_original`: APN gốc từ nhà mạng | `apn`: APN cài trên thiết bị'),

('sku_code_structure', 'product_codes', 'Cấu trúc SKU Code (13 ký tự)', '## SKU Code = 13 ký tự

```
[product_code(8)][data_amount_code(3)][day_amount(2)]
```

### data_amount_code (ký tự 9-11)
- Số GB dạng 3 ký tự: `005` = 5GB, `010` = 10GB, `999` = Unlimited
- Daily GB: `P01` = 1GB/day, `P02` = 2GB/day, `P03` = 3GB/day

### day_amount (ký tự 12-13)
- Số ngày dạng 2 ký tự: `03` = 3 ngày, `07` = 7 ngày, `30` = 30 ngày

**Ví dụ:** `1CJPNWM10014` = product 1CJPNWM1 + 001GB + 14 ngày

### Các cột quan trọng trong bảng skus
- `data_amount`: dung lượng GB (9999 = Unlimited)
- `day_amount`: số ngày sử dụng data (≠ `expirations`)
- `expirations`: ngày SIM còn hiệu lực sau kích hoạt (≥ day_amount)
- `latest_cogs` + `latest_cogs_currency`: COGS mới nhất (USD/VND/TWD/HKD)
- `throttle_speed`: tốc độ sau khi hết data highspeed (Mbps)
- `sim_esim`: SIM / eSIM
- `call`: Yes / No / null (null ≠ không hỗ trợ — phải đọc note)
- `call_sms_details`: chi tiết gọi điện và SMS
- `hotspot`: Yes / No (null ≠ không hỗ trợ)
- `network_type`: 4G / 5G/4G
- `vendor_sku`: mã SKU eSIM của nhà cung cấp
- `vendor_sku_sim`: mã SKU SIM vật lý
- `frame`: SKU base/frame liên kết
- `datapack`: SKU data riêng
- `note`: ghi chú team — LUÔN đọc trước khi kết luận về tính năng'),

('listing_code_structure', 'product_codes', 'Cấu trúc Listing Code (11 ký tự)', '## Listing Code = 11 ký tự

```
[listing_type(3)][product_code(8)]
```

### listing_type (ký tự 1-3)
Mã 3 ký tự của bảng giá B2C (ví dụ: BSP, VNT, UST...)

### Các cột trong bảng listings
- `listing_code`: mã listing 11 ký tự
- `status`: Active / Inactive
- `listing_name_en` / `listing_name_vn`: tên hiển thị
- `category_code`: mã nước hiển thị trên web B2C
- `data_type_en`: Daily / Fixed / Unlimited
- `network_operator`: tên nhà mạng hiển thị
- `expirations`: ngày SIM hết hạn sau kích hoạt
- `activation`: hướng dẫn kích hoạt
- `activation_links`: link kích hoạt

**Mục đích:** Bảng giá và thông tin hiển thị cho khách B2C trên website GoHub.'),

('item_code_structure', 'product_codes', 'Cấu trúc Item Code (18 ký tự)', '## Item Code = 18 ký tự

```
[channel(1)][partner(2)][pricelistCode(2)][sku_code(13)]
```

- `channel(1)`: kênh bán (B=B2B, C=B2C, v.v.)
- `partner(2)`: mã đối tác
- `pricelistCode(2)`: mã bảng giá

**Ví dụ:** `BSP01DVE1CJPNWM10014` = B2B · SP · 01 · DVE (price list) · SKU 1CJPNWM10014

### Alias (18 ký tự)
Mã gửi cho khách hàng/partner — đây là mã quan trọng nhất khi trao đổi với đối tác.

### Các cột trong bảng items
- `item_code`: mã 18 ký tự (internal)
- `alias`: mã gửi đối tác (quan trọng nhất)
- `sku_code`: liên kết về SKU
- `unitprice`: giá bán
- `currency`: đơn vị tiền (VND/USD/HKD/TWD)
- `sales_channel`: B2C / Wholesale
- `item_type`: mã bảng giá
- `status`: Active / Inactive'),

-- ═══════════════════════════════════════════════════════════════════════════
-- CATEGORY: sku_rules — Quy tắc SKU
-- ═══════════════════════════════════════════════════════════════════════════

('sku_combo_standard', 'sku_rules', 'Combo SKU chuẩn GoHub (42 combo/country)', '## Combo chuẩn GoHub — 42 combo mỗi nước

### Daily (18 combo)
- Dung lượng: 1GB/ngày, 2GB/ngày, 3GB/ngày
- Số ngày: 3, 5, 7, 10, 15, 30
- = 3 × 6 = 18 combo

### Fixed (18 combo)
- Dung lượng: 5GB, 10GB, 20GB
- Số ngày: 3, 5, 7, 10, 15, 30
- = 3 × 6 = 18 combo

### Unlimited (6 combo)
- Dung lượng: Unlimited (throttle sau khi dùng hết)
- Số ngày: 3, 5, 7, 10, 15, 30
- = 1 × 6 = 6 combo

**Tổng: 42 combo mỗi nước/nhóm nước**

## Thuật ngữ "Thiếu"
- **KHÔNG** dùng "thiếu" theo nghĩa vendor chắc chắn không có
- Dùng: "Cần request vendor tạo thêm SKU"
- Có thể: vendor có sản phẩm ngoài file, chưa tạo, hoặc chưa support thương mại/kỹ thuật

## Unlimited Data (3HK)
- 3HK Unlimited A (10Mbps throttle): `data_amount_gb` tính = 1.8 GB/ngày × số ngày
- 3HK Unlimited B (5Mbps throttle): `data_amount_gb` tính = 1.6 GB/ngày × số ngày
- `data_amount = 9999` trên PM = Unlimited
- Usage% > 100% là BÌNH THƯỜNG với 3HK Unlimited (vượt budget datapool)'),

('sku_kyc_rules', 'sku_rules', 'Quy tắc KYC và loại SIM', '## KYC Rules
- `kyc_code = 1`: Không cần KYC — khách mua trực tiếp được
- `kyc_code = 6`: Cần KYC — phải xác minh danh tính trước khi active
- Ưu tiên no-KYC khi có thể (trải nghiệm khách hàng tốt hơn)

## Loại SIM
- `sim_esim = SIM`: SIM vật lý — cần ship, mất thời gian giao hàng
- `sim_esim = eSIM`: eSIM kỹ thuật số — giao ngay qua QR code/email
- Ưu tiên eSIM cho đơn gấp hoặc khách không nhận SIM vật lý được

## Loại sản phẩm (product_type)
- `B` = eSIM Profile: eSIM chỉ data
- `C` = eSIM Full: eSIM đầy đủ (data + có thể call)
- `D` = SIM Frame: SIM khung (lắp profile riêng)
- `E` = SIM Full: SIM vật lý đầy đủ

## Call/Hotspot/5G
- `call = null`: KHÔNG kết luận là "không hỗ trợ" — phải đọc `note` và `call_sms_details` trước
- `hotspot = null`: tương tự — không kết luận ngay
- `network_type = "5G/4G"`: hỗ trợ 5G (khi available), fallback 4G
- `network_type = "4G"`: chỉ 4G'),

-- ═══════════════════════════════════════════════════════════════════════════
-- CATEGORY: vendors — Nhà cung cấp
-- ═══════════════════════════════════════════════════════════════════════════

('vendor_priority_rules', 'vendors', 'Ưu tiên Vendor khi đề xuất sản phẩm', '## Thứ tự ưu tiên Vendor (quan trọng)

1. **Hong Kong, Taiwan** → ưu tiên **WorldMove (WM)** vì no-KYC. KHÔNG dùng 3HK nếu WM đã có.
2. **Japan** → ưu tiên **KDDI** trước (đang được tài trợ chiết khấu).
3. **Các nước khác** → ưu tiên **3HK** trước WM. Nếu không có 3HK → note "Cần request vendor tạo thêm 3HK".
4. **BC (Birdy Connect) / JY (JoyTel)** → chỉ đề xuất khi không có WM hoặc lựa chọn tốt hơn.
5. Sau tất cả rules trên → ưu tiên **latestCogs thấp hơn** (margin tốt hơn).
6. Nếu bằng giá → ưu tiên **phạm vi support hẹp hơn**: local > regional > global.

## Lý do
- WM: coverage rộng, no-KYC, reliable
- 3HK: giá tốt cho Châu Á
- KDDI: đang có deal chiết khấu cho Japan
- BC/JY: backup vendor, coverage hạn chế'),

('vendor_3hk_details', 'vendors', '3HK Datapool — Chi tiết kỹ thuật', '## 3HK Datapool

### Identifier trong database
- **gohub_dw** `dim_sku.vendor`: inconsistent — có thể là `"3HK DATAPOOL"` (với space) HOẶC `"3HK"`
- → LUÔN dùng: `REPLACE(UPPER(TRIM(vendor))',' ','') LIKE ''3HK%''`
- KHÔNG dùng `= ''3HKDATAPOOL''` — sẽ miss ~60 rows có vendor = "3HK"

### Supabase
- `ncc_3hk`: catalog zones + giá HKD/GB
- `ncc_datapool`: mapping zone → country + throttle_speed
- `vendor_code` trên products: `3H` = 3HK, `3D` = 3HK Datapool

### Data Usage tracking
- `fact_data_usage`: theo ICCID, tổng hợp theo tháng (month_tag = YYYY-MM TEXT)
- `data_usage_log`: log hàng ngày theo nước (1.1M rows)
- eSIM 3HK thường có `location_id = 0` (Unknown) trong dim_location — bình thường, eSIM không có kho vật lý

### Unlimited plan
- Plan A (throttle 10Mbps): giả định 1.8 GB/ngày
- Plan B (throttle 5Mbps): giả định 1.6 GB/ngày
- Usage% > 100% là bình thường — vượt datapool budget'),

('vendor_worldmove_details', 'vendors', 'WorldMove (WM) — Chi tiết', '## WorldMove

### Catalog trong Supabase
- Bảng `ncc_worldmove`: ~8.921 rows
- Cột quan trọng: `exist` = Yes/No (GoHub đã tạo SKU hay chưa)
- Dùng để gap analysis: tìm sản phẩm WM có nhưng GoHub chưa tạo

### Vendor code
- `WM` trên product_code (ký tự 6-7)
- Vendor display name: "WorldMove" hoặc "WORLDMOVE"

### Đặc điểm
- No-KYC (ưu tiên cho HK, Taiwan)
- Coverage rộng (nhiều nước Châu Á, Châu Âu)
- exist=Yes → GoHub đã có SKU tương ứng
- exist=No → cơ hội tạo thêm SKU mới'),

-- ═══════════════════════════════════════════════════════════════════════════
-- CATEGORY: processes — Quy trình & SQL rules
-- ═══════════════════════════════════════════════════════════════════════════

('sql_critical_rules', 'processes', 'SQL Rules cho gohub_dw (PHẢI tuân thủ)', '## SQL Rules quan trọng — gohub_dw

### 1. Date cutoff (QUAN TRỌNG NHẤT)
```sql
-- LUÔN thêm vào mọi query revenue/orders:
AND f.fulfiled_date::date <= CURRENT_DATE - 1
-- ETL chạy lúc 08h mỗi ngày, dữ liệu hôm nay chưa đầy đủ
```

### 2. Date cast
```sql
-- fulfiled_date là TEXT, chỉ có 1 chữ "l" (typo trong schema):
WHERE f.fulfiled_date::DATE >= ''2026-01-01''
-- KHÔNG dùng: fulfillment_date, fulfiled_date::TIMESTAMP
```

### 3. TRIM trước JOIN
```sql
JOIN dim_sku sk ON TRIM(f.sku) = TRIM(sk.sku)
JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code)
JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)
-- Dữ liệu gốc có khoảng trắng thừa
```

### 4. dim_sku column name
```sql
-- ĐÚNG: sk.sku (không phải sk.sku_code)
JOIN dim_sku sk ON TRIM(f.sku) = TRIM(sk.sku)
```

### 5. B2B/B2C filter
```sql
JOIN dim_order_source s ON f.order_source_code = s.code
WHERE UPPER(s.group_name) = ''B2B''   -- hoặc ''B2C''
```

### 6. Loại KH hệ thống (để số khớp dashboard)
```sql
AND TRIM(f.customer_code) NOT IN (
  SELECT TRIM(code::text) FROM dim_customer
  WHERE UPPER(COALESCE(name,'''')) ILIKE ''%B2C Customer%''
     OR UPPER(COALESCE(name,'''')) ILIKE ''%B2B Ops%''
)
AND f.sku != ''SHIPPINGFEE0''
```

### 7. 3HK vendor
```sql
WHERE REPLACE(UPPER(TRIM(sk.vendor)),'' '','''') LIKE ''3HK%''
-- KHÔNG dùng: sk.vendor = ''3HKDATAPOOL'' (miss rows)
```

### 8. Window functions cho % thị phần
```sql
ROUND(SUM(f.fulfilled_revenue_amount_vnd) * 100.0
      / SUM(SUM(f.fulfilled_revenue_amount_vnd)) OVER (), 1) pct
```

### 9. Thời gian chuẩn
- Q1 = 01/01–31/03, Q2 = 01/04–30/06, Q3 = 01/07–30/09, Q4 = 01/10–31/12
- "Tháng N" = ngày 1 → cuối tháng N
- "Gần đây" = 7 ngày trước CURRENT_DATE - 1
- YoY = cùng period năm trước'),

('metrics_definitions', 'processes', 'Định nghĩa chỉ số kinh doanh (KPIs)', '## Chỉ số chính GoHub

| Chỉ số | Công thức | Nguồn dữ liệu |
|---|---|---|
| **Revenue (Doanh thu)** | `fulfilled_revenue_amount_vnd` | fact_fulfillment_revenue |
| **COGS (Giá vốn)** | `cogs_amount_vnd` | fact_fulfillment_revenue |
| **Gross Profit (GP)** | Revenue - COGS = `gross_profit_vnd` | fact_fulfillment_revenue |
| **GPM%** | GP / Revenue × 100 | Tính từ fact |
| **CM1** | GP - Operation Cost | GP từ gohub_dw + Op Cost từ Supabase config |
| **CM1%** | CM1 / Revenue × 100 | Tính tổng hợp |
| **3HK Contribution %** | Doanh thu 3HK / Tổng doanh thu × 100 | fact_fulfillment_revenue |

## Lưu ý quan trọng
- **Operation Cost KHÔNG có trong gohub_dw** — nằm ở `analytics_channel_costs` và `analytics_channel_group_costs` trong Supabase
- Khi hỏi CM1 từ SQL: trả GP thật + ghi rõ "CM1 = GP trừ thêm chi phí vận hành"
- Target/KPI data **KHÔNG có trong gohub_dw** — xem tab Targets trên web hoặc `analytics_target_planning` Supabase

## B2B Tier (từ dim_customer.price_list_name)
- `NULL` → B2C
- Chứa "STRATEGIC" hoặc "STR" → Strategic
- Chứa "VIP" → VIP
- Chứa "GOLD" → Gold
- Chứa "SILVER" → Silver
- Không khớp keyword nào → Strategic (fallback)

## Tránh Double-counting B2B
Strategic Partners (Klook, Traveloka) nằm trong B2B portal VÀ có channel_name riêng.
B2B Total = Strategic Total + Non-Strategic Total — KHÔNG cộng lại khi đã báo từng phần.'),

('update_workflow', 'processes', 'Quy trình update dữ liệu (Gấu Pro)', '## Workflow khi Gấu Pro cập nhật thông tin

### Nguyên tắc cứng
1. **Propose trước** — KHÔNG bao giờ execute ngay, dù được yêu cầu "làm ngay"
2. **Chỉ write vào Supabase** — KHÔNG đụng Turso hay gohub_dw
3. **Đồng bộ 3 nơi** sau mỗi update:
   - `creator_kb` table trong Supabase
   - `kb_wiki_pages` (nếu liên quan đến tab)
   - Master Note (`creator_kb` key `_master_note`)

### Flow chuẩn
```
Hiếu: "Cập nhật X"
Gấu Pro: "Tôi sẽ: (1)... (2)... (3)... Xác nhận?"
Hiếu: "Ok" / "Xác nhận" / "Đồng ý"
Gấu Pro: → Execute writeKnowledgeBase() → Update 3 nơi
Gấu Pro: "Đã cập nhật. [Tóm tắt những gì đã làm]"
```

### Khi nào update wiki
- Thay đổi liên quan đến tab analytics → update `docs/wiki/system/tabs/analytics-<tab>.md`
- Thêm định nghĩa mới → update wiki tương ứng
- Thay đổi quy trình → update wiki quy trình

### KHÔNG được
- Execute trước khi có xác nhận rõ ràng
- Write vào Turso (chỉ đọc config)
- Write vào gohub_dw (chỉ đọc analytics)
- Xóa dữ liệu production mà không có backup plan')

ON CONFLICT (key) DO UPDATE SET
  category   = EXCLUDED.category,
  title      = EXCLUDED.title,
  content    = EXCLUDED.content,
  updated_at = NOW();

-- Regenerate master note sau seed
-- (Gấu Pro sẽ tự làm khi có request, hoặc gọi API /api/creator-ai/knowledge?regenerate=1)
