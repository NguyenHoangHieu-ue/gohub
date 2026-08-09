# PLAN.md — GoHub Intel
> Cập nhật 2026-08-09. Items đã xong đã bỏ, chỉ giữ pending + plan mới.
> Chi tiết lịch sử: `docs/CHANGELOG.md` · Lỗi đã gặp: `docs/ERRORS.md`

---

## ĐÁNH GIÁ HỆ THỐNG (2026-08-09)

### Ưu điểm

| # | Điểm mạnh | Chi tiết |
|---|---|---|
| 1 | **Analytics toàn diện** | 40+ tab, phủ hết revenue/GP/CM1/B2B/B2C/staff/vendors/3HK/quarterly/website |
| 2 | **OOP analytics-engine** | Shared projection + cost-engine → bugs inline calc giảm mạnh, 1 chỗ fix tất cả |
| 3 | **Dual AI phù hợp** | Bé Gấu (team, guardrails) + Gấu Pro (creator, full access 22 tools) |
| 4 | **Gấu Pro phong phú** | 22 tools: SQL, Supabase, GA4, GSC, Lark, portal, image gen, trend, KB |
| 5 | **Wiki + sync** | 51 trang, auto-sync Supabase, Bé Gấu đọc được KB khi trả lời |
| 6 | **Staging discipline** | Không tự merge main, commit nhỏ từng task, ERRORS.md tránh lặp bug |
| 7 | **Connection pool tốt** | statement_timeout=25s, idle_session_timeout=90s, không ghost pool |

### Nhược điểm / Technical Debt

| # | Vấn đề | Mức độ | Ghi chú |
|---|---|---|---|
| 1 | **B2C CM1 thiếu group cost** | 🔴 Cao | b2c/performance không trừ ~150M/tháng group cost B2C → số sai, chỉ trừ channel-level |
| 2 | **be-gau.ts 0 test coverage** | 🔴 Cao | Chatbot chính của team (rebuild s131) không có unit test; agents.test.ts test tool cũ |
| 3 | **OOP Priority 2 còn 4 routes** | 🟠 Trung | channels/performance, b2b/strategic-performance, b2c/monthly, b2c/performance còn inline |
| 4 | **Staff FE bug: filter không pass** | 🟠 Trung | page.tsx không truyền includeShip/includeInternalOps khi fetch customers |
| 5 | **Không có Lark weekly report** | 🟠 Trung | Báo cáo tuần phải làm thủ công; cron + Gấu Pro đủ tool nhưng chưa implement |
| 6 | **JoyTel CAPTCHA blocked** | 🟠 Trung | CAPTCHA nhiễu nặng, Gemini OCR ~0%; cần 2captcha service hoặc bỏ qua |
| 7 | **3HK data pipeline stuck T6** | 🟠 Trung | fact_data_usage max 2026-06-30; T7+ không có (vận hành phía DB owner) |
| 8 | **Video generation chưa có** | 🟡 Thấp | Kling AI API key chưa có; feature đã lên kế hoạch Wave 2 |
| 9 | **items/filters thiếu error handling** | 🟡 Thấp | api/items/filters không có try-catch → crash silently nếu Supabase lỗi |
| 10 | **Quarter T9 label "(PR)" nhỏ** | 🟡 Thấp | User dễ hiểu nhầm T9 là số thật; cần badge "Ước tính" rõ hơn |
| 11 | **Không có Looker Studio / Power BI** | 🟡 Thấp | Hiếu muốn kết nối gohub_dw; cần DB owner tạo read-only user + bật public IP |

---

## A. KPI Q3 (Tháng 8–10/2026)

| Nhóm | Metric | Mục tiêu |
|------|--------|-----------|
| Vận hành SP | SLA xử lý request | ≤ 2 ngày (90% request) |
| Vận hành SP | So sánh giá vendor | ≤ 15–30 phút/nhu cầu |
| Hiệu quả SP | CM1 SKU key | Tăng +2–5% |
| Hiệu quả SP | Doanh thu SP mới | ≥ 15% tổng GMV |
| Hiệu quả SP | Product Win Rate | ≥ 80% SKU mới ≥5 đơn/14 ngày |
| BI & AI | Bé Gấu task volume | ≥ 50–100 tasks/tuần, accuracy ≥ 80% |

---

## B. VIỆC CẦN LÀM — Theo ưu tiên

### B1. Hiếu cần làm thủ công

