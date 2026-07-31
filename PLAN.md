# GoHub System Plan — Master Document
> File duy nhất cho tất cả plan/roadmap/todo. Cập nhật trực tiếp ở đây.
> Xóa các file cũ: upd.txt, docs/master-plan.md, docs/data-query-standard.md, docs/quarterly-report-formulas.md, career-plan-q3.md

---

## TRẠNG THÁI HIỆN TẠI (2026-07-31)

- **Branch**: main == staging == `4c4c007` — ✅ ĐÃ MERGE lên main (2026-07-31), Vercel auto-deploy production
- **Migrations chạy**: v30 ✅ | v30b ✅ (Hiếu đã chạy 2026-07-31)
- Session này gồm: Usage Analytics tab · Gấu Pro upload/export nâng cấp · SunSpeedy fix · Orders (Entity filter + Include ShippingFee/Internal Ops Yes/No + KPI toàn kỳ + export all pages + dedupe dim_sku fan-out toàn hệ thống)

---

## A. KPI Q3 (Tháng 8–10/2026)

| Nhóm | Metric | Mục tiêu |
|------|--------|-----------|
| Vận hành SP | SLA xử lý request | ≤ 2 ngày (90% request) |
| Vận hành SP | So sánh giá vendor | ≤ 15–30 phút/nhu cầu |
| Hiệu quả SP | Gross Margin CM1 SKU key | Tăng +2–5% |
| Hiệu quả SP | Doanh thu SP mới | ≥ 15% tổng GMV |
| Hiệu quả SP | Product Win Rate | ≥ 80% SKU mới ≥5 đơn/14 ngày |
| BI & AI | Bé Gấu task volume | ≥ 50–100 tasks/tuần, accuracy ≥ 80% |

---

## B. VIỆC CẦN LÀM — Ưu tiên

### B1. Việc Hiếu cần làm (manual)

- [x] **Chạy migration v30** — ✅ 2026-07-31 (bảng `app_usage_events` đã tồn tại)
- [x] **JoyTel auth_header**: ✅ KHÔNG cần Basic header — endpoint `/zyfh/api/v1/access/login`, SHA1 pw, no Basic auth
  - ⚠️ Blocking issue: CAPTCHA JoyTel bị nhiễu nặng, Gemini OCR accuracy thấp (~0%). Code đúng, retry 4× đã implement.
  - Giải pháp thay thế: dùng dịch vụ CAPTCHA chuyên (2captcha/anti-captcha ~$0.001/solve) — cân nhắc nếu cần JoyTel khẩn
  - Hiện tại: login JoyTel chưa hoạt động được trên production
- [ ] **Merge staging → main** khi sẵn sàng deploy
- [x] **Test Gấu Pro** thủ công — ✅ Hiếu đã test (2026-07-31)

### B2. Tech debt đã giải quyết

- [x] creator_kb: đã seed 51 entries
- [x] Migration v29 pm_* tables: không tồn tại → bỏ qua
- [x] SunSpeedy login: fix `/login` endpoint + `token` header
- [x] Elite products: đã extract vào `ELITE/elite_products.md`
- [x] Usage Analytics tab: tạo mới `/analytics/creator/usage`
- [x] Migration v30 `app_usage_events`: Hiếu đã chạy 2026-07-31
- [x] Migration v30b `user_name` column: Hiếu đã chạy 2026-07-31

### B3. Còn treo

- [x] SunSpeedy product catalog: không có endpoint riêng — lấy từ `/order/order/page` (order history chứa packageName). Gấu Pro đã biết path.
- [x] Gấu Pro CAPTCHA solver: retry logic 3× đã implement trong code (verify trên Vercel khi dùng thực tế)
- [x] Product Automation Phase 1: ✅ Hiếu đã test (2026-07-31)
- [x] Gấu Pro Quality Test (nhóm A–E): ✅ Hiếu đã test (2026-07-31)

---

## C. GẤU PRO — Roadmap

### C.1 Capabilities hiện tại ✅

