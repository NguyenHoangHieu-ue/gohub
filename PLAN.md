# GoHub System Plan — Master Document
> File duy nhất cho tất cả plan/roadmap/todo. Cập nhật trực tiếp ở đây.
> Xóa các file cũ: upd.txt, docs/master-plan.md, docs/data-query-standard.md, docs/quarterly-report-formulas.md, career-plan-q3.md

---

## TRẠNG THÁI HIỆN TẠI (2026-08-04)

- **Branch**: staging `75ed89c` — CHƯA merge main (staging-only rule từ s132)
- **Migrations chạy**: v30 ✅ | v30b ✅ | v31 ⏳ Hiếu chưa chạy (`chatbot_learning_log`)
- **s133 (2026-08-04)**: Fix B2B Performance — CH.Cost + projection về BE (Hướng B). Xem §B5.
- **Pending Hiếu**: chạy migration v31, set ENV LARK_CREATOR_USER_ID, nhập Cost T8 B2C ≠0, nhập target T7/T8.

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

### B4. Audit Analytics s125 (2026-08-01) — bug CHỜ HIẾU DUYỆT rồi mới sửa

> Chi tiết đối chiếu từng số: `docs/AUDIT_ANALYTICS.md` · danh sách bug: `Bug.txt` (2 file local, gitignored).
> Số nền T7 KHỚP tuyệt đối across Dashboard/Channels/BOD/B2B+B2C; GP=Rev−COGS lệch 0.00; 0 fan-out.

**🔴 Ảnh hưởng số ngay — ĐÃ XỬ LÝ (s126, 2026-08-02, Hiếu duyệt):**
- [x] BUG-DASH-1: ✅ FIX — `COUNT(*)` → `SUM(f.fulfilled_quantity)` trong `b2b/tier-performance/route.ts`. Verify live T7: 26.677 → 52.372. tsc PASS.
- [x] BUG-FULFILL-1: ✅ FIX (Hiếu chốt BỎ HẲN) — xoá cột Huỷ/Hoàn/Net/Giao/Trả (số bịa) khỏi API + FE; giữ số thật gross_orders/revenue/items_delivery. Wiki synced.
- [x] 3HK-1: ✅ KHÔNG PHẢI BUG CODE — tab đã có smart-default `MAX(first_report_date)` (commit 6e945c6) tự trỏ tháng data mới nhất (T6). Audit đọc nhầm `getDefaultDateRange`. Verify live max=2026-06-30, T6 có 36.662 rows. (Xem T7 → Hiếu sync data phía DB.)

**🟠 Trung bình:**
- [x] BUG-DASH-2: ✅ FIX (s126) — `NOT ILIKE ANY` → `NOT (channel_name ILIKE ANY(...))`. Verify live T7: non-strat 26.680→23.068 (hết trùng 3.612 strategic).
- [x] QUARTERLY-1: ✅ FIX (s126, Hiếu chốt SUM) — Quarterly op-cost `MAX(percent)` → `SUM(percent)` khớp toàn hệ thống. 0 tác động số hôm nay (0/293 kênh có ≥2 phí %).
- [x] DATA-QUALITY: ✅ ĐIỀU TRA + CHỐT (s126, Hiếu 2026-08-02) — Internal-Transaction/Misc. = SIM tiêu dùng nội bộ (COGS thật, revenue 0, GP âm, định kỳ mọi tháng). GIỮ trong Total GP (chi phí thật), không loại. Ghi wiki dashboard+bod giải thích chênh −14tr. Orders tab đã mặc định loại. ĐÓNG (không phải bug).

