---
title: "B2C Performance (Hiệu Suất Bán Lẻ B2C)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, b2c]
created: 2026-06-28
updated: 2026-08-20
status: active
---

# B2C Performance (Hiệu Suất Bán Lẻ B2C)

> ⚠️ **s195+19 (2026-09-11) — audit sâu subtab Performance: 2 bug thật, đã fix + verify SQL.**
> 1. **🔴 "Tổng cộng"/CSV câm lặng thiếu doanh thu khi groupBy=SKU (hoặc destination range dài)** —
>    `api/analytics/b2c/performance/route.ts` cắt cứng top 50 dòng THEO DOANH THU trước khi trả về, và
>    FE (`b2c-performance.tsx`) SUM thẳng từ mảng đã cắt cho "Tổng cộng" + xuất CSV — không có cảnh báo
>    nào. Verify SQL trên `fact_fulfillment_revenue` (B2C, tháng 8/2026): 1.047 SKU phát sinh thật, top-50
>    chỉ chiếm 743,8tr / tổng thật 1.872tr → **thiếu 60,27% doanh thu**. groupBy=channel(11)/vendor(15)
>    an toàn; groupBy=destination sát ngưỡng (44 nước/nhóm chỉ trong 1 tháng — range dài hơn dễ tràn).
>    Fix: route đổi shape trả về `{rows, total, totalGroups}` — `total` tính từ TOÀN BỘ nhóm (không cap)
>    TRƯỚC khi cắt còn `MAX_DETAIL_ROWS=1000` cho bảng/CSV hiển thị; FE dùng `total` cho "Tổng cộng" thay
>    vì tự SUM `rows`, thêm dòng cảnh báo "Đang hiện N/M dòng..." khi bị cắt. Bump cache key `v3`→`v4`
>    (đổi shape response).
> 2. **🟡 CM1 card đầu trang và bảng breakdown dùng 2 cách khớp chi phí kênh khác nhau (latent, chưa có
>    số liệu sai thật vì hiện chỉ 1 cost B2C "VN-Web SIM" khớp tên chính xác cả 2 cách)** —
>    `b2c/kpis/route.ts` so chuỗi CHÍNH XÁC `c.channel === row.channel`; `b2c/performance/route.ts` (bảng
>    cùng trang) dùng `matchChannelCost()` dùng chung (4 tầng: sub-channel prefix/source_code/exact/không
>    phân biệt hoa-thường — cùng hàm quarterly-report/b2b dùng để sống sót qua đổi tên kênh). Fix: `kpis`
>    đổi sang gọi `matchChannelCost()`, thêm `MIN(f.order_source_code) as source_code` vào query channel
>    breakdown để có tham số tier-2.
>
> 3. **🔴 Bug thật thứ 3 — role không phải admin/creator (vd BOD) KHÔNG BAO GIỜ lưu được "KPI Target
>    B2C"/"B2C Marketing Budget" trong Manage Costs, dù FE hiện ô nhập + nút Lưu ĐANG BẬT.** Hiếu báo
>    "role BOD chỉnh sửa và lưu lại nhưng không được lưu" — test tay bằng acc creator lúc đầu KHÔNG
>    tái hiện được (save 200 OK bình thường), vì creator bypass thẳng qua `baseRoles`. Đọc lại
>    `targets/page.tsx`: `canEdit` (gate DUY NHẤT cho toàn trang, bao gồm 2 section B2C) tính từ
>    `writable_tabs.includes("targets")` — NHƯNG `api/config/b2c-kpi-targets/route.ts` VÀ
>    `api/config/b2c-budget/route.ts` lại đòi quyền ghi tab `"b2c"` (sai key, không khớp FE và không
>    khớp route anh em `api/planning/targets` — route đó đúng, đòi `"targets"`). Verify bằng
>    `GET /api/config/writable-tabs` thật trên staging: **10 user được cấp quyền ghi thêm (toàn bộ Lark
>    OU + Hiếu) — KHÔNG một ai có `"b2c"` trong danh sách, tất cả chỉ có `"targets"`** → xác nhận chắc
>    chắn route cũ 403 câm lặng (FE chỉ hiện "Hiếu đang fix, vui lòng đợi") cho MỌI user ngoài admin/
>    creator, không riêng gì 1 case của Hiếu. Fix: đổi `canWrite(session, "b2c", ...)` →
>    `canWrite(session, "targets", ...)` ở cả 2 route, khớp đúng cổng FE đã dùng.
>
> tsc + lint (0 lỗi mới) + vitest (220/220) PASS cả 3 fix. **Cần Hiếu**: nhờ 1 tài khoản role BOD (đã có
> trong `writable_tabs`, vd tài khoản Lark liên kết) tự thử lưu lại KPI Target B2C/Marketing Budget trên
> staging xác nhận lưu được.

