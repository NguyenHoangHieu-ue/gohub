---
title: "B2B Performance (Hiệu Suất Bán Sỉ B2B)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, b2b]
created: 2026-06-28
updated: 2026-07-28
status: active
---

# B2B Performance (Hiệu Suất Bán Sỉ B2B)

Hiệu suất kênh sỉ B2B: doanh thu/margin/units theo kênh & sub-channel, tách **Strategic vs Non-Strategic partners**, trend theo tháng. Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/b2b` — `web/src/app/(dashboard)/analytics/b2b/page.tsx` |
| API (KPI/trend) | `/api/analytics/b2b/{kpis, performance, strategic-performance, trend}` |
| API (VN Ecom breakdown, s204+5) | `/api/analytics/b2b/ecom-breakdown` |
| API (VN Ecom CH.Cost, s204+5) | `/api/analytics/b2b/ecom-costs` (Turso RIÊNG `b2b_ecom_cost_monthly`, không chung CH.Cost B2B khác) |
| API (chi phí KH) | `/api/analytics/b2b-customer-costs?month=YYYY-MM` |
| Nguồn doanh thu | fact (Fulfillment/Sales) + `dim_order_source` · `dim_customer` · `dim_sku` · `dim_staff` |
| Nguồn chi phí KH | **Turso** `b2b_customer_cost_monthly` — chi phí per-customer nhập thủ công |
| Config | Tier keywords (Supabase `quarterly_settings`) · Partner Tiers (`app_settings`) |

## 2. Lọc & phân loại
- Toàn bộ lọc `WHERE UPPER(s.group_name) = 'B2B'`.
- **Strategic** = kênh nằm trong partner tiers "Strategic" → `channel_name ILIKE ANY(...)`.
- **Tier (B2B Tier Performance)**: phân loại theo `price_list_name` từ `dim_customer`:
  - Dùng `tierKeywords` từ `quarterly-settings` API (giống Quarter Report).
  - Không có keyword nào khớp → xếp vào Strategic (default).
  - Tên bảng tier: Strategic / VIP / Gold / Silver.
- Trả về: `channel`, `sub_channel`, `revenue`, `margin`, `units`, `customer_code`, `price_list_name`, theo `month`.

## 3. Section chính
- **KPI cards**: Revenue, GP, CM1, Margin%, CM1% — cả Actual và Projected.
- **Revenue & CM1 Trend**: chart line/bar theo tuần/tháng.
- **Strategic Partners Performance**: bảng riêng đối tác chiến lược, có sub-channels.
- **B2B Tier Performance**: tất cả KH còn lại phân theo tier, có collapse/expand per tier.

## 4. CH.Cost trong B2B Tier Performance

**Luồng CH.Cost (từ 2026-07-28):**
1. FE gọi `/api/analytics/b2b-customer-costs?month=YYYY-MM` khi load.
2. Build `b2bCostMap: Record<customer_code, { cost_lines: [{label, type, value}] }>`.
3. Mỗi row trong bảng:
   - Nếu **có data Turso** cho `customer_code` đó → `CH.Cost = calcChCost(lines, revenue)`
     - `amount` type: cộng trực tiếp (VND cố định).
     - `percent` type: áp % lên revenue.
   - Nếu **chưa có data** → fallback `CH.Cost = margin - gpm2` (channel costs từ API).
   - `CM1 = GP - CH.Cost` (tính lại từ Turso nếu có).
4. **Expanded row** (click KH): hiển thị `cost_lines` ĐỘNG (label + value từ Turso).
   - Không còn 4 ô cố định (`ads`, `platformFee`, `sponsorProducts`, `media`).
   - Nếu chưa nhập → "Chưa có dữ liệu chi phí cho khách hàng này".
5. **TOTAL OTHERS row**: tổng CH.Cost + CM1 tính lại từ Turso data.

**Nhập chi phí KH B2B:** Dùng API `POST /api/analytics/b2b-customer-costs` với body `{ costs: [{month, customer_code, cost_type, cost_value, cost_lines}] }`.

**Cấu trúc cost_lines:**
```json
[
  { "label": "Platform Fee", "type": "percent", "value": 5 },
  { "label": "Quảng cáo tháng 7", "type": "amount", "value": 2000000 }
]
```

## 5. Manage Costs — ĐÃ NGẮT (2026-07-28)

Nút "Manage Costs" và `CostManagementModal` đã **xóa hoàn toàn** khỏi tab B2B Performance.
- Lý do: tách biệt chi phí channel-level (Manage Costs) với chi phí per-customer (Turso).
- Muốn nhập chi phí KH B2B → dùng API trực tiếp hoặc tạo UI riêng.
- Muốn quản lý channel costs → dùng tab khác có Manage Costs (nếu còn).

## 6. Gotchas
- **s204+5 (2026-09-22) — VN Ecom Breakdown (SIM/eSIM + Shopee Gohub/Nobrand), section mới cuối trang B2B
  Performance.** Hiếu yêu cầu breakdown 3 KH VN Ecom (Lazada/Shopee/Tiktokshop) → mỗi KH tách shop
  SIM/eSIM (`dim_sku.type_of_sim`) → riêng Shopee-SIM tách thêm 2 shop con **Gohub**/**Nobrand** theo
  người tạo đơn (`staff_code` → `dim_staff.name`). Route mới `api/analytics/b2b/ecom-breakdown` — match
  KH qua `dim_customer.name ILIKE 'VN Ecom %'` (KHÔNG hardcode customer_code — 3 mã thật hiện tại:
  `cnmgp9io9t`/`zwY4XcuAyk`/`bY3vgC9a3W`, nhưng 2 mã `B2BCustomerVn*` cũ trong `dim_customer` **rỗng
  hoàn toàn** dữ liệu — không dùng pattern code, chỉ dùng name).
  - **Xác nhận qua chat trước khi code (đã verify SQL sống, không đoán)**: Hiếu ban đầu nói "Gohub =
    HUỲNH LÊ MINH, Nobrand = KA" — verify Shopee-SIM thấy **KA có 0 đơn trong SIM** (KA chỉ tạo đơn ở
    Shopee-eSIM, 2.856 đơn/932tr — 69% eSIM còn lại không gắn staff nào). Báo lại Hiếu, Hiếu sửa: **Gohub
    = HUỲNH LÊ MINH, Nobrand = Kieu Anh** (`SHOP_STAFF` trong route, so khớp UPPER(tên), không phải KA).
  - Đã check thêm `company_code`/`location_id`/`order_source_code` trong Shopee-SIM — đồng nhất 1 giá
    trị, KHÔNG có field nào khác trong gohub_dw tách được Gohub/Nobrand ngoài `staff_code`.
  - Chỉ Shopee-SIM có sub-shop; Lazada/Tiktokshop và mọi eSIM KHÔNG tách (đúng yêu cầu Hiếu, không suy
    diễn thêm ra ngoài phạm vi).
  - Cache riêng `b2b-ecom1:...` (TTL 60' như route B2B khác), dep `b2b-ecom` — KHÔNG áp 3 filter chuẩn
    Ship/Internal-Ops/Ops-Customers (VN Ecom không phải KH ops, không cần) — chỉ nhận `startDate`/
    `endDate`/`dateColumn`/`includeShip` (mặc định loại phí ship, khớp default toàn trang).
  - Sau đó thêm: hàng **TOTAL VN ECOM** cuối bảng (`reduce` qua cấp customer, không double-count) + cột
    "Est. (projected)" nhỏ dưới mỗi số tiền khi `isProjectable` (× `projectionFactor`, giống các bảng
    B2B khác).
- **CH.Cost VN Ecom + cột CM1/%CM1 (2026-09-22, cùng đợt s204+5).** Hiếu yêu cầu thêm phần nhập chi phí +
  2 cột CM1/%CM1 cho breakdown này, **lưu riêng** với CH.Cost B2B khác (không chung
  `b2b_customer_cost_monthly` — breakdown VN Ecom theo shop/sub-shop, không có `customer_code` cho từng
  cấp shop/sub-shop).
  - Bảng Turso mới `b2b_ecom_cost_monthly` (`lib/b2b-ecom-cost.ts`, tự tạo qua `ensureB2bEcomCostTable()`
    — không cần chạy migration SQL tay): key `id = month::customer_name::shop_name::subshop_name` (rỗng
    khi không áp dụng cấp đó) — cho phép nhập cost độc lập ở CẢ 3 cấp (customer / shop / sub-shop), mỗi
    cấp không tự cộng dồn từ cấp con (nếu chỉ nhập cost ở cấp customer thì CM1 của shop con bên dưới
    KHÔNG bị trừ — đúng thiết kế, tách biệt hoàn toàn theo cấp đã chọn).
  - Route `api/analytics/b2b/ecom-breakdown` SQL thêm `TO_CHAR(..., 'YYYY-MM') AS month` + GROUP BY theo
    tháng (trước đó gộp cả kỳ) → build `monthly_data` per bucket → trừ CH.Cost pro-rata đúng
    (`calcChCostForPeriod` từ `analytics-engine/cost-engine.ts`, cùng công thức chuẩn hệ thống s133: amount
    × dayRatio theo tháng, percent × revenue thực tháng đó) — same pattern `b2b/performance` dùng cho
    CH.Cost per-customer. Cache dep thêm `b2b-ecom-cost` (giữ nguyên `b2b-ecom` cho phần revenue).
  - Route mới `api/analytics/b2b/ecom-costs` (GET đọc để prefill modal / POST batch upsert / DELETE 1
    record) — quyền `canWrite(session, "b2b", [...])`, flush cache dep `b2b-ecom-cost` sau khi lưu (KHÔNG
    đụng `b2b-ecom` — revenue không đổi khi sửa cost).
  - FE: nút nhỏ "Cost" cạnh tên mỗi dòng (customer/shop/sub-shop) mở modal — mỗi modal hiện lưới thẻ
    theo THÁNG trong khoảng ngày đang chọn (`monthsInRange()`, thuần client-side), mỗi thẻ tự nhập nhiều
    dòng chi phí (label/loại đ hoặc %/giá trị) — style/UX port y hệt modal "Sửa chi tiết" CH.Cost B2B ở
    Quarter Report (`b2b-tier-section.tsx`) nhưng đơn giản hoá cho 1 bucket/lần thay vì lưới nhiều KH.
    Lưu xong gọi lại `fetchData(true)` (nocache) để CM1 tươi ngay.
- **🔴 Incident s197 (2026-09-14) — Hiếu báo "kênh ecom tháng 9 hiển thị sai" (cả Quarter Report lẫn B2B
  Performance) — root cause: CACHE CŨ, không phải bug tính toán**. Verify trực tiếp qua SQL: "VN Ecom
  Shopee" T9 (1-13/9) thật có doanh thu 229.667.051đ, nhưng cả 2 trang đang hiện 137.802.046đ (thiếu
  40% — do cache TTL_L1 5'/TTL_L2 10' phục vụ snapshot cũ trong lúc dữ liệu ngày 9-13 tiếp tục đổ về).
  Toàn bộ công thức GP/CH.Cost/CM1/Actual-vs-Projected verify đúng 100% khi bypass cache (không phải bug
  logic — công thức nhất quán, khớp giữa Quarter Report và B2B Performance). **Bug thật phát hiện kèm
  theo**: trang B2B Performance KHÔNG có nút "Tải lại mới" nào (khác Quarter Report — vốn có sẵn) → Hiếu
  không có cách tự ép cache tính lại tươi, phải chờ TTL tự hết hạn (tối đa 5 phút, tuỳ instance serverless
  nào phục vụ request). Đã thêm nút "Tải lại mới" (`fetchData(true)` → `nocache=1`, đã tự động áp cho cả
  `b2b/kpis`/`b2b/performance`/`b2b/strategic-performance` vì dùng chung `queryParams`, và `b2b/trend`/
  `channels-with-platform-fee` qua biến `nc` riêng — không sót route nào). Đã tự query trực tiếp ép cache
  Quarter Report + B2B Performance tính lại tươi ngay trong lúc xử lý incident.
- **🔴 Fix s197 (2026-09-14) — bảng "Strategic Partners" không đọc toggle Phí ship/Đơn nội bộ/KH Ops**
  (phát hiện qua audit toàn hệ thống logic dữ liệu): `b2b/strategic-performance` route dùng chung ở
  **5 trang** (B2B/BOD/Dashboard/Products/Vendors) hoàn toàn không đọc `includeShip`/`includeInternalOps`/
  `includeOpsCustomers` dù FE B2B gửi đủ 3 tham số — bật/tắt toggle trên trang B2B đổi số KPI/Performance/
  Trend nhưng bảng Strategic Partners đứng yên không đổi. Fix: thread `shipFilter`/`internalOpsFilter`/
  `excludeOpsByCode`/`excludeInactiveCustomers` vào `raw_data` CTE, cache key thêm 3 cờ. **KHÔNG đổi** hệ
  phân loại tier (vẫn `getPartnerTiers()`/Supabase `partner_tiers` liệt kê tay, KHÔNG chuyển sang canonical
  `quarterly_tier_keywords`) — đây là quyết định Hiếu đã chốt trước đó ("giữ view này riêng, chưa đổi",
  xem wiki BOD mục Gotchas s131) vì bảng này có mục đích khác (đối tác NAMED cụ thể + sub-channel/cost
  breakdown per-partner), không phải phân loại B2B Strategic/Non-Strategic tổng quát như Quarter Report.
- **s196+21 (2026-09-14) — gộp wrapper `exportToCSV` trùng lặp**: b2b + products cùng tự viết 1 wrapper
  y hệt tên `exportToCSV` (thật ra xuất .xlsx, tên gây hiểu lầm) quanh `exportToExcel` + hậu tố
  `_startDate_to_endDate`. Gộp thành `exportWithDateRange` (`lib/export-excel.ts`), 2 trang giờ chỉ còn
  1 dòng delegate. Đề xuất H, P2.
- **s196+21 (2026-09-14) — gộp `SubChannelTable` dùng chung**: 2 bảng con sub_channels (Strategic dùng
  `theme="indigo"`, Non-Strategic dùng `theme="slate"`) trước viết tay riêng, style lệch nhau (finding #11
  audit UI/UX s196+20 — bg-white/40 vs bg-white/60, có/không backdrop-blur, CM1 accent indigo vs brand).
  Gộp thành `SubChannelTable` (`dashboard-kit.tsx`), `theme` giữ ĐÚNG 2 bảng màu cũ — không đổi UI, chỉ
  hết trùng code (đề xuất G, P2). Đúng UI Strict Lock (không tự đổi màu/bố cục).
- **s196+21 (2026-09-14) — gộp toLocaleString() trần → formatNumber()**: 2 chỗ (StatTile KPI Actual +
  Projected, nhánh không phải currency), cùng lý do lệch locale mặc định trình duyệt nêu ở wiki Channels
  — dùng lại hàm `formatNumber` local đã có sẵn trong file (tương đương `Intl.NumberFormat("vi-VN")`).
  Đề xuất C (P2) roadmap performance audit s196+20.
- **UI s196+20 (2026-09-14) — fix bug clip bảng lồng trong expand-row**: 2 wrapper bảng sub_channels
  (dòng ~538/~838, khối Strategic + Non-Strategic) dùng `overflow-hidden` (chặn scroll ngang của `<table>`
  bên trong để bo góc `rounded-xl`) → nội dung bảng bị CLIP khi cột không đủ chỗ trên màn hình hẹp. Phát
  hiện qua audit UI/UX toàn hệ thống. Đổi `overflow-hidden`→`overflow-x-auto` cả 2 chỗ — vẫn scroll ngang
  được, bo góc có thể mất đúng ở góc khi đang scroll (đánh đổi chấp nhận được so với clip nội dung).
- **UI s194 (2026-09-06) — KPI cards → `StatTile` (dashboard-kit)**: 5 card Actual + 5 card Projected đổi
  từ `<div>` viết tay sang `StatTile` dùng chung, icon màu theo Ý NGHĨA (`revenue`/`margin`/`positive`),
  chart Trend đổi màu sang `CHART_PALETTE`/`CHART_GRID_COLOR`/`chartTooltipStyle` dùng chung. Mọi `blue-*`
  Tailwind class còn sót (nút Apply Filters, tab Fulfillment/Created, tier group header, sort icon...) đổi
  sang `brand-*` (token thật `#0f4c81`). `indigo-*` ở bảng Strategic Partners GIỮ NGUYÊN (màu chủ đích phân
  biệt bảng này, không phải lỗi navy sai). **KHÔNG đổi**: bảng Strategic/Tier Performance (expand row,
  group theo tier, tổng TOTAL) — giữ nguyên `<table>` viết tay vì `DataTable` dùng chung hiện chỉ hỗ trợ
  bảng phẳng phân trang, chưa hỗ trợ group-header/expand-row — ép vào sẽ mất tính năng, không phải quick-win.