**🟡 Latent/nhẹ — ĐÃ XỬ LÝ (s126, 2026-08-02):**
- [x] BOD-1 ✅ chia group cost B2B theo revenue-share (bod-data ×2 + all-time); daily dedupe. 0 tác động số.
- [x] B2C-1 ✅ bỏ `*ratio` cho percent op-cost (b2c/kpis). Nhất quán bod-data.
- [x] STAFF-1 ✅ 4 query staff-report `LIKE '3HK%'` → `='3HKDATAPOOL'`. Chênh T7=0.
- [x] BOD-2 ✅ wire 2 nút Download chết (Revenue vs COGS + Margin Analysis) → export .xlsx.
- [x] CUST-1 ✅ không phải bug — FE không render `change`. Ghi chú wiki.
- [x] **ISSUE-DASH-5** ✅ FIX (s126) — tier-performance dùng `getAnalyticsSource(dateColumn)`: Created → sales table + created_date + GP=0 (hết trộn nguồn). Fulfillment không đổi. targets-summary luôn-fulfilled = cố ý (không sửa).
- [x] **ISSUE-DASH-4** ✅ FIX s131 (Hiếu chốt, 2026-08-03): đổi Strategic sang định nghĩa theo KHÁCH `price_list_name` (helper chung `getGroupCaseByCustomerSQL`/`IS_STRATEGIC_CUSTOMER_SQL`) cho: Dashboard line chart (revenue-chart2), **BOD group-margin cards + bod-summary, All-Time, scheduled 【4】**. Đồng nhất bảng Phân khúc. Gốc lỗi Strategic=0: `partner_tiers` RỖNG. Verify T7: Strategic 5,22 tỷ/Non 1,04 tỷ, tổng B2B 6,26 tỷ giữ nguyên. GIỮ theo partner_tiers (Hiếu chốt): bảng chi tiết "Strategic Channels" per-đối-tác (b2b/strategic-performance). Nhãn tiếng Anh giữ nguyên.
- [ ] **ISSUE-DASH-3 (UI, cần Bảo/Hiếu)**: nhóm "Other" (78 đơn, 0đ) bị loại khỏi bảng Business Groups → tổng đơn bảng < KPI card. Thêm dòng Other = đổi UI (Strict Lock) → chờ chỉ thị.

---

## B5. OOP Analytics Refactor — ROADMAP (2026-08-04, cập nhật theo tiến độ)

> **Vấn đề gốc**: B2C/Channels/BOD đang tính projection factor + CM1 + cost pro-rata **trên FE** →
> cross-month range cho kết quả sai, số giữa tab không nhất quán. B2B Performance đã fix (s133)
> và là pattern mẫu cho toàn bộ refactor.

---

### Trạng thái hiện tại (audit s133, 2026-08-04)

| Tab | Projection FE | CM1/Cost FE | Kết luận | Status |
|-----|:---:|:---:|---|:---:|
| B2B Performance | ❌ (đã fix) | ❌ (đã fix) | BE hoàn toàn | ✅ s133 |
| Channels | ✓ `getProjectionInfo()` | ✓ CM1 pro-rata | FE nặng | ✅ s133 |
| BOD | ✓ `getProjectionInfo()` | ✓ projected CM1 | FE nặng | ✅ s133 |
| B2C | ✓ `getProjectionInfo()` | ✓ CM1 + group cost | FE nặng | ✅ s133 |
| Staff | ✗ | ✗ | BE hoàn toàn | ✅ |
| All-Time | ✗ | ✗ | BE hoàn toàn | ✅ |
| Dashboard | ✗ | Một phần | Nhẹ | 〜 |
| Quarterly | ✗ | ✗ | BE hoàn toàn | ✅ |
| Fulfillment | ✗ | ✗ | BE hoàn toàn | ✅ |

---

### Kiến trúc đích (OOP)

```
web/src/lib/analytics-engine/
│
├── projection.ts          ← DÙNG CHUNG — projection factor rule
│   └── getProjectionFactor(startDate, endDate, today):
│         - Cross-month range → return 1 (không project)
│         - Tháng cũ (đã hoàn thành) → return 1
│         - MTD tháng hiện tại (same month) → return daysInMonth / daysElapsed
│         ✅ Logic đã viết trong b2b/page.tsx s133 → cần copy ra đây
│
├── cost-engine.ts         ← DÙNG CHUNG — tính chi phí pro-rata
│   ├── calcChannelCost(channelCosts, channel, month, mRev, startDate, endDate)
│   ├── calcGroupCost(groupCosts, channel, totalRev, startDate, endDate)
│   └── calcCustomerChCost(costMap, customerCode, monthlyData, startDate, endDate)
│         ✅ calcChCostForPeriod đã viết trong b2b/performance/route.ts s133 → move ra đây
│
└── types.ts               ← Interface chung
    ├── AnalyticsResult { revenue, margin, gpm2, ch_cost, cm1, cm1_percent }
    └── CostSources { channelCosts, groupCosts, customerCosts }
```