Báo cáo bán lẻ B2C bố cục 5 section (Apple-style, giảm tải nhận thức): doanh thu rolling, khách hàng, CAC/Leads, tỷ lệ chuyển đổi website, và chi phí marketing/ROAS. Tích hợp nhiều nguồn ngoài (Chatwoot, GA4, Turso).

> ⚠️ **s195+15 (2026-09-10) — Fix root cause query timeout tab B2C (Advanced).** Hiếu báo tab B2C bị
> timeout, điều tra bằng cách đọc trực tiếp code (không đoán): `b2c-advanced-dashboard.tsx` set
> `nocache=1` **MỌI lượt load trang** (không chỉ khi bấm refresh) → `api/analytics/b2c/monthly/route.ts`
> chạy `cachedQuery(..., bypass=true)` → bỏ qua đọc cache hoàn toàn, tính lại tươi mỗi lần. Trong khối đó,
> `customerRowsFromDb()`/`customerChannelRowsFromDb()` (phân loại khách New/Returning) có CTE `first_order`
> `MIN(fulfiled_date) GROUP BY customer_code` **không giới hạn ngày dưới** — quét TOÀN BỘ lịch sử
> `fact_fulfillment_revenue` (bảng cộng dồn mỗi ngày, không index được — gohub_dw không có quyền DDL). Cả
> 2 CTE nặng này nằm chung `Promise.all` với 4 query nhẹ khác, đập vào pool `max=3`/`statement_timeout=25s`
> — đúng pattern timeout đã từng gặp ở Daily Report (`NOT IN subquery` + cache cold + nhiều query đồng thời
> → `query_timeout` 25s), nhưng ở đây xảy ra ở **MỌI lượt xem trang** (do bypass cache toàn phần), không
> chỉ 1 lần/ngày lúc cache cold.
>
> **Fix** (`api/analytics/b2c/monthly/route.ts`): tách phần phân loại khách (`customers`/`customerChannels`)
> ra khỏi khối "luôn live" — cho qua `cachedQuery` riêng (`b2c-customer-breakdown:v1:...`) TTL **60 phút**,
> tag `deps: ["b2c-customer"]` — vì cutoff dữ liệu vốn đã T-1, không cần tươi tới mức mỗi lượt xem. Đồng
> thời ưu tiên đọc từ **Admin GoHub API** (`adminGohubCustomerRows`/`adminGohubCustomerChannelRows`, page 1
> summary — nhẹ, cùng nguồn cron snapshot đã dùng) trước khi rơi về CTE nặng; CTE DB giờ chỉ còn là
> fallback thật khi Admin API lỗi/chưa cấu hình (đúng comment ý đồ cũ trong code, trước đây bị bỏ qua vì
> không có nơi nào gọi tới). Bucket cha `vnB2c`/`usB2c` từ Admin API bị lọc bỏ, để reducer tự cộng lại từ
> con (`vnWeb`/`usWeb`/`usApp`) — tránh đếm 2 lần, giữ đúng công thức cũ. Khối revenue (`marketRows`/
> `channelRows`/`marketChannelRows`/`profitRows`) giữ nguyên hành vi "luôn live" theo `nocache=1` (cache
> key bump `v14`→`v15` vì đổi shape trả về, tránh đọc nhầm cache cũ từ Supabase L2). Thêm: `loadCustomerBreakdown()`
> chạy TUẦN TỰ sau khối revenue (không gộp `Promise.all`) — giảm số query đồng thời chạm pool tại 1 thời
> điểm, phòng hờ khi phải rơi về nhánh CTE nặng. Không đổi công thức/số liệu hiển thị, không đổi UI. tsc +
> lint (0 lỗi mới) + vitest (216/216) PASS.
>
> **Chưa merge main** — chờ Hiếu tự QA tab B2C Advanced trên staging (load nhanh hơn, không còn timeout;
> số liệu Customers/New-Returning khớp bản trước).