| Capability | Status |
|---|---|
| SQL query gohub_dw | ✅ |
| Query Supabase (26 bảng) | ✅ |
| Query Turso | ✅ |
| Web search | ✅ |
| Import: PDF/DOCX/PPTX/Excel/CSV/JSON/image/code (tối đa 5 file) | ✅ updated 2026-07-31 |
| Upload: Drag & drop + paste clipboard ảnh | ✅ added 2026-07-31 |
| Export: CSV/Excel(auto-width)/JSON/PDF/Word(page footer) | ✅ updated 2026-07-31 |
| Chart rendering multi-series | ✅ |
| Portal: Elite (browse, 76 sản phẩm UK) | ✅ |
| Portal: SunSpeedy (login OK, 3 endpoints hoạt động) | ✅ fixed 2026-07-31 |
| Portal: JoyTel | ❌ CAPTCHA OCR accuracy ~0% — cần 2captcha service |
| Knowledge Base (creator_kb) | ✅ 51 entries |
| Product Onboarding Automation Phase 1 | ✅ tested 2026-07-31 |
| GA4 / GSC queries | ✅ |
| SQL Win Rate Tracker + Margin Optimizer | ✅ added 2026-07-31 |
| Lark chat logging → Usage Analytics | ✅ added 2026-07-31 |

### C.2 Improvements cần làm (theo Q3 priority)

#### Priority 1 — Aligned với KPI Q3

**C.2.1 Product Win Rate Tracker** ✅ SQL template đã thêm vào bi-analyst
- Gấu Pro hỏi: "SKU mới nào trong 14 ngày đạt win rate?" → bi-analyst chạy SQL Win Rate
- Output: Win Rate %, danh sách SKU WIN/CHƯA ĐỦ

**C.2.2 Vendor Price Comparison** ✅ Gấu Pro đã có đủ tools (browsePortal Elite/SunSpeedy + querySupabase NCC)
- Hiếu hỏi: "So sánh giá eSIM UK 7 ngày từ Elite vs WM vs 3HK" → Gấu Pro tự browse + query + bảng kết quả
- Không cần code thêm — đã hoạt động với prompt tự nhiên

**C.2.3 Margin Optimizer** ✅ SQL template đã thêm vào bi-analyst
- Gấu Pro hỏi: "Top SKU GP% thấp cần đàm phán COGS" → chạy SQL Margin Optimizer
- Output: bảng SKU + GP% + COGS đơn vị + đề xuất

**C.2.4 SunSpeedy Product Fetch** ✅ resolved
- `/card/product/list` → 500 (không có quyền với account gohubtravel)
- Thay thế: dùng `/order/order/page` để extract unique packageName từ order history
- Gấu Pro đã biết path và token header

#### Priority 2 — System improvements

**C.2.5 CAPTCHA Retry Logic** ✅ đã implement
- SunSpeedy: retry loop 3× với UUID mới mỗi lần (creator-ai.ts line ~800)

**C.2.6 Auto Weekly Summary to Lark**
- Gấu Pro generate báo cáo tuần (revenue, top SKU, 3HK%, win rate)
- Gửi vào Lark group mỗi thứ 2 sáng
- Trigger: Scheduled Messages system (đã có) + Gấu Pro API call

**C.2.7 JoyTel Integration** ❌ BLOCKED — CAPTCHA accuracy
- Code đúng: POST `/zyfh/api/v1/access/login`, SHA1 pw, no Basic header, retry 4×
- Blocking: CAPTCHA hình nhiễu nặng, Gemini đọc sai ~100% các lần thử
- Giải pháp: tích hợp 2captcha API (`$0.001/solve`) hoặc bỏ qua JoyTel
- Product endpoints khi login được: `/productOriginPool/list`, `/category/findValidCategory`

#### Priority 3 — New features (sau Q3)

**C.2.8 Product Onboarding Phase 2 (Semi-Auto)**
- Điều kiện: Phase 1 ổn định ≥ 2 tháng, accuracy ≥ 95%
- Gấu Pro draft → Hiếu review → Gấu Pro insert vào Supabase
- KHÔNG insert vào PM trực tiếp (rủi ro cao)

**C.2.9 Multi-Portal Gap Analysis**
- Compare Elite/SunSpeedy/WM/3HK cùng lúc
- Tìm country nào GoHub chưa cover nhưng vendors có sẵn
- Output Excel với gap map

**C.2.10 Notion/Google Sheets Export**
- Useful cho sharing với BOD không dùng internal system
- Nice-to-have, không priority cao