**Nguyên tắc bất biến:**
- `amount` type cost → `value × dayRatio` (dayRatio = days_in_range_for_month / days_in_month)
- `percent` type cost → `(value/100) × actual_revenue_in_period` (không nhân factor)
- Projection: `cm1_projected = cm1_actual × factor` (cả GP và CH.Cost đều × factor)
- Cross-month range (e.g. 27/7–2/8): KHÔNG project, chỉ hiện actual

---

### Phase 0 — Foundation (làm 1 lần, trước khi migrate bất kỳ tab nào)

**Việc cần làm**: Extract shared code thành `web/src/lib/analytics-engine/`

| File | Nguồn gốc | Nội dung |
|------|-----------|----------|
| `projection.ts` | `b2b/page.tsx:getProjectionFactor()` s133 | Cross-month check + MTD logic |
| `cost-engine.ts` | `b2b/performance/route.ts:calcChCostForPeriod()` s133 | Pro-rata amount+percent |
| `types.ts` | Viết mới | Interface AnalyticsResult |

**Verify**: `tsc --noEmit` PASS, import trong b2b/performance/route.ts chạy đúng.

---

### Phase 1 — Channels tab ✅ s133

**File BE**: `web/src/app/api/analytics/channels/kpis/route.ts`  
**File FE**: `web/src/app/(dashboard)/analytics/channels/page.tsx`

**Vấn đề hiện tại (FE)**:
```
getProjectionInfo():
  factor = lastDayOfMonth / daysElapsed  ← lỗi cross-month giống B2B cũ
  fullMonthOpCost = margin - gpm2
  projectedCm1 = margin × factor - fullMonthOpCost  ← sai với partial-month
```

**Fix BE** (`channels/kpis/route.ts`):
- Import `cost-engine.ts` → tính channel cost pro-rata đúng từng tháng
- Trả về `cm1`, `cm1_percent` trong response
- Trả về `projection_factor` (tính từ `projection.ts`) để FE biết nhưng KHÔNG dùng để tính

**Fix FE** (`channels/page.tsx`):
- Xóa `getProjectionInfo()` — dùng `projection_factor` từ BE response
- Xóa `fullMonthOpCost` calc — dùng `row.cm1` từ BE
- Giữ nguyên UI, chỉ thay nguồn data

**Verify**: 27/7–2/8 → không inflate, T7 full-month → CM1 khớp kpis route.

---

### Phase 2 — BOD tab ✅ s133

**File BE**: `web/src/app/api/analytics/bod/summary/route.ts` + `web/src/lib/bod-data.ts`  
**File FE**: `web/src/app/(dashboard)/analytics/bod/page.tsx`

**Vấn đề hiện tại (FE)**:
```
getProjectionInfo():
  factor = targetDays / daysElapsed  ← dùng targetDays (cuối tháng), không check cross-month
  fullMonthOpCost = summary.total_margin - summary.total_gpm2
  projectedGpm2 = projectedMargin - fullMonthOpCost  ← sai
```

**Ghi chú**: `bod-data.ts` đã làm nhiều ở BE (fetchBODGroupMarginData, fetchBODReportData).
Fix nhỏ: thêm `projection_factor` + `cm1_actual` vào summary response, FE chỉ display.

**Verify**: BOD projected section khớp với Quarterly tab cùng period.

---

### Phase 3 — B2C tab ✅ s133

**File BE**: `web/src/app/api/analytics/b2c/kpis/route.ts` + `b2c/performance/route.ts`  
**File FE**: `web/src/app/(dashboard)/analytics/b2c/page.tsx`

**Phức tạp nhất** — B2C có nhiều nguồn: GA4, Chatwoot/Omni, analytics_channel_costs, analytics_channel_group_costs.

**Vấn đề hiện tại (FE)**: `getProjectionInfo()` + group cost + spend calc.

**Chiến lược**: 
- `b2c/kpis` route đã có channel cost computation → thêm `cm1` field vào response
- Spend/CAC/CPL (GA4/leads) giữ nguyên trên FE (các nguồn này không dùng được projection đơn giản)
- Chỉ fix projection factor + CM1 core → tính BE; UI spend giữ nguyên