> ⚠️ **s195+12 (2026-09-09) — fix bug cutoff doanh thu + thêm route GA4 category.** Phát hiện khi so sánh
> với branch song song của Minh (`codex/b2c-dashboard-preview`, PR #2 — branch tách từ commit rất cũ nên
> KHÔNG merge trực tiếp, chỉ port có chọn lọc sau khi audit kỹ, xem `docs/session_summary.txt`). Bug thật
> đã xác nhận bằng cách đọc trực tiếp code (không suy đoán): `loadRevenue()` trong `lib/b2c-report-snapshot.ts`
> (nguồn snapshot mặc định của toàn dashboard) **THIẾU HẲN điều kiện chặn ngày trên** ở cả 4 query — chỉ có
> `>= windowStart`, không có `<=` — nên nếu `fact_fulfillment_revenue` đã có dữ liệu (dù chỉ 1 phần) của
> ngày CHƯA kết thúc thì bị cộng dư vào doanh thu tháng. `elapsedDays` cũng tính qua `new Date().getDate()`
> thô (giờ server UTC), không quy đổi giờ VN. Fix: thêm `lib/analytics-engine/date-math.ts` 2 hàm mới
> `vnToday()`/`getSafeReportDate(daysAgo=1)` (dùng `Intl.DateTimeFormat` timezone Asia/Ho_Chi_Minh, đúng
> bất kể server chạy timezone nào) — dùng LÀM CUTOFF DUY NHẤT xuyên suốt `b2c-report-snapshot.ts` VÀ
> `api/analytics/b2c/monthly/route.ts` (trước đây 2 nơi tính khác nhau: route live có xử lý T-1 khi
> `forceRefresh`, nhưng snapshot generator — nguồn phục vụ mặc định — hoàn toàn không có). Kèm route mới
> `GET /api/analytics/b2c/ga4-categories` (traffic theo `sessionDefaultChannelGroup`, so kỳ trước) — port
> từ Minh nhưng sửa lại `classifySite()` dùng đúng field `GA4Site.kind` (`"web"`/`"app"`, HEAD thêm s194+1
> cho tách property Web/App Firebase) thay vì đoán qua tên/URL như bản gốc (bản gốc không biết `kind`,
> nếu port nguyên sẽ phân loại App site sai). tsc + lint (0 lỗi mới) + vitest (216/216, +4 test mới cho
> `vnToday`/`getSafeReportDate`) PASS. **CHƯA áp dụng UI mới của Minh** (breakdown khách theo kênh,
> Revenue Compare card) — chỉ port đúng phần data-correctness đã verify, phần UI để sau nếu Hiếu muốn.

> ⚠️ **CẬP NHẬT s135 (2026-08-05):**
> - **Bỏ GA4 Conversion Rate Charts** (Section 4) khỏi tab Advanced (giữ GA4 Users KPI card). GA4 chi tiết ở tab Website.
> - **B2C Marketing Budget tách VN/US/Total**: model `app_settings.b2c_budget` đổi `{month:number}` → `{month:{vn,us}}`
>   (backward-compat đọc format cũ = gán hết VN). `b2c/monthly` trả `budgetByMarket{vn,us,total}`. Nhập ở Manage Cost
>   (`/analytics/targets` → B2CMarketingBudgetSection): VN + US riêng, Total tự cộng.
> - **B2C Performance (tab "Performance")**: FE dùng `Promise.allSettled` (trước `Promise.all` → 1 endpoint lỗi làm
>   RỖNG toàn bộ bảng + không export được). Projection dùng `getProjectionFactor` shared (guard cross-month đúng).
> - 🟡 CÒN LẠI (Manage Cost rewrite): toggle 2 chế độ Cost B2C (kênh/group loại trừ lẫn nhau) + dịch nốt tiếng Anh.

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: đo hiệu quả kênh bán lẻ end-to-end — từ lead → khách mới → doanh thu → chi phí marketing → ROAS — để biết tiền marketing đẻ ra bao nhiêu doanh thu.
- **Tại sao 5 section tách biệt**: mỗi câu hỏi kinh doanh (bán được bao nhiêu? khách ở đâu ra? tốn bao nhiêu để có khách? web chốt tốt không? quảng cáo lời không?) là 1 section riêng → dễ đọc.