- **Fix s190+2 (2026-09-05) — thay `B2B_COST_CACHE_PREFIXES` (prefix-list viết tay) bằng `deps` khai tại
  chỗ cache.** Danh sách prefix cứng (mục s169(c) dưới) vẫn có nguy cơ lệch mỗi khi thêm route cache mới
  hoặc đổi version cache-key — 2 nơi (route cache thật vs danh sách prefix) tách rời nhau. Nay mỗi
  `cachedQuery(key, fn, ttl, bypass, deps)` tự khai `deps: ["b2b-cost"]` NGAY tại chỗ gọi (11 route:
  b2b/kpis|performance|trend|strategic-performance, channels/kpis|performance, bod-summary|group-margin|
  channel-performance, monthly-kpis, all-time-performance) — route ghi cost gọi `flushByDeps(["b2b-cost"])`
  thay `flushB2BCostCaches()`, không cần biết/nhớ route nào khác đang cache nó. Migration `v47_cache_deps.sql`
  thêm cột `deps text[]` + GIN index vào `analytics_query_cache`. `B2B_COST_CACHE_PREFIXES`/
  `flushB2BCostCaches()` đã xoá khỏi code — `flushAnalyticsCacheByPrefixes()` (prefix literal) vẫn giữ cho
  các trường hợp khác chưa migrate (vd `b2c-monthly:`/`b2c-leads:`, `QREPORT_CACHE_PREFIX`/`QB2B_CACHE_PREFIX`).