### C.3 Quality Test Plan (Gấu Pro)

Test thủ công trên web — so sánh số với baseline:

**Baseline tháng 7/2026** (từ query thực):
- Revenue: ~7.9 tỷ VND (B2B: 6.1 tỷ, B2C: 1.8 tỷ)
- GP: ~2.8 tỷ | GP%: 36.2%
- Đơn hàng: 28,722
- 3HK%: 68% | 3HK Rev: ~5.4 tỷ
- Top B2B kênh: VN-Wholesales > Momo > VN-Ecom > VN-B2B Portal > Shopeepay
- ETL latest: 2026-07-30

| Test | Câu hỏi | Pass nếu |
|------|---------|---------|
| A1 | "Doanh thu tháng 7/2026?" | ~7.9 tỷ ±5% |
| A2 | "Top 5 kênh B2B tháng 7?" | Đúng thứ tự top 3 |
| A3 | "3HK contribution tháng 7?" | ~68% |
| A4 | "COGS SKU DCACMBCP00290?" | ~12,345k VND |
| B1 | "Cấu trúc mã product code?" | Đọc từ Own Info, không bịa |
| B2 | "Tỷ giá USD/VND hiện tại?" | Lấy từ KB, có ngày cập nhật |
| C1 | 2 câu hỏi liên tiếp khác chủ đề | Không cross-contaminate |
| D1 | "Vẽ bar chart doanh thu 6 tháng B2B+B2C" | Multi-series đúng |
| E1 | Trả lời thường → KHÔNG có export block | Không tự export |
| E2 | "Xuất Excel doanh thu tháng này" | Xuất CSV block đúng |

---

## D. DATA QUERY STANDARDS (reference)

> Chuẩn query cho tất cả tab Analytics + chatbot BI Analyst.

### D.1 Nguồn dữ liệu

| Nguồn | Dữ liệu | Cách truy cập |
|-------|---------|--------------|
| gohub_dw (GCP Postgres) | Revenue, orders, SKU, staff, customer | `queryAnalytics(sql)` |
| Supabase | Channel costs, group costs, target, config | `supabaseAdmin` |
| Turso | B2B per-customer costs `b2b_customer_cost_monthly`, quarterly targets | Turso REST |

### D.2 Quy tắc ngày

```sql
-- LUÔN dùng hôm qua làm upper bound (ETL chạy 08:00 ICT)
WHERE f.fulfiled_date::date <= CURRENT_DATE - 1

-- Tháng hiện tại
BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE - 1

-- Tháng cụ thể (vd tháng 7)
BETWEEN '2026-07-01' AND LEAST('2026-07-31'::date, CURRENT_DATE - 1)
```

### D.3 Gotchas quan trọng

- `fulfiled_date` ← chỉ 1 chữ "l" (KHÔNG phải "fulfilled")
- `dim_sku.sku` ← KHÔNG phải `sku_code`
- 3HK vendor: `REPLACE(UPPER(TRIM(vendor)),' ','') LIKE '3HK%'` (bắt cả '3HK DATAPOOL')
- `dim_customer` có 355k rows (99.7% B2C null) → JOIN B2B: `price_list_name IS NOT NULL`
- Exclude: `f.sku != 'SHIPPINGFEE0'`
- B2B filter: `UPPER(s.group_name) = 'B2B'` qua `dim_order_source`
- Exclude B2C/Ops customers: WHERE name NOT ILIKE '%B2C Customer%' AND NOT ILIKE '%B2B Ops%'

### D.4 CM1 formula (không có trong gohub_dw)

```
CM1 = GP - Channel_Cost - Group_Cost
CM1% = CM1 / Revenue × 100
```
- Channel_Cost: `analytics_channel_costs` (Supabase, JSON format)
- Group_Cost: `analytics_channel_group_costs` (Supabase)

### D.5 Pro-rata (Quarter Report)

- Monthly factor = totalDaysInMonth / daysElapsed (chỉ tháng đang chạy)
- Quarter factor = totalDaysInQuarter / daysElapsedInQuarter
- `amount` type cost: KHÔNG nhân factor
- `percent` type cost: áp trên projected revenue (rawRevenue × factor)

---

## E. QUARTER REPORT FORMULAS

> Chi tiết công thức từng cột tab Quarter Report