## 2. Đường dẫn & file
- **Web**: `/analytics/b2c` — `web/src/app/(dashboard)/analytics/b2c/page.tsx` (+ `components/b2c-advanced-dashboard.tsx`, `components/b2c-metric.tsx`)
- **API**: `/api/analytics/b2c/{monthly, kpis, trend, loss-skus, metric}`
- **Subtab "Metric"** (s156, 2026-08-20): xem mục 3b bên dưới.

## 3. Cấu trúc subtab

**3a. Advanced** (default): doanh thu 6 tháng VN/US/Total, khách hàng, CAC/Leads, Website CR, Marketing ROAS.

**3b. Metric** (s156, 2026-08-20) — `components/b2c-metric.tsx` + API `/api/analytics/b2c/metric`:
- Bảng YTD monthly với các metrics + %MoM so tháng liền kề:
  - **Revenue** (Total / Web / App) — từ `fact_fulfillment_revenue` filter `sub_group_name`
  - **Gross Profit** (Total / Web / App) — GP = `gross_profit_vnd` hoặc `revenue - cogs`
  - **CM1** (Total) — GP total - OpCost (channel_costs + group_costs pro-rata tháng hiện tại)
  - **% CM1** = CM1 / Revenue total
  - **Orders** (Total / Web / App) — `COUNT(DISTINCT order_code)`
  - **AOV** (Total / Web / App) = Revenue / Orders
  - **Traffic** (Total / Web / App) — GA4 `sessions` theo `yearMonth` dimension
  - **User** (Total / Web / App) — GA4 `activeUsers` theo `yearMonth`
  - **Customer** (Web: New/Returning; App: New/Returning) — `customer_code` đầu tiên = New
- Web traffic: GA4 filter `hostName` (mặc định). App traffic: GA4 filter `platform IN (ios, android)`.
- Tháng hiện tại (MTD) header hiển thị "(1-N)" chỉ số ngày đã qua.

**3c. Performance**: intel-main style channel breakdown.

## 3. Cấu trúc 5 section (Advanced)
- **S1 Revenue Rolling**: doanh thu 6 tháng VN/US/Total + tiến độ MTD/MoM/Prorata so KPI.
- **S2 Customers**: khách mới (New) vs quay lại (Returning), có MoM.
- **S3 CAC & Leads**: leads từ Chatwoot → so đơn thực tế (conversion).
- **S4 Website CR**: tỷ lệ mua trên web từ GA4.
- **S5 Marketing Cost & ROAS**: ngân sách vs chi phí thực + ROAS + spend pace.

## 4. Công thức nghiệp vụ
$$\text{CAC} = \frac{\text{Chi phí Marketing thực tế}}{\text{Số khách hàng mới}} \qquad \text{ROAS} = \frac{\text{Doanh thu B2C}}{\text{Chi phí Marketing thực tế}}$$
$$\text{Spend Pace} = \frac{\text{Chi phí thực tế}}{\text{Ngân sách Marketing B2C}} \times 100\% \qquad \text{CR} = \frac{\text{Khách mua thực tế}}{\text{Tổng Leads}} \times 100\%$$

## 5. Nguồn dữ liệu chi tiết (lấy gì, từ đâu, tại sao)
- **Doanh thu/Profit**: analytics DB (`fact_fulfillment_revenue`, `dim_order_source`), lọc B2C. `Revenue`, `COGS`, `Gross Profit`, `Margin %`, `CM1`, `CM1%` lấy theo kênh thật.
- **Customers**: Admin GoHub Internal API `/v1/internal/customers/revenue`, lấy `summary.byUserType` page 1 để có New/Returning mà không quét nhiều page.
- **Leads**: ưu tiên **Turso chat center**, fallback **Omni**, fallback **Chatwoot**. Lead tính theo nguồn B2C: Live Chat, WhatsApp, Zalo, Facebook/Messenger, Instagram. Lead được tính khi trạng thái thuộc nhóm New Lead, Sales Consulting, Waiting Payment, Need Sales Follow-up, Purchased; không tính No Need, Handover To CS, Internal Checking, Order Issue, Resolved, Troubleshoot. **Lưu ý**: Zalo cá nhân chưa tracking nên lead hiện tại có thể thấp hơn thực tế.
- **Website CR**: **GA4** — config 2 property lưu `app_config['ga4_configs']` (Turso, đã copy sang Supabase).
- **Marketing Spend**: `analytics_channel_group_costs`, có `manualSpendOverrides` tạm thời cho tháng 5-7/2026 trong preview.
- **Budget**: lấy từ Manage Costs → B2C Channels (`analytics_channel_costs`), nhưng card Budget đã bỏ khỏi snapshot KPI strip.