- **Fix s169(c) (2026-08-28) — cache flush toàn app nuke SẠCH gây chậm hẳn.** Fix s169 (mục dưới) ban đầu
  dùng `flushAnalyticsCache()` (xoá sạch bảng `analytics_query_cache`) sau mỗi lần sửa/xoá cost B2B — đúng
  đồng bộ nhưng xoá LUÔN cache của mọi tab KHÔNG liên quan (Products, Staff, Vendors, Orders, Customers, SQL
  Explorer registry...). Sửa cost/bấm "Tải lại mới" nhiều lần liên tục (lúc test) → cache toàn app bị nuke
  lặp lại → mọi trang phải query gohub_dw sống, web chậm hẳn. Fix ban đầu: `B2B_COST_CACHE_PREFIXES`
  (`analytics-helpers.ts`) liệt kê ĐÚNG các route thật sự cache kết quả phụ thuộc cost B2B + helper
  `flushB2BCostCaches()` — **đã thay bằng cơ chế `deps`, xem mục s190+2 ở trên**, giữ đoạn này làm lịch sử.
  `quarterly-cache-flush` cũng đổi sang scoped-prefix, import `QREPORT_CACHE_PREFIX`/`QB2B_CACHE_PREFIX`
  TRỰC TIẾP từ `lib/quarterly-settings.ts` (cùng 1 hằng số với chính route sinh ra cache key đó — không bao
  giờ lệch version như prefix list hardcode cũ; nay gọi thêm `flushByDeps(["b2b-cost"])` song song).
