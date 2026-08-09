# PLAN.md — GoHub Intel
> Cập nhật 2026-08-09 (s139). Items đã xong đã bỏ, chỉ giữ pending + plan mới.
> Chi tiết lịch sử: `docs/CHANGELOG.md` · Lỗi đã gặp: `docs/ERRORS.md`

---

## ĐÁNH GIÁ HỆ THỐNG (2026-08-09)

> Đánh giá về kiến trúc, quy trình, công cụ — không phải danh sách bug.

---

### 1. Kiến trúc tổng thể

**Ưu điểm:**
- **Next.js 14 App Router** đúng hướng: server components, parallel data fetching, streaming response cho chatbot — phù hợp với use case BI + AI.
- **Tách biệt 3 lớp DB** có logic rõ ràng: Supabase (operational + config), gohub_dw (analytics DW), Turso (config nhẹ + b2b costs). Mỗi DB làm đúng việc của nó.
- **OOP analytics-engine** (s133+): tập trung logic projection + cost vào shared lib → thay đổi công thức 1 chỗ áp toàn hệ thống, hạn chế lỗi drift giữa các tab.
- **Staging-first pipeline**: code không bao giờ lên thẳng production, review thủ công trước khi merge.

**Nhược điểm / Cần cải thiện:**
- **Không có connection pooler** (PgBouncer) cho gohub_dw → app-level max=3 là bottleneck; nếu nhiều Vercel instance cùng lúc (spike traffic) có thể cạn slot. Giải pháp đúng là Supabase Pooler hoặc PgBouncer phía Cloud SQL.
- **3 data store tạo ra split logic**: channel costs ở Supabase, customer costs ở Turso, revenue ở gohub_dw → CM1 phải query 3 nguồn, kết hợp JS. Lý tưởng: gom cost về 1 nơi (Supabase hoặc Turso).
- **Vercel serverless cold start** ảnh hưởng analytics: mỗi instance mới phải khởi tạo pool → query đầu tiên chậm. Prewarm cron (06:30 ICT) giảm thiểu nhưng không loại trừ.
- **Không có read replica / caching layer** cho gohub_dw: mọi query đánh thẳng vào production DB. Cache 2 tầng (in-memory 5 phút + Supabase 12h) giúp nhiều nhưng chỉ work sau lần đầu.

---

### 2. Quy trình phát triển

**Ưu điểm:**
- **Commit nhỏ từng task**: dễ rollback, dễ review, git log đọc như changelog.
- **Wiki sync vào Supabase**: Bé Gấu đọc được wiki khi trả lời → team được hỗ trợ thông tin cập nhật.
- **ERRORS.md**: ghi lại bài học từ bug → session sau không lặp lại lỗi cũ (đặc biệt SQL gotchas).
- **CLAUDE.md auto-load**: AI nắm context ngay đầu session mà không cần brief lại.

**Nhược điểm / Cần cải thiện:**
- **Không có CI/CD tự động**: tsc + vitest chạy thủ công trước push. Nếu Hiếu quên → lỗi lên staging. Cần GitHub Actions chạy check trên mỗi push.
- **Không có cron failure alerting**: nếu `refresh-trends`, `prewarm-analytics`, hay `refresh-kpis` fail → không ai biết cho đến khi data bị thiếu/cũ. Cần Lark notify khi cron fail.
- **Wiki sync thủ công**: phải nhớ chạy `python import_wiki.py` sau mỗi lần sửa wiki → dễ quên, Bé Gấu đọc data cũ. Cần trigger tự động (GitHub Actions hook khi docs/wiki/ thay đổi).
- **Test coverage thấp**: be-gau.ts (chatbot chính) không có test sau rebuild s131. Nếu refactor sẽ không biết mình break gì.

---

### 3. AI / Chatbot