## 6. Vấn đề đã gặp & cách khắc phục
- **UI s194+3 (2026-09-06) — thêm màu thật (Hiếu phản hồi bản đồng bộ-màu-lệch vẫn đơn điệu)**: bảng màu
  "kênh" ở hero card (VN=`#0071e3`, US=`#6366f1`, Web=`#00a6a6`, App=`#2f9d55`, Khác=`#b7791f`) nay dùng lại
  xuyên suốt — `KpiCard`/`Section` (`b2c-advanced-dashboard.tsx`) có `icon`/`accent` prop khai từ trước
  nhưng CHƯA TỪNG render (dead code) → nay render thật: icon chip màu + viền trái màu (KpiCard theo ý nghĩa
  funnel), icon chip mỗi Section 1 màu riêng (trước tất cả cùng xanh dương). Helper `marketDot(label)` thêm
  chấm màu trước tên dòng VN/US/Web/App/New/Returning trong `RollingTable`/`SimpleRollTable`/
  `AcquisitionTable` — match CHÍNH XÁC token đầu nhãn (không lẫn "VN-Web eSIM"/"Mobile-App" là tên sản
  phẩm). `b2c-metric.tsx`: thêm dải 6 `StatTile` tháng hiện tại (Revenue/GP/CM1/Orders/Traffic/User), header
  bảng đổi gradient brand, biến `isBlue` (dead code) nay tô nền+chữ brand cho dòng nhóm chỉ số, dot Web/App
  khớp đúng màu Advanced. Không đổi số liệu/logic/API.
- **UI s194 (2026-09-06) — đồng bộ màu, không đổi bố cục**: `b2c-advanced-dashboard.tsx` (sub-tab Advanced,
  "y chang mockup" đã duyệt — `Section` Apple-glass card + `KpiCard` + `RollingTable` giữ nguyên) có 15 chỗ
  bảng/banner lỡ dùng Tailwind `blue-*` mặc định thay vì đúng accent `#0071e3` của trang → đồng bộ lại. Đã
  audit trước khi sửa: layout/component ĐÃ nhất quán (Section wrapper dùng mọi nơi), không cần rearrange gì
  thêm. `b2c-metric.tsx`: `bg-blue-50/30`→`bg-brand-50/30`, ghi chú công thức chuyển sang `LogicNote` dùng
  chung. Không đổi component/API/công thức. GA4 App property riêng (465150028) đã connect xong cùng session
  — Traffic/User cột App trong bảng Metric giờ có số thật (trước đó luôn 0 do property sai, xem
  [[analytics-website]] mục "s194").
- **Op-cost percent nhân dư `* ratio` (B2C-1, 2026-08-02)**: `b2c/kpis` tính channel op-cost kiểu `percent` từng nhân thêm `ratio` (số-ngày-trong-kỳ/số-ngày-tháng) → sai khi range LẺ tháng (vd nửa tháng). percent phải áp thẳng trên revenue của kỳ (`rev` đã là doanh thu range) — bỏ `* ratio`, nhất quán `bod-data.ts`. Vô hại ở view nguyên tháng (ratio=1). amount vẫn × ratio (pro-rata đúng).
- **Spend/leads thiếu nguồn (S67-70)**: GA4 2 property + leads ở omni riêng → thiết kế đọc đa nguồn (Chatwoot/GA4/Turso) thay vì chỉ gohub_dw.
- **Không cache (S81)**: `b2c/{kpis,performance,trend,loss-skus}` trước gọi thẳng DB → chậm. Fix: `cachedQuery` 12h.
- **Đổi term CM1 (S74)**: label margin đổi GP2→CM1, giữ key `gpm2`.
- **Cấu hình đặt sai chỗ (S82)**: "KPI Target B2C" + "Ngân sách Marketing B2C" trước nằm trong Admin → chuyển về KPI/Target cho đúng ngữ cảnh.

