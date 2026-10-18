---
title: "Channel Performance (Hiệu Suất Kênh Bán Hàng)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, channels]
created: 2026-06-28
updated: 2026-07-28
status: active
---

# Channel Performance (Hiệu Suất Kênh Bán Hàng)

Tab 2 mode: **All Channels Overview** (tổng hợp tất cả kênh) và **Single Channel Deep-Dive** (phân tích chi tiết 1 kênh). Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/channels` — `web/src/app/(dashboard)/analytics/channels/page.tsx` |
| API overview | `/api/analytics/channels/performance` — tất cả kênh, có CM1 |
| API deep-dive | `/api/analytics/query` (POST SELECT) — query trực tiếp gohub_dw |
| Chi phí kênh | Supabase `analytics_channel_costs` + `analytics_channel_group_costs` |

**s183 Phase 5 (2026-09-04, ⏳ đang chờ Hiếu QA staging)** — tách cơ học `B2BCustomerDetail` (bảng chi
tiết kênh + top sản phẩm khi mở rộng 1 khách B2B) sang `web/src/components/channels/b2b-customer-detail.tsx`.
`page.tsx` 1944 → 1843 dòng, JSX/logic giữ nguyên y hệt. Máy dev không có `.env.local` nên không verify UI
bằng mắt — Hiếu cần QA tay trên staging.

## 2. Hai chế độ xem

### 2a. All Channels Overview (mới từ 2026-07-28)
**Khi nào:** Dropdown chọn `"All Channels (Overview)"` (giá trị rỗng `""`).

**API:** `GET /api/analytics/channels/performance?startDate=&endDate=&dateColumn=&channelGroup=`

**Dữ liệu trả về per kênh:** `channel`, `group_name`, `is_strategic`, `revenue`, `margin`, `margin_percent`, `gpm2` (CM1), `gpm2_percent`, `units`, `orders`, `prev_revenue`, `mom` (MoM%).

**Bảng hiển thị:** Channel | Group | Revenue | GP | Margin% | CM1 | CM1% | Orders | Units | MoM

**Tương tác:** Click vào tên kênh → tự navigate sang Single Channel Deep-Dive mode cho kênh đó.

**Tổng (TOTAL row):** Tự tính sum tất cả kênh đang hiển thị.

### 2b. Single Channel Deep-Dive
**Khi nào:** Dropdown chọn 1 kênh cụ thể.

**Gồm các section:**
- **Pro-rata Projection** (nếu đang tháng hiện tại): dự phóng cuối tháng.
- **KPI Cards**: Revenue, GP, CM1, Orders, Units, AOV.
- **Revenue Trend**: biểu đồ ngày.
- **Performance Breakdown**: breakdown theo sub-channel (từ `dim_order_source.sapo_name`).
- **Daily Performance Details**: bảng ngày.
- **Top Selling Products**: top SKU của kênh đó.

**Channel filter trong SQL:**
```sql
(order_source_code IN (SELECT code FROM dim_order_source WHERE TRIM(channel_name) = '<channel>')
 OR TRIM(customer_code) IN (SELECT TRIM(code) FROM dim_customer WHERE TRIM(name) = '<channel>')
 OR TRIM(customer_code) = '<channel>')