- [ ] Chạy `web/db/migrations/v31_chatbot_learning_log.sql` trên Supabase SQL Editor
- [ ] Set ENV `LARK_CREATOR_USER_ID` = `ou_e5af3c7f447984052c1c5a5c2f594127` trên Vercel
- [ ] Nhập Cost T8 B2C ≠ 0 trong Manage Costs (hiện tất cả = 0 → CM1 B2C T8 bị cao)
- [ ] Nhập target T7/T8 ở Manage Costs cho scheduled reports
- [ ] Đăng ký Kling AI (`KLING_API_KEY`) tại klingai.com → Wave 2 video gen
- [ ] Liên hệ DB owner gohub_dw: tạo read-only user + bật public IP → Looker Studio
- [ ] Yêu cầu DB owner sync fact_data_usage T7/T8 (3HK pipeline stuck T6)

### B2. Bug chưa fix (AI làm)

- [ ] **B2C-GROUP-COST** 🔴 — `b2c/performance/route.ts`: thiếu trừ group cost B2C (~150M/tháng).
  Fix: thêm `calcGroupOpCost()` từ cost-engine vào response. Verify: số CM1 B2C Performance khớp BOD B2C group.
- [ ] **STAFF-FE-FILTER** 🟠 — `staff/page.tsx` line 170-176: thêm `includeShip` + `includeInternalOps` vào URLSearchParams khi fetch `/api/analytics/staff-report/customers`.
- [ ] **ITEMS-ERROR** 🟡 — `api/items/filters/route.ts`: bọc trong try-catch, trả `{ error }` 500 khi Supabase fail.
- [ ] **QUARTER-T9-BADGE** 🟡 — `quarterly/page.tsx` line ~1436: đổi text "(PR)" thành badge cam "Ước tính" rõ hơn cho cột T9.
- [ ] **ISSUE-DASH-3** 🟡 (chờ Bảo/Hiếu) — nhóm "Other" ẩn khỏi bảng "Performance by Business Groups" (78 đơn, 0đ). UI Strict Lock → chờ chỉ thị.

### B3. OOP Priority 2 (AI làm, không khẩn)

4 routes còn dùng inline helpers thay vì analytics-engine:
- [ ] `channels/performance/route.ts` — import COST_KEYS, refactor cost loop
- [ ] `b2b/strategic-performance/route.ts` — import COST_KEYS, refactor cost loop
- [ ] `b2c/monthly/route.ts` — import COST_KEYS + getDaysInMonth/getDaysInRange từ analytics-helpers
- [ ] `b2c/performance/route.ts` — xóa 2 hàm local (đã có getProjectionFactor, chỉ còn getDaysInMonth/Range)

---

## C. ANALYTICS — Cải thiện

### C1. Lark Weekly Auto-Report (Gấu Pro generates, cron sends)

**Mục tiêu**: Thứ 2 hàng tuần, cron gọi Gấu Pro → generate báo cáo tuần → gửi Lark group.

**Plan:**
- Thêm endpoint `/api/cron/weekly-report` (trigger từ vercel.json `0 2 * * 1`)
- Gọi `runCreatorAI()` với prompt template: "Tạo báo cáo tuần [ngày] — Revenue, GP, CM1, 3HK%, Top SKU, Win Rate so sánh tuần trước"
- Gửi kết quả vào Lark group qua `sendLarkMessage()`
- Cần: ENV `LARK_WEEKLY_REPORT_GROUP_ID`

### C2. Product Win Rate Dashboard

**Mục tiêu**: Hiển thị SKU nào "thắng" (≥5 đơn/14 ngày kể từ khi tạo) vs "chưa đủ".

**SQL đã có** (trong bi-analyst templates). Cần:
- Tab mới hoặc section trong Products BI
- Filter: vendor, ngày tạo SKU, khoảng thời gian
- Output: bảng SKU + Win Rate % + số đơn + ngày đạt mục tiêu

### C3. B2B Bulk Cost Import

**Mục tiêu**: Thay vì nhập từng KH trong Quarter Report, cho phép upload Excel → import nhiều dòng cùng lúc vào `b2b_customer_cost_monthly` Turso.

**Plan:**
- Thêm nút "Import Excel" vào modal Manage Cost Quarter Report
- Parse Excel: columns = customer_code, month, cost_value, cost_type
- Validate + preview → confirm → upsert Turso

---