## 7. Phân quyền
- Xem: **Admin, Creator, Manager, BOD, Staff**.
- **Ẩn methodology + nút sửa ngân sách**: chỉ **Admin/Creator** (sửa giá trị thực hiện ở KPI/Target).
- **Nút "Manage Costs"** (CostManagementModal trong `b2c-performance.tsx`): TẠM THỜI chỉ **creator** thấy (`dbRole === "creator"` qua `useDbRole()`). Muốn mở lại cho admin → sửa điều kiện trong component.

---

## 8. B2C Report Preview — luồng cần giữ khi đưa lên Git

> Note ngày 2026-07-15: bản preview local đang ở `/b2c-report-preview`, component chính `web/src/components/b2c-advanced-dashboard.tsx`, API chính `web/src/app/api/analytics/b2c/monthly/route.ts`.

### Nguyên tắc vận hành production
- Dashboard dùng cho nhiều người nên **không gọi live toàn bộ nguồn mỗi lần mở trang**.
- Luồng đúng là: cron chạy hằng ngày lúc **00:00 UTC+7** → kéo dữ liệu từ các nguồn → ghi snapshot/cache có `refreshed_at` → dashboard chỉ đọc snapshot/cache.
- `vercel.json` đã có cron `0 17 * * *` tương ứng 00:00 UTC+7.
- Route cron đã có: `/api/cron/refresh-b2c-report`.
- Trước khi deploy cần sửa lỗi snapshot hiện tại: log local đang báo `Invalid API key`, cần kiểm tra `SUPABASE_SERVICE_KEY` và chạy migration `web/db/migrations/v17_b2c_report_monthly_snapshots.sql`.

### Nguồn dữ liệu chuẩn theo metric
- **Revenue B2C / channel breakdown**: analytics DB hiện tại (`fact_fulfillment_revenue`, `dim_order_source`), lọc B2C.
- **Revenue & Gross Profit Trend**: analytics DB, theo source channel thật. Công thức: `Gross Profit = Revenue - COGS`, `Margin % = Gross Profit / Revenue`, `CM1 = Gross Profit - Operation Cost`, `CM1% = CM1 / Revenue`.
- **Customer Total/New/Returning**: Admin GoHub Internal API `/v1/internal/customers/revenue`, lấy **summary page 1** và `summary.byUserType` để tránh load nặng. Không scan item-level live.
- **Lead**: ưu tiên Turso chat center, fallback Omni, fallback Chatwoot.
- **Spend/Budget**: spend từ `analytics_channel_group_costs` + override tạm preview; budget từ `analytics_channel_costs`/Manage Costs B2C Channels.
- **GA4**: đọc config qua `/api/config/ga4`, dùng cho website conversion chart.

### Customer New/Returning — quyết định kỹ thuật
- Admin API trả summary nhanh:
  - `summary.customerCount`
  - `summary.totalOrders`
  - `summary.byCurrency[]`
  - `summary.byUserType.new`
  - `summary.byUserType.returning`
- Dashboard dùng `summary.byUserType` để tính New/Returning count và revenue; không quét từng page vì tháng 7/2026 có hơn 270 pages.
- Lưu ý reconciliation: revenue từ Admin API là `SUM(finalAmount)` theo `Order.createdAt`; revenue top/dashboard là `fulfilled_revenue_amount_vnd` theo `fulfilled_date`, nên có thể lệch. Nếu cần doanh thu customer khớp top revenue thì phải dùng analytics DB cho revenue và Admin chỉ dùng count.

### Lead / Zalo
- Lead được tính theo trạng thái:
  - Tính: `New Lead`, `New Lead EC`, `Sales Consulting`, `Waiting Payment`, `Need Sales Follow-up`, `Purchased`
  - Không tính: `No Need`, `Handover To CS`, `Internal Checking`, `Order Issue`, `Resolved`, `Troubleshoot`
- Turso chat center hiện đọc trực tiếp từ `messages`, `identities`, `conversation_statuses`, `channels`, `channel_groups`.
- Omni có `channel_groups` gồm `Zalo`, nhưng `/api/conversations` cần `OMNI_API_TOKEN`; `OMNI_WEBHOOK_SECRET` chỉ dùng verify webhook, không đọc history conversations.