```

## 3. Query chính — `channels/performance` API

```sql
WITH cur AS (
  SELECT TRIM(s.channel_name) AS channel, UPPER(s.group_name) AS group_name,
         CASE WHEN s.channel_name ILIKE ANY(ARRAY[<strategic_list>]) THEN true ELSE false END AS is_strategic,
         SUM(f.<revenueCol>) AS revenue, SUM(f.<marginCol>) AS margin,
         SUM(f.<quantityCol>) AS units, COUNT(DISTINCT f.order_code) AS orders
  FROM <mainTable> f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
  WHERE <dateFilter> <groupFilter>
  GROUP BY 1, 2, is_strategic
),
prv AS ( ...revenue kỳ trước theo channel... )
SELECT c.*, COALESCE(p.revenue,0) AS prev_revenue
FROM cur c LEFT JOIN prv p ON c.channel = p.channel
ORDER BY c.group_name, c.revenue DESC;
```

**CM1 trong API:** `gpm2 = margin - opCost` — opCost tổng hợp từ:
- B2B: Turso `b2b_customer_cost_monthly` (per-customer, **fix s162** — trước dùng `analytics_channel_costs`
  gần như luôn rỗng cho B2B → CM1 B2B cao ảo), phân bổ vào từng channel theo revenue-share (Turso không có
  dimension channel).
- B2C/Other: `analytics_channel_costs` per kênh (ads/platform_fee/sponsor_products/media × ratio ngày) — không đổi.
- Mọi group: `analytics_channel_group_costs` phân bổ theo revenue share.

## 4. Manage Costs — ĐÃ NGẮT (2026-07-28)

Nút "Manage Costs" và `CostManagementModal` đã **xóa hoàn toàn** khỏi tab Channel Performance.
- Lý do: tạm thời tách biệt luồng nhập cost khỏi các tab analytics.
- Data cost đã nhập trong `analytics_channel_costs` vẫn còn nguyên, API vẫn đọc để tính CM1.
- Muốn nhập cost lại → cần khôi phục button trong `page.tsx`.

## 5. Gotchas
- **🔴 Fix s197 (2026-09-14) — Revenue/Gross Profit/chart/Top Products/Performance Breakdown thiếu
  filter Phí ship + Đơn nội bộ, lệch với CM1 card cùng trang** (phát hiện qua audit toàn hệ thống logic
  dữ liệu): `channels/page.tsx` build SQL client-side (Summary/Trend/Top Products/Performance Breakdown)
  — 0 chỗ nào loại `sku='SHIPPINGFEE0'`/nhóm `INTERNAL-TRANSACTION`, trong khi thẻ KPI "Contribution
  Margin 1" gọi route riêng `channels/kpis` VỐN loại mặc định 2 khoản này. Trang không có toggle riêng
  như BOD/B2B/B2C nên fix bằng cách LUÔN loại mặc định (không thêm UI mới) — khớp hành vi `channels/kpis`.
  Route `channels/performance` (bảng breakdown per-channel dùng ở All Channels Overview) cùng lỗi, đã
  thêm `shipFilter(false)`/`internalOpsFilter(false)` vào mọi query con (kể cả B2B per-customer cost
  allocation). Route `channels/b2b-customers` đã đúng từ trước (không đổi).
- **s196+21 (2026-09-14) — gộp toLocaleString() trần → formatNumber()**: 2 chỗ `Math.round(...).
  toLocaleString()` KHÔNG truyền locale → dùng locale MẶC ĐỊNH của trình duyệt (vd `en-US` → phẩy ngăn
  cách, khác `vi-VN` dùng chấm) — số hiển thị LỆCH tuỳ máy/trình duyệt người xem, không nhất quán với
  phần còn lại của trang (đã dùng `formatNumber()` = `vi-VN` cố định). Đổi sang `formatNumber()`. Đề
  xuất C (P2) roadmap performance audit s196+20, làm dần theo tab đang sửa.
- **s196+21 (2026-09-14) — aria-label cho nút refresh icon-only**: 3 nút `RefreshCw` (header chính,
  B2B Customers, All Channels Overview) chỉ có icon, không `aria-label` — thêm mô tả ngắn. Đề xuất I
  (P1) roadmap audit UI/UX s196+20, làm dần theo tab đang sửa.
- **s196+21 (2026-09-14) — code-split recharts**: chart "Revenue Trend" tách sang `channels-charts.tsx`
  (`React.memo` + `next/dynamic({ssr:false})`, cùng pattern `bod-charts.tsx`) — trước import `recharts`
  trực tiếp ở `page.tsx` (1844 dòng, file lớn thứ 2 repo). Phát hiện qua audit performance toàn hệ thống.
  Không đổi số liệu/UI.
- **s194+9 (2026-09-06)**: UI redesign — chart Revenue Trend + toàn bộ `blue-*` đổi sang `CHART_PALETTE`/
  `brand-*` dùng chung (không đổi logic/API). Lúc làm phát hiện `CostManagementModal`/`showCostModal`/
  `dbRole` trong `page.tsx` là dead code còn sót từ lúc ngắt Manage Costs (§4 trên) — chưa dọn, không phải
  bug chức năng (không render gì cả nên vô hại), để dành dọn riêng nếu có đợt cleanup.
- **Fix s162**: `channels/kpis` (KPI card) cũng đổi sang Turso per-customer cost khi scope là B2B (channelGroup=B2B
  hoặc 1 channel cụ thể thuộc nhóm B2B) — trước cùng lỗi analytics_channel_costs rỗng như bảng performance.
- `groupFilter` = `AND UPPER(s.group_name) = 'B2B'|'B2C'` khi user lọc theo nhóm.
- Created mode → margin = 0 (fact_sales_revenue không có gross_profit_vnd).
- eSIM (3HK, WorldMove): `location_id = 0` ("Unknown") — bình thường, không phải lỗi.
- Channel group filter (All/B2B/B2C) ảnh hưởng danh sách kênh trong dropdown — khi đổi group, danh sách reload nhưng `selectedChannel=""` (All Channels) được giữ nguyên.
- `fetchChannels` không auto-select kênh đầu tiên nếu `selectedChannel=""` (để giữ All Channels mode).

## 6. Phân quyền
Admin, Creator, BOD, Manager, Staff đều xem được. Không có role restriction riêng cho tab này.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Revenue | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(fulfilled_revenue_amount_vnd)` GROUP BY channel |
| GP (Margin) | `fact_fulfillment_revenue.gross_profit_vnd` | `SUM(gross_profit_vnd)` = Revenue − COGS |
| Margin% | GP / Revenue × 100 | Tính từ 2 cột trên |
| CM1 (gpm2) | GP − Operation Cost | `margin - opCost`; B2B: Turso `b2b_customer_cost_monthly` (s162) + group cost · B2C/Other: `analytics_channel_costs` + group cost |
| CM1% (gpm2%) | CM1 / Revenue × 100 | Tính từ 2 cột trên |
| Channel | `dim_order_source.channel_name` | JOIN `f.order_source_code = dim_order_source.code` |
| Group (B2B/B2C) | `dim_order_source.group_name` | `UPPER(group_name)` |
| Is Strategic | Supabase `app_settings` Partner Tiers | `channel_name ILIKE ANY(strategic_list)` |
| CH.Cost per channel | Supabase `analytics_channel_costs` | `SUM(amount)` per `channel_name` × tháng (ads/platform/sponsor/media) |
| Group Cost | Supabase `analytics_channel_group_costs` | `SUM(amount)` per `group_name` × tháng; phân bổ theo revenue share |
| MoM% | `fact_fulfillment_revenue` kỳ trước | `(revenue_cur - revenue_prev) / revenue_prev × 100` |