## D. AI / GẤU PRO — Cải thiện

### D1. Thêm test cho be-gau.ts 🔴

**Vấn đề**: Chatbot team đang không có bất kỳ test nào sau rebuild s131.

**Plan:**
- `web/src/__tests__/be-gau.test.ts`
- Test: tool declarations đầy đủ, guardian pre-flight hoạt động, role filter inject đúng
- Test: runBeGau trả lời câu hỏi data (mock queryAnalytics), deflect câu hỏi nội bộ
- Aim: ≥ 10 test cases, chạy qua `vitest`

### D2. Gấu Pro Wave 2 — Video Generation

**Điều kiện**: Hiếu có `KLING_API_KEY` (đăng ký klingai.com).

**Plan:**
- Tool `generateVideo(prompt, duration, aspect_ratio)` trong creator-ai.ts
- Kling AI API: `POST https://api.klingai.com/v1/videos/text2video`
- Poll status → trả URL video khi done
- Cron timeout: Kling mất 2-5 phút → dùng callback hoặc poll từ FE

### D3. Gấu Pro Image — Prompt Engineering

**Mục tiêu**: Nâng chất lượng ảnh Pollinations thêm (enhance=true đã thêm).

**Plan:**
- System prompt: thêm section "Image Prompt Formula" với template cụ thể per use-case
- Thêm style presets: `commercial_photo`, `tiktok_thumb`, `travel_cinematic`, `flat_illustration`
- Tool: thêm param `style_preset` → Gấu tự inject đúng suffix

### D4. JoyTel — 2captcha Integration (low priority)

**Hiện trạng**: CAPTCHA nhiễu, Gemini OCR ~0%. Code đúng, retry 4× implement.

**Giải pháp nếu cần**:
- Tích hợp 2captcha API (`$0.001/solve`, ~1-3s)
- `loginJoyTelPortal()`: gọi 2captcha thay Gemini Vision
- ENV: `TWOCAPTCHA_API_KEY`
- Endpoint: `/createTask` (ImageToTextTask) → poll `/getTaskResult`

---

## E. HẠ TẦNG

### E1. Looker Studio / Power BI → gohub_dw

**Điều kiện**: DB owner thực hiện (Hiếu không có quyền DDL):
1. Tạo read-only user: `CREATE USER looker_readonly WITH PASSWORD '...'`
2. Grant: `GRANT SELECT ON ALL TABLES IN SCHEMA public TO looker_readonly`
3. Bật public IP Cloud SQL (hoặc Cloud SQL Proxy)
4. Whitelist IP Looker Studio: `35.187.0.0/16` (Google Cloud)

**Sau khi có:** kết nối Looker Studio → gohub_dw → build chart drag-drop mà không cần dev.

### E2. items/filters Error Handling

Thêm try-catch vào `api/items/filters/route.ts` → trả 500 khi Supabase fail.

---

## F. SẢN PHẨM / VẬN HÀNH

### F1. Product Onboarding Phase 2 (Semi-Auto)

**Điều kiện**: Phase 1 ổn định ≥ 2 tháng (test từ 2026-07-31).

**Plan:**
- Gấu Pro draft → Hiếu review screen → Gấu Pro gọi API PM insert vào Supabase
- KHÔNG insert vào PM trực tiếp (rủi ro cao)
- Cần: Hiếu xác nhận Phase 1 accuracy đủ (≥ 95%)

### F2. SunSpeedy Product Catalog Mapping

**Hiện trạng**: `/sim/simmanage/page` (17k SIMs) + `/order/order/page` (package names).

**Còn thiếu**:
- Map `packageName` từ order history → catalog gohub
- Find gap: SunSpeedy có gói gì GoHub chưa import
- Cần test `browsePortal("sunspeedy", "/order/order/page")` để extract packageName list

---

## G. PORTALS STATUS (reference)

| Portal | URL | Status | Login method | Endpoints hoạt động |
|--------|-----|--------|-------------|---------------------|
| Elite | simply.elitemobile.com | ✅ | Form ASP.NET | `/CorporateTopUp/GetNetworkWiseTopUps/{id}` (76 SP UK) |
| SunSpeedy | cardweb.sunspeedy.com | ✅ | POST /login + `token` header | `/sim/simmanage/page` (17k), `/order/order/page` |
| JoyTel | joytelshop.com | ❌ CAPTCHA | POST `/zyfh/api/v1/access/login` + SHA1 pw | blocked — cần 2captcha |