### Spend tạm hardcode cần gỡ trước khi merge
Trong `web/src/app/api/analytics/b2c/monthly/route.ts` đang có `manualSpendOverrides` để preview CPL:
- `2026-05`: `86,633,334 + 20,099,340 + 26,188,452 = 132,921,126`
- `2026-06`: `93,239,567 + 2,989,734 = 96,229,301`
- `2026-07`: `128,000,000`

Trước khi đưa lên Git/prod, nên nhập các số này vào nguồn thật (`analytics_channel_group_costs`/Cost Management) rồi xóa override.

### Công thức quan trọng đã chốt
- **MTD compare**: so current MTD với cùng số ngày của tháng trước.
- **Quarter prorata**: QTD chia số ngày đã trôi qua trong quý, nhân tổng ngày của đủ 3 tháng trong quý. Ví dụ Q3 = tháng 7+8+9, không chỉ lấy tháng 7.
- **CPL**: `Spend ÷ Leads`.
- **CAC / khách**: `Spend ÷ Khách mới`. KPI card và Acquisition table dùng cùng công thức total spend / total new customer.
- **Tỷ lệ chốt**: `Customer ÷ Leads`.
- **KPI cards hiện tại**: `Users`, `ROAS`, `Customers`, `CAC`, `Leads`, `CPL`; đã bỏ card Budget.
- **(s131) Cost fresh**: chi phí nhập ở tab **Manage Costs** (`/analytics/targets` → nút "Chi phí B2C") → lưu vào `analytics_channel_costs`/`analytics_channel_group_costs` (POST đã flush cache). B2C Performance nay LUÔN fetch `nocache=1` (fetchData default fresh=true) → phản ánh ngay. Advanced đã luôn nocache.
- **(s131) Customers × thị trường (Performance view)**: bảng groupBy=customer thêm cột **VN + US** (Revenue = All). API `b2c/performance` group thêm `company_code` → `revenueVn`/`revenueUs` mỗi KH (All = tổng, gồm cả NA/TN).
- **(s131) Chi phí MKT map thiếu (Advanced)**: `spend` (Chi phí MKT/Spend/ROAS/CAC/CPL) trước CHỈ tính group cost (`analytics_channel_group_costs`), KHÔNG tính chi phí KÊNH (Ads/Platform/Sponsor/Media amount) → cost nhập theo kênh ở Manage Cost KHÔNG hiện. **Fix**: `spend` hiển thị = group + channel (`getB2CChannelBudgetByMonth`); CM1 vẫn phân bổ chỉ groupSpend (kênh đã ở opCost, tránh đếm 2 lần). Verify T7: +21,9tr chi phí kênh.
- **(s131) Doanh thu theo Customers (Advanced)**: tách New/Returning **× All/VN/US** = doanh thu × tỷ trọng thị trường kỳ (`mktRatio`), nhất quán xấp xỉ `newVnOf`.

### Env vars cần set cho deploy
- `ADMIN_GOHUB_API_BASE_URL`
- `ADMIN_GOHUB_API_KEY`
- `ADMIN_GOHUB_API_SECRET`
- `ADMIN_GOHUB_USD_TO_VND` — *chỉ là FALLBACK*; tỷ giá USD→VND giờ đọc từ **DB** `app_settings.fx.usd_vnd` (s93).
- `TURSO_LEADS_URL` — Turso **chat-center** (nguồn leads), cặp env RIÊNG, tách khỏi `TURSO_URL` (intel/country_codes). ⚠️ ĐỪNG dùng chung `TURSO_URL` — sẽ query nhầm DB (s91).
- `TURSO_LEADS_AUTH_TOKEN`
- `CHATWOOT_BASE_URL`
- `CHATWOOT_ACCOUNT_ID`
- `CHATWOOT_API_TOKEN`
- `OMNI_API_BASE_URL`
- `OMNI_API_TOKEN` (optional fallback nếu dùng Omni)
- `OMNI_WEBHOOK_SECRET` (chỉ verify webhook, không dùng để đọc history)
- `CRON_SECRET` (nên set trên Vercel để bảo vệ cron)
- `SUPABASE_SERVICE_KEY` phải là service role key hợp lệ để snapshot/cache đọc ghi được.