**Ưu điểm:**
- **Single function-calling agent** (Bé Gấu, s131): thay pipeline 6-agent cứng → Gemini tự chọn tool phù hợp, linh hoạt hơn nhiều, ít trường hợp "bí" hơn.
- **Gấu Pro 22 tools**: đủ để automation phức tạp (query DB + browse portal + generate image + manage Lark tasks + ghi KB).
- **Guardian regex** (không LLM): nhanh, deterministic, không bị flip → phân loại câu hỏi nhạy cảm chính xác hơn pipeline LLM-classify cũ.
- **Creator KB**: Gấu Pro đọc KB riêng của Hiếu trước khi trả lời → câu trả lời dùng đúng quy ước nội bộ (COGS, mã SKU, tỷ giá).

**Nhược điểm / Cần cải thiện:**
- **Gấu Pro không lưu conversation**: in-memory → F5 mất hết. Gây ra context loss khi làm việc dài. Cần persist vào Supabase `conversations` table (đã có schema, chưa dùng cho Gấu Pro).
- **Image generation phụ thuộc Pollinations** (third-party, free): không có SLA, chất lượng không ổn định, không có negative prompts. Không suitable cho production content. Nên xem xét Stable Diffusion API (Stability AI) hoặc Replicate cho chất lượng cao hơn.
- **Trend snapshots 1x/ngày**: nếu cron fail hoặc dữ liệu cũ → Gấu Pro tư vấn content dựa trên trend cũ. Cần fallback rõ hơn (hiển thị ngày snapshot, gợi ý webSearch live nếu > 2 ngày).
- **Không có multi-turn memory** cho Bé Gấu: mỗi cuộc hội thoại không nhớ context từ cuộc trước (ví dụ: "tuần trước tôi hỏi về Japan..." → Bé Gấu không biết).

---

### 4. Công cụ (Tools)

| Tool | Đang dùng cho | Đánh giá | Cải thiện |
|---|---|---|---|
| **Gemini Flash** | Bé Gấu + Gấu Pro + Guardian + Trend cron | ✅ Nhanh, rẻ, function-calling tốt | Model name không nhất quán trong codebase (gemini-3.5-flash vs gemini-3.6-flash) |
| **Gemini Embedding** | KB/Wiki search (pgvector) | ✅ 3072 dims, chất lượng tốt | Không index được (> 2000 dims limit pgvector) → exact scan full table mỗi search |
| **Pollinations AI** | Image gen Gấu Pro | ⚠️ Free nhưng không ổn định | Nên upgrade sang Stability AI hoặc Replicate API |
| **Supabase** | Products, KB, config, costs | ✅ Phù hợp | Đang dùng như KV store (app_settings) — nên có typed table thay JSON blob |
| **gohub_dw Postgres** | Analytics | ✅ Đủ mạnh | Cần PgBouncer; Hiếu không có quyền thêm index |
| **Turso SQLite** | B2B costs, config | ⚠️ Tạo split data | Nên gom về Supabase để 1 nguồn duy nhất |
| **Vercel** | Deploy + Cron | ✅ Tiện lợi | Cron chỉ 1 trigger/run, không retry nếu fail |
| **Lark** | Team chatbot + CS tickets + OAuth | ✅ Team dùng Lark nên self-contained | OAuth flow phức tạp (app version phải publish sau mỗi lần đổi scope) |

---

### 5. Đề xuất cải thiện chiến lược (theo thứ tự ưu tiên)