---

## § Filter Chuẩn (s132 — 2026-08-04)

Từ s132, tất cả tab analytics có 3 filter:

| Filter | Default | Ý nghĩa |
|--------|---------|---------|
| `includeShip` | **Off** | Bao gồm phí ship (`sku = SHIPPINGFEE0`). Mặc định loại — doanh thu SP thuần |
| `includeInternalOps` | **Off** | Bao gồm đơn nội bộ (`group_name = INTERNAL-TRANSACTION`). Mặc định loại — GP âm do SIM nội bộ |
| `includeOpsCustomers` | **Off** (B2B/B2C) | Bao gồm KH ops (B2B Ops, B2C Customer US/VN). Mặc định loại khỏi B2B/B2C total |

**Khi bật CẢ 3 → khớp số liệu raw `gohub_dw` (dùng để validate).**

UI: checkbox nhỏ bên cạnh nút Apply Filters / Lọc trong filter bar.


## s211d (2026-09-27) — CM1 tổng quan Channels (không chọn kênh cụ thể) cao hơn thật nhiều lần

`channels/kpis` (KPI card đầu trang, gọi với `channel=""` khi chưa chọn kênh — mặc định của tab) tính `isB2BScope` từ `channelGroup`/tên kênh đơn lẻ — khi xem TOÀN BỘ (không chọn kênh), `isB2BScope=false` nên **không hề trừ chi phí theo khách B2B (Turso)**; đồng thời `tursoGroup` chỉ khác `null` khi `channelGroup` đúng bằng `"B2B"`/`"B2C"` — nhưng trang Channels **không bao giờ truyền `channelGroup` cho `channels/kpis`** (chỉ truyền `channel`) nên **group cost không bao giờ được trừ** dù ở chế độ nào. Đo T8: CM1 hiện 3,09 tỷ so với đúng 2,17 tỷ (Quarter Report/BOD).
**Fix**: bỏ khái niệm `isB2BScope`/`tursoGroup` nhị phân — LUÔN tách doanh thu B2B/B2C thật trong scope đang xem (`b2b_revenue`/`b2c_revenue` từ query chính), cộng CẢ chi phí Turso B2B (tính trên đúng phần doanh thu B2B của scope) LẪN chi phí kênh B2C (Supabase, như cũ) LẪN group cost B2B+B2C — group cost phân bổ theo tỷ trọng `doanh thu scope / doanh thu TOÀN CÔNG TY cùng kỳ` (query mới, không lọc theo kênh) — đúng công thức `finalizeGroupMargin` (`bod-data.ts`). Khi scope = toàn công ty (không chọn kênh), tỷ trọng = 1 → khớp tuyệt đối BOD/Quarter Report. `channels/performance` (bảng theo từng kênh, đã cộng cả 2 nguồn + group cost per-channel) đã đúng từ trước, không sửa. Cache key `ch-kpis` → `ch-kpis2`.

