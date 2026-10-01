---
title: "Vendor Performance (Hiệu Suất Nhà Cung Cấp)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, vendors]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# Vendor Performance (Hiệu Suất Nhà Cung Cấp)

Doanh thu / margin / units / orders theo **vendor (NCC)** — WorldMove, 3HK DATAPOOL, v.v. Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/vendors` — `web/src/app/(dashboard)/analytics/vendors/page.tsx` |
| API | `/api/analytics/vendors/report`, `/api/analytics/vendors/list` |
| Nguồn | fact (Fulfillment/Sales) + `dim_sku` (cột `vendor`) + `dim_order_source` |

## 2. Logic
- Gom doanh thu theo `dim_sku.vendor` (join `f.sku = dim_sku.sku`).
- Trả: `sku` / vendor, `revenue`, `margin`, `units`, `orders` (`COUNT(DISTINCT f.order_code)`), theo `date`, `group_name`.
- Có thể lọc theo nhóm kênh (B2B/B2C).

## 3. Gotchas
- **🔴 Fix s197 (2026-09-14) — TOÀN BỘ tab 0 filter chuẩn nào (Phí ship/Đơn nội bộ)** (phát hiện qua
  audit toàn hệ thống logic dữ liệu): mọi SQL build client-side (Summary/Trend/Top Products/Channel
  Distribution) — grep `shipFilter`/`internalOpsFilter`/`SHIPPINGFEE0`/`INTERNAL-TRANSACTION` = 0 kết
  quả trong toàn file trước fix. Doanh thu 1 vendor LUÔN cộng cả phí ship + đơn nội bộ, không khớp chuẩn
  "doanh thu SP thuần" mọi tab khác dùng. Trang không có toggle riêng → thêm `stdFilter`/`fStdFilter`
  (loại mặc định, không thêm UI) áp cho cả 10 câu SQL trong `fetchData()`. Route `vendors/report`/
  `vendors/list` (dead code, không FE nào gọi) không đổi — ngoài scope.
- **s196+21 (2026-09-14) — gộp toLocaleString() trần → formatNumber()**: 2 chỗ, cùng lý do lệch locale
  mặc định trình duyệt nêu ở wiki Channels. Đề xuất C (P2) roadmap performance audit s196+20.
- **s196+21 (2026-09-14) — aria-label cho nút refresh icon-only**: nút `RefreshCw` header chỉ có icon,
  không `aria-label` — thêm mô tả ngắn. Đề xuất I (P1) roadmap audit UI/UX s196+20, làm dần theo tab
  đang sửa.
- **s196+21 (2026-09-14) — code-split recharts**: chart "Revenue Trend" tách sang `vendors-charts.tsx`
  (`React.memo` + `next/dynamic({ssr:false})`, cùng pattern `bod-charts.tsx`/`my-metrics-charts.tsx`) —
  trước import `recharts` trực tiếp ở `page.tsx` (1262 dòng), nặng vào bundle đầu dù chỉ 2/8 tab có chart
  lớn từng làm đúng (bod/my-metrics). Phát hiện qua audit performance toàn hệ thống. Không đổi số liệu/UI.
- **s195+10 (2026-09-08) — fix bug thật: Channel Distribution phân loại Strategic sai (2 hệ thống
  Strategic khác nhau lệch nhau).** Hiếu báo tiếp "channel strategic mà nó để non-strategic", chỉ tham
  khảo tab Quarter Report. Phát hiện: repo có **2 hệ thống phân loại Strategic hoàn toàn khác nhau**: (1)
  **cũ** — `partner_tiers` (Supabase `app_settings`, sửa qua Settings) = danh sách TÊN kênh/đối tác được
  liệt kê tay, so khớp `channel_name ILIKE ANY(...)` — kênh mới/chưa kịp thêm tay bị rơi mặc định Non-
  Strategic; Vendors + Channels + `b2b/strategic-performance` đang dùng hệ này. (2) **mới, canonical**
  — `quarterly_tier_keywords` (khác key Supabase, sửa ở Quarter Report → "Cấu hình") = MỌI KH B2B mặc định
  **Strategic**, TRỪ KHI `dim_customer.price_list_name` khớp keyword của tier VIP/Gold/Silver — không cần
  liệt kê tay từng KH mới; Quarter Report/Dashboard/BOD/All-Time/B2B tab/Customers/Staff dùng hệ này (xem
  `buildGroupCaseByCustomerSql` trong `lib/analytics-helpers.ts`, comment ghi rõ "1 ĐỊNH NGHĨA DÙNG
  CHUNG"). 2 danh sách lệch nhau theo thời gian → cùng 1 kênh, Quarter Report nói Strategic, Vendors nói
  Non-Strategic. Fix theo đúng yêu cầu Hiếu: đổi `channelSql` trong `page.tsx` sang hệ (2) — fetch
  `/api/analytics/quarterly-settings` (tierKeywords/excludedCustomers) thay vì `/api/config/partner-tiers`,
  JOIN thêm `dim_customer c ON TRIM(f.customer_code)=TRIM(c.code)`, phân loại business_group PHỤ THUỘC
  `c.price_list_name` NÊN PHẢI tách CTE `classified` (phân loại từng dòng) TRƯỚC rồi mới `GROUP BY
  (channel_name, business_group)` ở outer query (không gộp CASE + GROUP BY 1 bước như bản cũ). **Không**
  áp `excludedCustomers` (KH bị Quarter Report loại khỏi B2B, vd "B2B Ops") — trang này không loại KH nào
  khỏi KPI/Revenue Trend/Products, áp riêng ở Channel Distribution sẽ làm tổng bảng lệch KPI card cùng
  trang. Nhân tiện fix 1 bug latent liên quan: bản cũ `SUM(f.${marginCol})` khi ở chế độ Created
  (`marginCol="0"` literal) sẽ thành `SUM(f.0)` không hợp lệ — đổi sang project cột tường minh
  (`marginExpr = marginCol==="0" ? "0" : "f."+marginCol`) trong CTE, không dùng `f.*`. `strategicPerformance`
  (`/api/analytics/b2b/strategic-performance`, danh sách ĐỐI TÁC named cụ thể để drill-down theo tháng)
  CHƯA đổi — vẫn dùng hệ (1), ngoài scope lần này; phần "Other {channel}" residual trong bảng vẫn đúng vì
  chỉ trừ đúng số claimed bởi named partner khỏi tổng channel (không phụ thuộc 2 hệ khớp nhau).
- **s195+9 (2026-09-08) — fix bug thật: bảng Channel Distribution trống do lỗi GROUP BY.** Hiếu báo tiếp
  "bảng Channel Distribution không có dữ liệu" (sau khi đã fix vendor mặc định ở s195+8). `channelSql`
  trong `fetchData()` (`page.tsx`) SELECT `${bizGroupSQL} as business_group` (CASE dùng `s.group_name`) —
  nhưng `GROUP BY` chỉ có `s.channel_name`, KHÔNG có `s.group_name` → Postgres strict lỗi "column
  dim_order_source.group_name must appear in the GROUP BY clause". Query fail (400) nhưng chỉ
  `console.error`, không có banner lỗi cho riêng bảng này → `channelDistribution` không set, đứng yên `[]`
  → bảng trống trông như "không có dữ liệu"; đồng thời `throw` này chặn luôn phần xử lý sau nó trong cùng
  hàm (không ảnh hưởng KPI/Trend/Products vì đã set state trước đó). Fix: thêm `s.group_name` vào
  `GROUP BY`. Không đổi logic phân loại B2B-Strategic/Non-Strategic/B2C nào khác.
- **s195+8 (2026-09-08) — fix bug thật: trang hiện toàn số 0 do auto-chọn sai vendor mặc định.** Hiếu báo
  tab Vendors "không hiện số liệu". `fetchVendors()` (`page.tsx`) tự chọn vendor mặc định bằng
  `list.includes("3HKDATAPOOL")` (KHÔNG dấu cách) — nhưng DB lưu `'3HK DATAPOOL'` (CÓ dấu cách, xem gotcha
  dưới) nên KHÔNG BAO GIỜ khớp, luôn rơi về `list[0]` (vendor đầu bảng chữ cái — thường vendor nhỏ/ít bán
  trong kỳ mặc định) → mọi KPI/chart hiện 0, trông như "lỗi". Bug có từ commit port gốc (`9c2dbca1`), không
  phải regression của đợt UI redesign gần đây. Fix: so khớp bỏ dấu cách + hoa/thường
  (`v.replace(/\s+/g,"").toUpperCase()==="3HKDATAPOOL"`), fallback `list[0]` chỉ khi thật sự không có
  3HKDATAPOOL. Không đổi logic query nào khác.
- **s194+10 (2026-09-06)**: UI redesign — hero "Month-End Projection" banner gradient `blue-600/700`→
  `brand-600/700`; 5 KPI card viết tay đổi sang `StatTile`; chart Revenue Trend đổi sang `CHART_PALETTE`/
  `CHART_GRID_COLOR`/`chartTooltipStyle`; `blue-*`→`brand-*` toàn trang (giữ indigo/purple/amber phân biệt
  Orders/Units Sold/Gross Margin, đúng tiền lệ Channels). Không đổi logic/data.
- **Vendor 3HK** lưu `'3HK DATAPOOL'` (có dấu cách) → lọc `REPLACE(UPPER(vendor),' ','')='3HKDATAPOOL'`.
- Created mode → margin = 0.
- Đây là hiệu suất **bán ra theo vendor** (không phải giá vốn/COGS catalog — cái đó ở SP Hệ Thống).

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Revenue | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(...)` GROUP BY vendor |
| GP (Margin) | `fact_fulfillment_revenue.gross_profit_vnd` | `SUM(gross_profit_vnd)` per vendor |
| Units | `fact_fulfillment_revenue.fulfilled_quantity` | `SUM(fulfilled_quantity)` |
| Orders | `fact_fulfillment_revenue.order_code` | `COUNT(DISTINCT order_code)` per vendor |
| Vendor | `dim_sku.vendor` | JOIN `f.sku = dim_sku.sku`; vd `'3HK DATAPOOL'`, `'WorldMove'` |
| Channel Group | `dim_order_source.group_name` | JOIN `f.order_source_code = dim_order_source.code`; B2B / B2C filter |