**Verify**: B2C CM1 T7 full-month khớp BOD B2C group.

---

### Phase 4 — Cleanup nhỏ ✅ s133

- **Staff**: Tier classification (Strategic/VIP/Gold) đang filter FE → move về `staff-report/route.ts` (thêm `tier` field vào response)
- **All-Time**: weighted average % đang tính FE → có thể giữ nguyên (không sai, chỉ là display)
- **Dashboard**: minor — không có FE computation lớn

---

### Nguyên tắc cho dev khi migrate từng tab

1. **Không xóa field BE cũ** — chỉ THÊM `cm1`, `ch_cost`, `projection_factor` vào response. FE backward-compat.
2. **FE pattern sau migrate**:
   ```tsx
   // TRƯỚC: tính trên FE
   const cm1 = row.margin * factor - (row.margin - row.gpm2)
   
   // SAU: đọc từ BE
   const cm1Actual = row.cm1 ?? row.gpm2
   const cm1Proj   = isProjectable ? cm1Actual * projectionFactor : cm1Actual
   ```
3. **isProjectable** = `projection_factor > 1` (từ BE) — FE KHÔNG tự tính factor nữa.
4. **Cache key** phải bump khi đổi logic cost (vd: `b2b-perf2` → `ch-perf1`).
5. **Test chuẩn cho mỗi tab**:
   - Range cross-month (27/7–2/8): không inflate, không hiện "Projected" section
   - Range MTD tháng hiện tại: projection đúng × factor
   - Range tháng đã hoàn thành (full month): factor = 1, số khớp với audit T7

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

**Baseline tháng 7/2026** (verified full-month s125, 2026-07-01→31, đối chiếu gohub_dw):
- Revenue: **8,099,914,406** VND (B2B: 6,263,171,682 · B2C: 1,836,742,724 · Other/internal 0đ)
- GP: **2,944,819,968** | GP%: **36.36%**
- Đơn hàng: **29,692** | Units (SUM qty): **58,830** | AOV ~272,798đ
- 3HK%: **67.69%** | 3HK Rev: **5,482,544,099**
- Top B2B kênh: VN-Wholesales > Momo > VN-Ecom > VN-B2B Portal > Shopeepay (chưa re-verify thứ tự ở s125)
- ETL latest: 2026-07-31 (T7 đủ tháng)
- ⚠️ Orders/Staff tab loại phí ship → tổng = 8,089,695,414 (−10,2tr); loại INTERNAL-TRANSACTION → 29,614 đơn.

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
- 3HK vendor: **chuẩn hệ thống = `REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'`** (dùng ở Dashboard/BOD/monthly-kpis/Quarterly = 7,930 SKU). ⚠️ Staff-report đang dùng `LIKE '3HK%'` (7,991 SKU, dư 61) — cần thống nhất (STAFF-1).
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

### D.5 Pro-rata — Chuẩn hệ thống (updated s133)

**Projection factor** (logic đúng, dùng chung — xem `analytics-engine/projection.ts`):
- Cross-month range (start.month ≠ end.month) → **factor = 1**, không project
- Tháng đã hoàn thành (end.month ≠ current month) → **factor = 1**
- MTD tháng hiện tại → **factor = daysInMonth / daysElapsed**

**Cost pro-rata** (logic đúng, dùng chung — xem `analytics-engine/cost-engine.ts`):
- `amount` type → `value × (days_in_range_for_month / days_in_month)` per month, sum qua tháng
- `percent` type → `(value/100) × actual_revenue_in_period` (không nhân dayRatio — revenue đã filtered đúng)

**Projection** (khi factor > 1):
- `cm1_projected = cm1_actual × factor` (CM1 = GP - CH.Cost, linear → có thể scale)
- `ch_cost_projected = ch_cost_actual × factor` (pro-rata actual × factor = ước lượng cả tháng)

**Quarter Report** (khác — pro-rata riêng, không liên quan projection factor trên):
- Monthly factor = totalDaysInMonth / daysElapsed (chỉ tháng đang chạy)
- Quarter factor = totalDaysInQuarter / daysElapsedInQuarter
- `amount` type cost: KHÔNG nhân factor (nhập cả tháng, dùng nguyên)
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