---

## H. DATA QUERY STANDARDS (reference)

### H.1 Nguồn dữ liệu

| Nguồn | Dữ liệu | Cách truy cập |
|-------|---------|--------------|
| gohub_dw (GCP Postgres) | Revenue, orders, SKU, staff, customer | `queryAnalytics(sql)` |
| Supabase | Channel costs, group costs, target, config | `supabaseAdmin` |
| Turso | B2B per-customer costs, quarterly targets | `tursoQuery()` |

### H.2 Quy tắc ngày

```sql
-- LUÔN dùng hôm qua (ETL chạy 08:00 ICT, data hôm nay chưa đủ):
WHERE f.fulfiled_date::date <= CURRENT_DATE - 1

-- Tháng hiện tại:
BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE - 1

-- Tháng cụ thể:
BETWEEN '2026-07-01' AND LEAST('2026-07-31'::date, CURRENT_DATE - 1)
```

### H.3 SQL Gotchas quan trọng

- `fulfiled_date` — 1 chữ "l", kiểu TEXT → luôn cast `::date`
- `dim_sku.sku` — KHÔNG phải `sku_code`
- 3HK chuẩn: `REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'` (7,930 SKU)
- TRIM mọi JOIN key: `TRIM(f.customer_code) = TRIM(c.code)`
- NOT ILIKE ANY: phải `NOT (field ILIKE ANY(...))`, không phải `field NOT ILIKE ANY`
- Exclude ops: `c.name NOT IN ('B2C Customer US','B2C Customer VN','B2B Ops')`

### H.4 CM1 formula

```
CM1 = GP - Channel_Cost - Group_Cost
CM1% = CM1 / Revenue × 100
```
- Channel_Cost: `analytics_channel_costs` (JSON: ads/platform_fee/sponsor_products/media)
- Group_Cost: `analytics_channel_group_costs`
- `percent` type: áp thẳng trên revenue, KHÔNG nhân dayRatio
- `amount` type: × dayRatio (days_in_range/days_in_month)
- Luôn SUM(percent), không MAX

### H.5 Projection chuẩn (analytics-engine/projection.ts)

- Cross-month range → **factor = 1** (không project)
- Tháng đã xong → **factor = 1**
- MTD tháng hiện tại → **factor = daysInMonth / daysElapsed**
- `kpiPrFactor` (KPI cards) = dim/elapsed cho MỌI tháng đang chạy, không ngưỡng
- Monthly table: ngưỡng MIN_PROJECT_DAYS=7 (tránh nhảy số đầu tháng)

---

## I. QUARTER REPORT FORMULAS (reference)

### I.1 3 hệ số projection

| Hệ số | Dùng cho | Công thức | Ngưỡng |
|-------|---------|-----------|--------|
| `monthly_factor` | Bảng tháng | dim/elapsed | elapsed ≥ 7 ngày |
| `kpiPrFactor` | KPI cards | dim/elapsed | Không ngưỡng |
| `qFactor` | Marker "expected %" only | 92/daysElapsed | Không dùng scale số |

### I.2 Phân tier B2B (dim_customer.price_list_name)

- Strategic: không có VIP/Gold/Silver keyword (fallback)
- VIP: ILIKE '%VIP%'
- Gold: ILIKE '%GOLD%'
- Silver: ILIKE '%SILVER%'
- Exclude: `name NOT IN ('B2C Customer US','B2C Customer VN','B2B Ops')`
- Region: `currency_code='VND'` → VN; `'USD'` → US

### I.3 CH.Cost per customer

- Lưu: Turso `b2b_customer_cost_monthly`, id = `YYYY-MM_customer_code`
- Flush cache sau save: `qb2b_raw_v9` (cache key hiện tại)
- Loại KH theo mã (code alphanumeric) ưu tiên hơn tên (tên có thể đổi)

---

## J. MERGE/DEPLOY CHECKLIST

Trước khi merge staging → main:
- [ ] `npx.cmd tsc --noEmit` PASS
- [ ] `vitest` unit tests PASS
- [ ] Hiếu duyệt UI trên staging
- [ ] Wiki tabs đã sửa được update + sync (`python backend/seeding/import/import_wiki.py`)
- [ ] Migration SQL đã chạy trên Supabase (nếu có)
- [ ] ENV mới đã set trên Vercel (cả Production + Preview scope)