**Sửa tiếp ngay sau khi QA** (tự phát hiện trước khi báo Hiếu): chi phí Turso B2B lúc đầu tính TRỰC TIẾP theo doanh thu khách hàng TRONG PHẠM VI KÊNH đang xem (`WHERE ... AND channel=X`) — sai vì Turso cost gắn với KHÁCH HÀNG, không có dimension kênh, và 1 khách B2B có thể mua qua nhiều kênh trong kỳ nên % phí tính theo doanh thu 1 kênh sẽ SAI (đo: chênh 166–208 triệu/kênh so với `channels/performance`). Sửa đúng: tính TỔNG chi phí Turso toàn công ty (không lọc kênh) rồi phân bổ vào scope theo `revShare` — CÙNG cách `channels/performance`/`bod-data.ts` đã làm. Verify sau deploy: `channels/kpis` theo từng kênh khớp `channels/performance.gpm2` cùng kênh (0 lệch).

**Sửa tiếp lần 2**: dù đã đổi Turso sang revShare, 3/4 kênh B2B thử vẫn lệch 166-208 triệu so với `channels/performance` cùng kênh — do nhánh chi phí kênh Supabase (B2C) vẫn cộng thêm bất kể nhóm, double-count với Turso nếu tình cờ có config `analytics_channel_costs` cùng tên kênh B2B. Fix: chỉ cộng nhánh này khi scope có doanh thu B2C thật (`cB2CRev !== 0`) — kênh 100% B2B thì bỏ qua hoàn toàn. Verify sau deploy: cả 4 kênh top doanh thu khớp `channels/performance.gpm2` (0 lệch).