- **Fix s169 (2026-08-28) — sửa cost Quarter Report không cập nhật sang B2B Performance (+2 bug CM1
  còn sót sau audit toàn tab)**:
  - **Root cause chính**: `/api/analytics/b2b-customer-costs` (POST+DELETE, nơi Quarter Report "Sửa chi
    tiết" ghi CH.Cost per-customer vào Turso) KHÔNG flush cache — trong khi `channel-costs`/
    `channel-group-costs` (Supabase) đã `flushAnalyticsCache()` từ lâu. `b2b/kpis`, `b2b/performance`,
    `b2b/trend`, `channels/kpis`, `channels/performance`, `bod-summary`/`bod-group-margin`/
    `bod-channel-performance`, `monthly-kpis`, `all-time-performance` đều cache NGUYÊN khối kết quả đã
    tính (gồm cost) tới 60 phút (`QUERY_TTL_MIN`, hạ từ 12h ở s199+3 — xem `_analytics-data-model.md`
    §8) — chỉ `quarterly-report`/`quarterly-b2b-customers` tự tươi phần cost (cố ý đặt
    `fetchCustomerCosts` NGOÀI `cachedQuery`). Sửa cost xong, mọi tab kể trên giữ số CŨ tới hết TTL. Fix
    ban đầu: `flushAnalyticsCache()` sau khi lưu/xoá — **đã đổi sang scoped, xem mục s169(c) ở trên.**
  - **Bug 1**: `b2b/performance` — mẫu số chia group cost theo tỷ trọng revenue tính từ `finalRows` đã
    cap `.slice(0,500)` → >500 KH/kênh trong kỳ thì mẫu số hụt, CM1 tổng lệch nhẹ so với `b2b/kpis` (SQL
    SUM không cap). Đổi mẫu số sang tổng doanh thu KHÔNG cap.
  - **Bug 2**: `b2b/page.tsx` bảng "B2B Tier Performance" — (a) `getFilteredOtherTiers()`: lọc bớt
    sub-channel trùng tên đối tác Strategic thì tính lại `revenue/margin/gpm2` nhưng field `cm1` không
    theo → lệch nhau trên cùng row (chưa lộ vì `partner_tiers` rỗng); (b) merge 2 backend row cùng TÊN
    hiển thị khác `customer_code` (vd nhiều mã lỗi/rỗng gộp "Chưa xác định" — tình huống THẬT hay gặp)
    chỉ cộng `gpm2`, không cộng `cm1`/`ch_cost` → CM1 hiển thị chỉ tính row đầu bị merge.
- **Fix s168b (2026-08-28) — sub-channel CM1 breakdown cao hơn CM1 hàng cha**: click "View details" (expand
  1 KH trong B2B Tier Performance) trước hiện `sub_channels.gpm2` = margin thô, không trừ chCost Turso
  (per-customer) lẫn group cost share vốn đã trừ ở CM1 hàng cha (chỉ trừ cost khớp ĐÚNG TÊN sub-channel trong
  cost settings — gần như không bao giờ khớp cho B2B customer row) → tổng sub-channel CAO HƠN CM1 hàng cha (báo
  cáo thật: Momo cm1=215tr nhưng sub-channel cộng lại 437tr). Fix: track riêng cost đã trừ ĐÚNG cho 1 sub-channel
  cụ thể, phần còn lại (group cost + chCost Turso + cost "total"-mode) phân bổ theo tỷ trọng revenue giữa các
  sub-channel → Σ sub_channels.gpm2 luôn khớp CM1 hàng cha. Cùng bug (chưa lộ, do `partner_tiers` rỗng) cũng có
  ở `b2b/strategic-performance` (Strategic Partners Performance) — vá luôn cùng lúc. Cache key: `b2b-perf6`,
  `b2b-strategic2`.
- **Fix s168 (2026-08-28) — thiếu lọc KH INACTIVE**: `b2b/kpis`, `b2b/performance`, `b2b/trend` KHÔNG lọc khách
  hàng có `price_list_name` chứa "INACTIVE" (vd "[INACTIVE] Sponsor") — trong khi `quarterly-report`/
  `quarterly-b2b-customers`/`squad-progress` đã lọc từ lâu. Bất cứ KH INACTIVE nào phát sinh trong kỳ → Revenue/
  GP/CM1 B2B Performance cao hơn Quarter Report có hệ thống. Fix: helper dùng chung `excludeInactiveCustomers()`
  (`analytics-helpers.ts`), áp cho cả 3 route. Nhân tiện `b2b/trend` trước còn thiếu luôn cả 3 filter chuẩn
  (`includeShip`/`includeInternalOps`/`includeOpsCustomers`, s132) — chart trend trước không lọc gì ngoài
  group_name+date; đã thêm đủ + FE truyền param. Cache key bump: `b2b-kpis2`, `b2b-perf5`, `b2b-trend2`.
  ⚠️ **Vẫn khác theo thiết kế (không phải bug)**: Quarter Report chiếu PR (pro-rata `dim/elapsed`) cho tháng hiện
  tại ở headline; B2B Performance luôn hiển thị actual thô cho khoảng ngày chọn. So 2 tab cùng kỳ ĐÃ QUA sẽ khớp
  tuyệt đối; tháng đang chạy phải so cột "Actual" bên Quarter Report (không phải cột PR chính) mới khớp B2B
  Performance. Quarter Report cũng luôn dùng Fulfillment (không có toggle Created) — nếu B2B Performance đang
  toggle "Ngày tạo đơn" thì 2 tab không thể khớp.
- **Fix s162 (2026-08-26)**: KPI card (`b2b/kpis`) và Revenue&CM1 Trend chart (`b2b/trend`) trước dùng
  `analytics_channel_costs` (Supabase channel-level, gần như luôn rỗng cho B2B) → CM1 ở đó khác với bảng chi tiết
  bên dưới (vốn đã dùng Turso per-customer). Nay cả 2 đổi sang Turso `b2b_customer_cost_monthly`, khớp bảng chi
  tiết + Quarter Report.
- `dim_customer`: 355k rows, 99.7% là B2C với `price_list_name=NULL` → luôn dùng `LEFT JOIN`.
- Danh sách Strategic partners cấu hình ở **Settings → Partner Tiers**.
- Created mode → margin/CM1 = 0 (fact_sales_revenue không có gross_profit).
- Phân quyền: Admin, Creator, BOD, Manager, Staff.
- `calcChCost` chỉ dùng tháng `startDate.slice(0,7)` — multi-month range không tổng hợp nhiều tháng.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Revenue | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(...)` WHERE `group_name='B2B'` |
| GP (Gross Profit) | `fact_fulfillment_revenue.gross_profit_vnd` | `SUM(gross_profit_vnd)` = Revenue − COGS |
| CM1 | GP − CH.Cost | GP trừ chi phí kênh từ Turso hoặc fallback channel API |
| CH.Cost (per customer) | Turso `b2b_customer_cost_monthly` | `cost_lines`: `amount` (VND cố định) hoặc `percent` (% revenue) |
| Tier (B2B) | `dim_customer.price_list_name` | `tierKeywords` từ `quarterly-settings`; Strategic/VIP/Gold/Silver |
| Channel (B2B) | `dim_order_source.channel_name` | JOIN `f.order_source_code = dim_order_source.code` |
| Strategic Partners | Supabase `app_settings` Partner Tiers | `channel_name ILIKE ANY(strategic_list)` |
| Units / Orders | `fact_fulfillment_revenue` | `SUM(fulfilled_quantity)` / `COUNT(DISTINCT order_code)` |


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