### Cập nhật s91–93 (ecom, tỷ giá, UX)
- **Tỷ giá USD→VND** đọc từ DB `app_settings.fx.usd_vnd` (fallback env) — `lib/admin-gohub.ts getUsdToVndRate()`.
- **Leads Turso** dùng cặp env RIÊNG `TURSO_LEADS_URL/TURSO_LEADS_AUTH_TOKEN` (DB chat-center), tách khỏi `TURSO_URL` (intel `country_codes`) — nếu không sẽ query nhầm DB → lỗi.
- **KHÔNG có ecom/VN-Ecom trong B2C**:
  - Dữ liệu revenue/profit vốn đã lọc `group_name='B2C'` (VN-Ecom = B2B).
  - **Revenue & Gross Profit Trend**: nhánh gộp chi phí kênh (`analytics_channel_costs`) trước KHÔNG lọc kênh → chi phí kênh B2B/ecom tạo dòng `opCost>0` lọt vào. Fix: `.in("channel", B2C_CHANNELS)` cho cả route live `b2c/monthly` + snapshot builder (`lib/b2c-report-snapshot.ts`). `B2C_CHANNELS` export từ `lib/b2c-channel-budget.ts`.
  - **Cost Management modal** mở từ view Main truyền `scope="b2c"` → chỉ hiện tab "B2C Channels" (ẩn tab B2B/Group có VN-Ecom).
- **UX**: dropdown "Chọn tháng" ở Revenue & GP Trend làm nổi bật (viền/nền xanh, bold).

### Checklist trước khi merge/deploy
- [ ] Chạy migration snapshot `web/db/migrations/v17_b2c_report_monthly_snapshots.sql`.
- [ ] Đảm bảo cron `/api/cron/refresh-b2c-report` chạy được 00:00 UTC+7.
- [ ] Gỡ `manualSpendOverrides` sau khi nhập spend thật.
- [ ] Kiểm tra Turso lead token hoặc fallback Omni/Chatwoot.
- [ ] Kiểm tra Customer New/Returning bằng `summary.byUserType`.
- [ ] Kiểm tra local build `npm run build`.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Revenue B2C | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(...)` WHERE `group_name='B2C'` |
| GP (Gross Profit) | `fact_fulfillment_revenue.gross_profit_vnd` | `SUM(gross_profit_vnd)` = Revenue − COGS |
| CM1 | GP − Operation Cost | GP − `analytics_channel_group_costs.amount` (B2C group) |
| CM1% | CM1 / Revenue × 100 | Tính từ 2 cột trên |
| Marketing Spend | `analytics_channel_group_costs` | `SUM(amount)` WHERE `group_name='B2C'` theo tháng |
| Budget Marketing | `analytics_channel_costs` | `SUM(amount)` các kênh B2C từ Manage Costs |
| Customers New/Returning | Admin GoHub Internal API `/v1/internal/customers/revenue` | `summary.byUserType.new` / `.returning` |
| Leads | Turso chat-center (primary) → Omni → Chatwoot | Các trạng thái: New Lead, Sales Consulting, Waiting Payment… |
| Website CR | Google Analytics 4 | 2 property: config `app_config['ga4_configs']` (Supabase `app_settings`) |
| ROAS | Revenue B2C / Marketing Spend | Tính từ 2 cột trên |
| CAC | Marketing Spend / New Customers | Tính từ 2 cột trên |


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


### Revenue cutoff reconciliation — 2026-09-07

The monthly endpoint and revenue snapshot queries must bound fulfillment dates through the last completed day in Asia/Ho_Chi_Minh, including customer and profit breakdowns. Cache keys include the cutoff; snapshots without matching `payload.revenueAsOf` fall back to the bounded warehouse queries.

Verified against Analytics DB: September 1–6 B2C revenue is VND 284,852,800.82 (VN 258,485,490.02; US 26,367,310.80). The former unbounded query included September 7 revenue of VND 24,126,445.36, producing VND 308,979,246.18. Correct September prorata is VND 1,424,264,004.10. The local endpoint returns the corrected total with `dataAsOf=2026-09-06`; TypeScript and five UTC/Vietnam date boundary tests pass.