**Lỗi thứ 3 — vì sao 2 lần sửa trên KHÔNG thấy hiệu lực khi test**: `channels/kpis` gọi `cachedQuery(..., undefined, ["b2b-cost"])` — tham số `refresh` cứng `undefined`, KHÔNG đọc `nocache=1` từ query string (khác mọi route khác dùng `noCache(req)`). Cache nội bộ (khoá `ch-kpis2`, TTL theo `QUERY_TTL_MIN`) tiếp tục trả giá trị TÍNH TỪ TRƯỚC LẦN SỬA ĐẦU dù đã bump key/deploy — khiến việc verify tưởng chưa fix dù code đã đúng. Fix: đổi `undefined` → `noCache(req)`, bump khoá `ch-kpis2` → `ch-kpis3`. Verify SAU KHI có `nocache=1` thật: VN-Wholesales/Momo/VN-Ecom (kênh B2B) khớp `channels/performance.gpm2` — xem kết quả cuối trong session_summary s211d.

## s232 (2026-10-12) — Single Channel: bảng Performance Breakdown / Total CM1 tính sai

Hiếu chọn kênh Shopeepay thấy hàng Total của "Performance Breakdown" tính sai tổng "Dự phóng CM1". Gốc: `metrics.totalOpCost`, `metrics.opCostBreakdown` (và `channelCostsMap`/`channelSettingsMap`) **không bao giờ được gán** sau khi chuyển chi phí về BE (s133) → chi phí vận hành mỗi dòng sub-channel luôn = 0.
- Hậu quả: cột "Contribution Margin 1" từng dòng = Gross Profit (không trừ chi phí); "Dự phóng CM1" từng dòng = GP × hệ số; trong khi hàng Total dùng CM1 thật (`gpm2` từ `channels/kpis`) × hệ số → tổng các dòng ≠ Total. Khung "Total Op Cost" mở rộng luôn hiện 0.
- Sửa: `channels/kpis` trả thêm `total_op_cost` + `op_cost_breakdown` (ads/platformFee/sponsorProducts/media + `b2bCustomer` (Turso, phân bổ revShare) + `group`); khoá cache `ch-kpis3` → `ch-kpis4`. Trang gán `totalOpCost`/`opCostBreakdown` vào `metrics` (chia lại theo tỷ trọng doanh thu khi đang lọc vendor/loại SP/sub-channel, vì BE không nhận các bộ lọc đó) và CM1 hiển thị = GP đã lọc − chi phí. Mỗi dòng: CM1 = GP − chi phí phân bổ theo doanh thu; **Dự phóng CM1 dòng = CM1 dòng × hệ số** (cùng công thức hàng Total, cả bảng lẫn Export). Khung chi phí thêm 2 mục "Chi phí KH B2B" và "Group Cost".
- Sửa thêm: %thay đổi thẻ "Contribution Margin 1" trước đây so CM1 kỳ này với **GP** kỳ trước (khác cơ sở) → nay gọi `channels/kpis` cho kỳ so sánh và so CM1 với CM1.
- Chưa sửa (nêu cho Hiếu): `channels/kpis` không nhận lọc vendor/loại SP/sub-channel (đang dùng cách chia lại theo doanh thu); `channelSettingsMap` chế độ "subchannels" là code chết; "X% Growth Expected" thực ra là hệ số chiếu − 1.

## s232(b) (2026-10-12) — Chi phí khách B2B chia theo KHÁCH THẬT (Channels + BOD kênh)