## s219 (2026-10-01) — Bảng "Channel Distribution" làm lại thành "Phân bổ theo Khách hàng / Kênh" + bấm dòng lọc SKU

Hiếu: bảng cũ hiện sai; muốn xem theo khách hàng, bấm vào khách/kênh nào thì bảng SKU lọc ra SKU vendor bán cho khách/kênh đó. **Lỗi bảng cũ (đo thật trên staging, vendor 3HK DATAPOOL T9)**:
(1) toàn dòng "Other Momo / Other Shopeepay…" vì danh sách đối tác Strategic (`strategic-performance`, nguồn `partner_tiers`) RỖNG → phần "claimed" = 0, mọi kênh Strategic thành "Other X"; (2) 1 kênh tách đôi theo tier KH (vd VN-Wholesales vừa ở Strategic vừa ở Non-Strategic) nên cột "Total Revenue (All Vendors)" (tổng kênh) bị **cộng trùng** ở GRAND TOTAL (7.459 tỷ ≠ thực); (3) chỉ có kênh, không có khách hàng; (4) dựng bảng ở client bằng 2 request nối tiếp (`quarterly-settings` rồi `strategic-performance`) + 2 SQL quét fact.
- **API mới** `GET /api/analytics/vendors/distribution?startDate&endDate&dateColumn&view=customer|channel&vendors=…&channel&channelGroup&prevStart&prevEnd` (`api/analytics/vendors/distribution/route.ts`) — **1 lần quét** fact cho cả kỳ này + kỳ so sánh, mỗi dòng kèm `total_revenue` (mọi vendor của đơn vị đó → %Contrib). Bộ lọc nền = đúng các thẻ KPI cùng trang (loại phí ship + INTERNAL-TRANSACTION, KHÔNG loại KH ops) nên tổng khớp thẻ. Phân loại Strategic/Non-Strategic dùng `buildGroupCaseByCustomerSql` (tier theo `price_list_name`, canonical như Quarter Report) — hết phụ thuộc `partner_tiers`.
- **Logic thuần** `lib/vendor-distribution.ts` (test `__tests__/vendor-distribution.test.ts`): xem **Khách hàng** = B2B gộp theo **Organization** (`dim_customer.organization`, fallback mã KH; Organization có mã ở cả 2 nhóm → xếp vào nhóm có doanh thu vendor lớn nhất, giống Quarter Report), **B2C theo kênh** (B2C chỉ có 3 mã KH dùng chung, không có "khách" thật). Xem **Kênh** = mỗi kênh 1 dòng trong B2B/B2C (không tách Strategic ⇒ không đếm trùng). Số liệu B2C của 1 kênh chỉ tính phần `group_name='B2C'`.
- **Bấm dòng → lọc SKU**: state `focus` ở `page.tsx`; `focusSql()` thêm điều kiện vào SQL SKU (khách hàng: mã KH thuộc Organization đó; kênh: `channel_name` + `group_name` khớp số của dòng). Chỉ tải lại bảng SKU (không chạy lại cả trang) rồi cuộn xuống; chip "Khách hàng/Kênh: X ✕" ở bảng SKU và thanh "Đang lọc" ở bảng phân bổ để bỏ lọc. Đổi Khách hàng⇄Kênh chỉ tải lại bảng phân bổ. `focus` được giữ khi bấm Apply Filters.
- **UI** (`vendors-distribution.tsx`): nhóm B2B·Strategic / B2B·Non-Strategic / B2C, mỗi nhóm top 15 + "Xem thêm", ô tìm kiếm (tên KH/kênh), cột Kênh bán (chip), Mã KH, Orders, Units, Revenue, Dự phóng, Tổng DT (mọi vendor), %Contrib, %MoM (khi bật so sánh), "% vendor" (thanh tỷ trọng trong tổng vendor), dòng tổng từng nhóm + TỔNG, Export Excel.
- **Tối ưu trang**: bỏ 2 request nối tiếp + 2 SQL quét fact ở client (chuyển server 1 quét); bỏ query "tổng mọi vendor" không ai dùng; `Promise.all` gộp luôn SKU + phân bổ. Sửa nút **Reset** (trước set cứng 2026-03-01→03-31, nay về kỳ mặc định + reset Channel Group). Lỗi tải hiện banner "Hiếu đang fix" thay vì im lặng (trước chỉ `console.error`).
- Không đổi: thẻ KPI, Revenue Trend, route `strategic-performance` (vẫn dùng ở B2B/BOD/Dashboard). Gotcha: bảng SKU giờ có alias `f` (`FROM … f`) để `focusSql` dùng `f.customer_code`.
- **s219(b)**: 2 Organization cùng tên khác nước (VN_Org SHOPEEPAY / US_Org SHOPEEPAY) sau khi bỏ tiền tố trông trùng → gắn hậu tố "(VN)"/"(US)" chỉ khi trùng tên (`buildDistribution`). QA sống staging: tổng bảng = thẻ KPI (4.236.413.305 / 19.348 đơn / 28.120 units); SHOPEEPAY 4 mã → 476 SKU, 524.729.638 khớp SQL độc lập; kênh VN-Web eSIM → 284 SKU, 287.108.440 khớp; tổng B2B chế độ Kênh = 3.394.689.800 khớp bảng cũ. Chưa xem UI: so sánh kỳ trước (%MoM), Export Excel.