### E.1 Cột Revenue

| Cột | Nguồn | Công thức |
|-----|-------|-----------|
| Rev TT | gohub_dw | `SUM(fulfilled_revenue_amount_vnd)` WHERE tháng đó |
| Rev PR | TT | `Rev_TT × factor` (chỉ tháng đang chạy) |
| Rev Target | Turso `target_planning_quarter` | `target_revenue / 3` (chia 3 tháng) |
| %QoQ(CM1) | so với quý trước | `(CM1_PR_quý_này - CM1_TT_quý_trước) / |CM1_quý_trước|` |

### E.2 Phân tier B2B (dim_customer.price_list_name)

- **Strategic**: không có keyword VIP/Silver/Gold → hoặc price_list_name NULL có B2B group
- **VIP**: ILIKE '%VIP%'
- **Gold**: ILIKE '%GOLD%'
- **Silver**: ILIKE '%SILVER%' (bao gồm "[TV5] VN SILVER")
- **Exclude**: name ILIKE '%B2C Customer%' OR '%B2B Ops%'
- **Region**: currency_code='VND' → VN; 'USD' → US

### E.3 CH.Cost save/load

- Lưu: `b2b_customer_cost_monthly` (Turso), id = `YYYY-MM_customer_code`
- Sau save: flush cache `qb2b_v5` (L1+L2 Supabase)
- Cache key: `qb2b_v5` (bump khi đổi logic cost)

---

## F. CHATBOT SYSTEM (reference)

### F.1 7 Agents

| Agent | Trigger | Nguồn dữ liệu |
|-------|---------|--------------|
| tu-van | "đi nước X", "gói Japan" | sku_catalog Supabase |
| tra-cuu | Mã SKU/Product/Item, COGS | skus/products Supabase |
| giai-dap | "nghĩa là gì", thuật ngữ, KB | kb_wiki_pages Supabase |
| gap-analysis | "NCC có gì", "gap", "chưa import" | ncc_worldmove/3hk Supabase |
| bi-analyst | "doanh thu", "đơn hàng", số liệu | gohub_dw SQL |
| template | "tạo template", "xuất Excel NCC" | ncc catalog |
| data-explorer | "bao nhiêu SKU", toàn hệ thống | gohub_dw + Supabase 26 bảng |

### F.2 Routing

- Fast-path (tier≥5): regex deterministic → bypass Gemini
- Gemini fallback: chỉ khi không match fast-path
- Guardian: regex chặn (system_internal/pii/cogs/hr) → không LLM
- Multi-agent: khác domain → synthesize + "đợi xíu"

### F.3 Key files

```
web/src/lib/agents/
├── agents.ts       ← system prompts + DISPLAY_RULES + BI schema
├── graph.ts        ← signal→intent→agent routing
├── bi-analyst.ts   ← SQL templates + self-correction
├── data-explorer.ts← Supabase explorer
├── guardian.ts     ← regex guard
├── creator-ai.ts   ← Gấu Pro (full access)
└── orchestrator.ts ← multi-agent synthesis
```

---

## G. PORTALS (NCC suppliers)

| Portal | URL | Status | Login | Working endpoints |
|--------|-----|--------|-------|-------------------|
| Elite | simply.elitemobile.com | ✅ | Form ASP.NET | CorporateTopUp/GetNetworkWiseTopUps/{id} |
| SunSpeedy | cardweb.sunspeedy.com | ✅ fixed | POST /login + `token` header | /sim/simmanage/page, /order/order/page |
| JoyTel | joytelshop.com | ⏳ | POST /access/login + Basic auth | /productOriginPool/list (chưa test) |

**Products đã extract:**
- Elite: `ELITE/elite_products.md` (~76 sản phẩm UK)
- SunSpeedy: cần test thêm product endpoints

---

## H. MERGE/DEPLOY CHECKLIST

Trước khi merge staging → main:
- [ ] tsc PASS
- [ ] vitest unit tests PASS
- [ ] Hiếu duyệt UI trên staging
- [ ] Wiki các tab đã sửa được update
- [ ] Migration SQL đã chạy trên Supabase (nếu có)

Current staging (c70c74f) so với main lần cuối merge:
Xem `git log main..staging --oneline` để có danh sách đầy đủ.