Hiếu thấy CM1 âm ở Shopeepay MY/SG/PH. Gốc: chi phí khách B2B (Turso `b2b_customer_cost_monthly`) bị gộp TOÀN công ty rồi chia theo doanh thu kênh (`channels/kpis`, `channels/performance`, `fetchBODChannelPerformanceData`), và trong bảng Performance Breakdown lại chia tiếp theo doanh thu sub-channel → kênh/sub-channel có khách CHƯA nhập chi phí vẫn gánh phần của khách khác. (Shopeepay ID/MY/SG/PH chưa nhập chi phí — chỉ Shopeepay VN có.)
- Hàm thuần dùng chung `lib/analytics-engine/customer-cost-allocation.ts` `allocateCustomerCostByKey` (test `customer-cost-allocation.test.ts`): chi phí mỗi khách×tháng tính trên TỔNG doanh thu khách (mọi kênh), rồi chia về từng key (kênh / sub-channel) theo doanh thu của khách trong key. Khách không có chi phí thì không gánh gì. Tổng toàn công ty KHÔNG đổi, chỉ chia lại giữa các kênh.
- Áp tại: `channels/performance` (bảng All Channels), `bod-data.ts` `fetchBODChannelPerformanceData` (BOD theo kênh), `channels/kpis` (thẻ + `sub_channel_costs` cho từng sub-channel). Trang Channels: mỗi dòng sub-channel nhận đúng chi phí khách của nó (`metrics.rowOpCostMap`), chi phí còn lại (kênh B2C, group cost) chia theo doanh thu; bỏ code "subchannels" chết. Khoá cache: `ch-perf2`, `ch-kpis5`, `bod-channel-perf2`.
- KHÔNG đổi: BOD theo nhóm (Strategic/Non, đã theo khách), BOD theo ngày, Quarter Report, group cost (vẫn chia theo tỷ trọng doanh thu).
- ⚠️ CM1 các kênh có khách chưa nhập chi phí (vd Shopeepay ID/MY/SG/PH) sẽ CAO hơn trước cho tới khi nhập chi phí khách.

## s236 (2026-10-18) — Thẻ CM1 (`channels/kpis`) cộng chi phí kênh B2B → âm khi kỳ có tháng 7
- Đo staging: Q3 thẻ CM1 −1,318 tỷ, Σ bảng `channels/performance` = Quarter Report = 5,658 tỷ. T7: −518tr vs +2,035 tỷ. T8/T9/T10 khớp (không có chi phí kênh nhập).
- Nguyên nhân: `analytics_channel_costs` tháng 7 có platformFee kênh B2B (2,46 tỷ); `channels/kpis` cộng chi phí MỌI kênh khi scope có doanh thu B2C, percent nhân doanh thu cả scope.
- Sửa: chi phí kênh tính theo từng kênh không-B2B (query doanh thu theo kênh, `group_name NOT LIKE 'B2B%'`), percent × doanh thu của chính kênh — cùng cách `channels/performance`. Cache key `ch-kpis6`.
- Còn lệch nhỏ chưa sửa: Channels/Staff không lọc KH Inactive (+161k Q3 so với Quarter/BOD); `/api/analytics/kpis` không lọc ship/nội bộ (+10,2tr T7).

## s236(b) (2026-10-18) — Channels/Staff lọc KH Inactive + trend cùng bộ lọc mặc định
- Đo Q3: Quarter Report = BOD = 22.900.622.128; Channels/Staff 22.900.783.129 (+161k, toàn ở T7) vì thiếu `excludeInactiveCustomers()`. Đã thêm vào `channels/kpis`, `channels/performance`, `channels/trend`, `staff-report`, `staff-report/customers` (cache key `ch-kpis7`, `ch-perf3`, `ch-trend2`, `staff-report:v3`).
- `channels/trend` trước không có bộ lọc ship/nội bộ nào → nay luôn loại phí ship + đơn nội bộ như `channels/performance`/`kpis` mặc định (đổi số biểu đồ xu hướng).
- Lưu ý khi so sánh: UI Quarter/BOD mặc định `includeShip=true`, còn API mặc định false; Dashboard (`kpis`, `monthly-kpis`) gồm phí ship (T7: 10,22tr = SHIPPINGFEE0) nên khớp Quarter UI mặc định, KHÔNG phải lỗi. Channels luôn loại ship (không có toggle) nên thấp hơn Dashboard đúng phần ship.