| # | Cải thiện | Lợi ích | Effort |
|---|---|---|---|
| 1 | **CI/CD GitHub Actions** (tsc + vitest tự động) | Không bao giờ push code lỗi | Nhỏ (~1 ngày) |
| 2 | **Cron failure → Lark alert** | Biết ngay khi data pipeline fail | Nhỏ (~2h) |
| 3 | **Wiki auto-sync** (GitHub Actions khi docs/wiki/ thay đổi) | Bé Gấu luôn đọc wiki mới nhất | Nhỏ (~1 ngày) |
| 4 | **Gấu Pro conversation persistence** (Supabase) | Không mất context khi F5 | Trung (~3 ngày) |
| 5 | **Gom Turso b2b costs → Supabase** | 1 nguồn duy nhất cho costs | Trung (~3 ngày) |
| 6 | **PgBouncer / Supabase Pooler** cho gohub_dw | Scale nhiều connection hơn | Lớn (cần DB owner) |
| 7 | **Image gen upgrade** (Stability AI / Replicate) | Chất lượng ổn định, negative prompts | Trung (~2 ngày) |
| 8 | **Looker Studio connector** | BOD xem chart không cần vào web | Lớn (cần DB owner) |

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

- [x] **B2C-GROUP-COST** ✅ — `b2c/performance/route.ts`: fetch group costs song song + phân bổ theo revShare; projected dùng full budget × revShare. (8ae23c6)
- [x] **STAFF-FE-FILTER** ✅ — `staff/page.tsx` toggleExpand: pass `includeShip`/`includeInternalOps` vào customers API. (b1a86cb)
- [x] **ITEMS-ERROR** ✅ — `api/items/filters/route.ts`: bọc try-catch, trả 500 khi Supabase fail. (3dee049)
- ❌ **QUARTER-T9-BADGE** — bỏ, tab Quarterly sắp đổi toàn bộ sang ENG.
- [ ] **ISSUE-DASH-3** 🟡 (chờ Bảo/Hiếu) — nhóm "Other" ẩn khỏi bảng "Performance by Business Groups" (78 đơn, 0đ). UI Strict Lock → chờ chỉ thị.

### B3. OOP Priority 2 (AI làm, không khẩn)

4 routes còn dùng inline helpers thay vì analytics-engine:
- [x] `channels/performance/route.ts` — import COST_KEYS từ cost-engine, bỏ local const (15b0dbe)
- [x] `b2b/strategic-performance/route.ts` — import COST_KEYS từ cost-engine, bỏ local const (bb21e3a)
- [x] `b2c/monthly/route.ts` — import COST_KEYS + getDaysInMonth/getDaysInRange từ analytics-helpers (5dd7168)
- [x] `b2c/performance/route.ts` — xóa getDaysInMonth/getDaysInRange local, import từ analytics-helpers (c5e47f7)

### B4. Gấu Pro Phase 1 — Đã làm xong (s139 cont) ✅

- ✅ Streaming SSE: route → `text/event-stream`, FE đọc từng event real-time (52ae30f)
- ✅ Parallel tools: `Promise.all` thay for-loop, TOOL_STATUS 20 tools
- ✅ Encrypt portal credentials: AES-256-GCM, cần set `PORTAL_CRED_KEY` trên Vercel
- ✅ Cache SQL: `cachedQuery` TTL 5 phút, hash MD5 của SQL
- ✅ Fix KB injection: sort by priority, warn khi truncated
- ✅ Fix multi-binary file: `fileContexts?: FileContext[]`, gửi nhiều `inlineData` parts

Hiếu cần làm: set ENV `PORTAL_CRED_KEY` = random 32-char string trên Vercel (để encrypt credentials).

### B5. CI/CD — Đã làm xong (s139) ✅

Đã implement 4/8 cải thiện chiến lược:
- ✅ CI/CD GitHub Actions (`ci.yml`) — tsc + vitest tự động
- ✅ Cron failure alert (`cron-alert.ts`) — Lark notify khi cron fail
- ✅ Wiki auto-sync (`wiki-sync.yml`) — push main docs/wiki → tự sync Supabase
- ✅ Gấu Pro persistence — save Supabase, load history, dropdown lịch sử

Còn lại (chờ external):
- [ ] Gom Turso b2b costs → Supabase (cần migration + test kỹ Quarter Report)
- [ ] PgBouncer (cần DB owner)
- [ ] Image gen upgrade Stability AI (cần API key)
- [ ] Looker Studio (cần DB owner)

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
