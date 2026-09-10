# CLAUDE.md — GoHub Intel · START HERE

> File này auto-load mỗi session. Đọc hết trước khi làm bất cứ thứ gì.
> Lịch sử chi tiết từng session nằm ở `docs/session_summary.txt` (đọc từ cuối lên) — file này CHỈ giữ
> trạng thái hiện tại + rule + checklist việc còn phải làm, không giữ narrative cũ (rút gọn s189 2026-09-05).

---

## Trạng thái hiện tại (2026-09-10, s195+18)

| | |
|---|---|
| ⏳ **s195+18 (2026-09-10) — Stream token THẬT cho Bé Gấu + Gấu Pro (fix gốc), chờ Hiếu QA** | Làm nốt mục
  "chưa làm" nêu ở s195+17. Trước đây cả 2 agent await xong TOÀN BỘ vòng tool-call mới trả 1 cục text —
  màn hình trắng suốt lúc chờ (root cause s195+14, lúc đó chỉ vá bằng nâng maxDuration). Đổi cả 2 agent
  dùng `model.generateContentStream()` (SDK đã hỗ trợ sẵn) thay `generateContent()` ở MỌI vòng gọi model —
  helper dùng chung `genWithRetryStream()` tách file mới `lib/agents/gemini-stream.ts` (tránh lặp code y
  hệt s195+17 vừa fix). Bé Gấu: FE `chatbot/page.tsx` KHÔNG cần sửa (code đọc stream sẵn đã đúng). Gấu Pro:
  thêm event `delta` vào `GPEvent`, FE `analytics/creator/ai/page.tsx` thêm bubble placeholder + nối dần
  theo delta (trước chỉ update UI 1 lần dù đã có SSE), lỗi giữa chừng giờ nối thêm vào phần đã stream thay
  vì xoá trắng. Mock Gemini SDK trong test (`be-gau.test.ts`/`be-gau-runner.test.ts`) cập nhật thêm
  `generateContentStream` (delegate qua `generateContent` mock cũ, giữ nguyên mọi chuỗi test có sẵn). tsc +
  lint (0 lỗi mới) + vitest (216/216) PASS. Wiki `docs/wiki/system/chatbot-agents-guardian.md` đã cập nhật.
  **Cần Hiếu**: QA cả 2 agent trên staging — chữ chạy dần thay vì bung 1 cục, không lặp/mất nội dung,
  sources/export marker vẫn đúng.
| ⏳ **s195+17 (2026-09-10) — Đổi model TOÀN BỘ AI Intel sang gemini-3.8-flash + đánh giá/nâng cấp Gấu Pro, chờ Hiếu QA** | Mở rộng s195+16 (khi đó chỉ đổi Bé Gấu) sang toàn bộ 17 file dùng Gemini (pipeline
  cũ bi-analyst/data-explorer/orchestrator/classifier/answer, Gấu Pro `creator-ai.ts`, mrp.ts, okr-lark-
  classify.ts — giữ nguyên safety net `maxOutputTokens=4000` cũ, web-search.ts, weekly-report/narrative.ts,
  portal.ts, creator/compress.ts, usage-stats classify/evaluate, Tổ Gấu AI, config/schema/ai-suggest — đổi
  field cũ `thinkingBudget:0`→`thinkingLevel:"minimal"` đúng chuẩn 3.8-flash). `creator-ai.ts` (model chính
  Gấu Pro) thêm `thinkingConfig.thinkingLevel:"low"` như đã làm cho Bé Gấu. **Đánh giá Gấu Pro** (đọc trực
  tiếp `creator-ai.ts` 754 dòng + route + dispatch.ts): ưu — SSE thật với status real-time mỗi tool call
  (UX hơn Bé Gấu), 20+ tool, system prompt cá nhân hoá sâu, maxDuration=300 đúng từ đầu. **3 bug/dead-code
  thật phát hiện, đã fix ngay**: (1) `api/creator-ai/chat/route.ts` có `compressHistory`/`stripBase64Images`
  COPY Y HỆT `creator/compress.ts` (không dùng chung dù be-gau.ts đã làm đúng) — xoá bản trùng, import từ
  module chung. (2) `combineFileContexts` trong route — dead code, không ai gọi — xoá. (3) Vòng lặp
  tool-call (cả Gấu Pro lẫn Bé Gấu) — `Promise.all` không bọc try/catch riêng từng tool → 1 tool lỗi sập
  CẢ round, mất trắng câu trả lời dù tool khác đã xong — đã bọc try/catch riêng từng tool ở cả 2 agent.
  **Chưa làm (đề xuất, kiến trúc lớn hơn, cần bàn thêm)**: text trả lời cuối vẫn "await hết rồi enqueue 1
  lần" ở cả 2 agent (chỉ status event là real-time, nội dung câu trả lời thật không stream token). tsc +
  lint (0 lỗi mới) + vitest (216/216) PASS. Wiki `docs/wiki/system/chatbot-agents-guardian.md` đã cập nhật.
  **Cần Hiếu**: QA cả Bé Gấu lẫn Gấu Pro trên staging (1 câu BI nhiều bước mỗi bên), theo dõi Gemini cost.
| ⏳ **s195+16 (2026-09-10) — Bé Gấu: đánh giá toàn diện + đổi model gemini-3.6-flash → gemini-3.8-flash, chờ Hiếu QA** | Hiếu yêu cầu đánh giá ưu/nhược Bé Gấu +
  hướng nâng cấp + đổi model. Ưu điểm: 1 agent function-calling gọn (thay 7-agent pipeline cũ), tool-set
  rộng phân quyền tách bạch (`GP_TOOLS_OPEN`/`GP_TOOLS_ADMIN_ONLY`), `execSQL` tự cảnh báo auto-retry/row-
  multiplication/3HK rule. Nhược điểm: fake streaming (`api/chat/route.ts` await xong hết mới enqueue 1
  lần — mới vá triệu chứng bằng maxDuration s195+14, chưa fix gốc), vòng lặp tool-call không có cap thời
  gian giữa chừng. Trước khi đổi model: verify qua WebSearch (không đoán) — `gemini-3.8-flash` có thật/GA
  nhưng **mặc định thinking=medium nếu không set** (billable, latency ẩn) — đúng lớp rủi ro repo từng dính
  (gemini-3.5-flash cần `thinkingBudget=0`; gemini-2.0-flash khai tử im lặng 6 ngày s194+7). Fix: set tường
  minh `thinkingConfig.thinkingLevel` = `"low"` (model chính) / `"minimal"` (learning-detect JSON 1-shot),
  `as any` vì SDK v0.21.0 pin cứng chưa có type field này. **CHỈ đổi `be-gau.ts`** — Gấu Pro/pipeline cũ/Tổ
  Gấu AI vẫn `gemini-3.6-flash`, ngoài scope. tsc + lint (0 lỗi mới) + vitest (216/216) PASS. Wiki
  `docs/wiki/system/chatbot-agents-guardian.md` đã cập nhật. **Cần Hiếu**: QA 1 câu BI phức tạp trên
  staging (đúng/không chậm/không lỗi JSON), theo dõi Gemini API cost vài ngày đầu.
| ✅ **s195+15 (2026-09-10) — Fix root cause query timeout tab B2C (Advanced) — đã merge main, chờ Hiếu QA** | Hiếu
  báo tab B2C bị timeout. Root cause xác nhận qua đọc code (không đoán): `b2c-advanced-dashboard.tsx` set
  `nocache=1` MỌI lượt load trang → route `b2c/monthly` bỏ qua cache hoàn toàn, tính lại tươi mỗi lần —
  trong đó 2 query phân loại khách New/Returning có CTE `first_order` **không giới hạn ngày dưới**, quét
  TOÀN BỘ lịch sử `fact_fulfillment_revenue` (không index được), chạy chung `Promise.all` với pool
  `max=3`/`statement_timeout=25s` → đúng pattern timeout đã gặp ở Daily Report (s157) nhưng xảy ra ở MỌI
  lượt xem trang thay vì 1 lần/ngày. Fix: tách phân loại khách ra `cachedQuery` riêng TTL 60 phút (không
  cần tươi tới giây vì cutoff dữ liệu vốn T-1) + ưu tiên đọc **Admin GoHub API** (nhẹ, cùng nguồn cron
  snapshot) trước khi rơi về CTE nặng (giờ chỉ là fallback thật). Khối revenue giữ nguyên "luôn live". Chạy
  tuần tự (không gộp Promise.all) giảm tải pool. Không đổi công thức/số liệu/UI. tsc + lint (0 lỗi mới) +
  vitest (216/216) PASS. Wiki `docs/wiki/system/tabs/analytics-b2c.md` đã cập nhật. Đã merge staging→main
  (`f56b4692`) theo yêu cầu Hiếu, production đang tự deploy. **Cần Hiếu**: QA tab B2C Advanced trên
  production/staging sau khi Vercel deploy xong — load nhanh hơn/hết timeout, số liệu Customers không đổi
  so với bản trước.
| ✅ **s195+14 (2026-09-09) — Fix Bé Gấu trả lời quá lâu → im lặng không có câu trả lời (đúng bug thật, đã verify qua log)** | Hiếu báo trả lời lâu thì không ra
  gì cả, hỏi có phải do time không. Verify qua Vercel Runtime Errors: `Task timed out after 60 seconds`
  đúng route `/api/chat`, lần gần nhất khớp đúng lúc Hiếu vừa gặp — xác nhận đúng nguyên nhân, không đoán.
  `runBeGau()` await xong TOÀN BỘ (kể cả nhiều vòng tool-call BI) mới enqueue 1 lần — không stream token
  thật dù bọc `ReadableStream` — câu hỏi phức tạp dễ vượt 60s, Vercel giết function giữa chừng TRƯỚC KHI
  catch-block kịp trả message lỗi thân thiện → im lặng hoàn toàn. `maxDuration=60` vốn đã đúng = trần cứng
  Hobby plan, không phải thiếu cấu hình. Nâng 60→300 (`web/vercel.json` + `api/chat/route.ts`) — Hobby +
  Fluid Compute cho phép tới 300s, không cần nâng gói. Cùng fix `/api/lark/events` (gọi `runBeGau()` đồng
  bộ y hệt). Kiểm tra không có AbortController/timeout nội bộ nào khác (be-gau.ts, FE fetch) cần nâng
  theo. tsc PASS (chỉ đổi config + comment). Đã push staging (`3692c3f2`) — **chưa merge main**, Hiếu tự
  QA thử 1 câu hỏi BI dài trên staging trước khi merge production.
|---|---|
| ⏳ **s195+13 (2026-09-09) — Merge branch B2C song song của Minh (codex/b2c-dashboard-preview) vào staging + main, 1 tính năng mới còn treo** | Hiếu yêu cầu merge branch của Minh. Minh đã tự merge
  staging (có fix cutoff s195+12 của mình) vào branch anh ấy trước — giảm conflict thật từ 13 file xuống
  còn 3 (`ga4-categories/route.ts`, `monthly/route.ts`, `b2c-report-snapshot.ts`) và `vercel.json` giờ
  giống hệt nhau (hết rủi ro mất cron). Resolve 3 conflict: giữ cutoff `getSafeReportDate()` (VN
  timezone-safe, đã có unit test) thay vì `b2c-report-period.ts` của Minh (dùng `new Date(y,m,d)` local —
  có nguy cơ lệch ngày trên máy dev khác timezone, đúng lớp bug repo từng gặp) — đã xoá file đó + test
  không còn ai dùng; giữ `ga4-categories/route.ts` bản mình (dùng field `GA4Site.kind`, Minh vẫn đoán site
  qua tên/URL). Giữ nguyên toàn bộ tính năng mới của Minh (customer breakdown theo kênh, Revenue Comparison
  card, GA4 Category Performance). **3 bug thật phát hiện khi audit phần auto-merge "sạch" của
  `b2c-advanced-dashboard.tsx`** (git không coi conflict vì bên mình không đổi đúng dòng đó từ merge-base,
  nhưng vẫn làm mất tính năng — tự phát hiện qua audit kỹ, không tin theo báo cáo trước đó): (1) mất hẳn
  dải "6 KPI cards" (Users/ROAS/Customers/CAC/Leads/CPL) — khôi phục nguyên `KpiCard` + biến tính toán; (2)
  mất chấm màu `Dot`/`marketDot` (redesign s194+3) ở 3 bảng — khôi phục; (3) 8 chỗ merge lùi từ `#0071e3`
  (UI Strict Lock) về Tailwind `blue-*` mặc định — sửa lại; (4) 2 Section ("B2C MKT Profit Report",
  "Revenue & Gross Profit Trend") bị render TRÙNG LẶP 2 lần — xoá bản cũ. tsc + lint (0 lỗi mới) + vitest
  (216/216) PASS cả staging lẫn main. **Đã tự QA kỹ trên staging qua Chrome** — cutoff đúng, 6 KPI card
  hiện lại, Dot màu đúng, hết trùng lặp, breakdown khách theo kênh hiện đúng số liệu thật. **1 việc treo,
  KHÔNG phải regression** (tính năng hoàn toàn mới của Minh, chưa từng chạy được trước đây): 3 Section
  "GA4 Web/App Category Performance" + "GA4 Conversion Rate Charts" — code tồn tại trong file, build Vercel
  sạch không cảnh báo, không lỗi console/network, nhưng KHÔNG render ra DOM (chỉ 6/9 Section hiện, đã xác
  nhận qua `document.querySelectorAll("section")`). Đã điều tra sâu (console/network/DOM/raw JS bundle/
  build log) không tìm ra nguyên nhân — dừng lại vì đây là tính năng mới của Minh (chưa từng verify được),
  không chặn gì khác. Đã merge cả staging (`9e537570`) lẫn main (`5c9f2a7b`), production đang tự deploy.
|---|---|
| ✅ **s195+12 (2026-09-09) — Fix bug cutoff doanh thu B2C + route GA4 category, port có chọn lọc từ branch song song của Minh, đã tự QA staging** | Hiếu yêu cầu xem deploy Vercel mới nhất từ branch khác team
  (`codex/b2c-dashboard-preview`, PR #2 của Minh, "Fix B2C reporting cutoff...") và đưa hết vào staging.
  **Thử merge trực tiếp trước — KHÔNG làm** vì branch tách từ commit rất cũ (session 86, hàng trăm commit
  trước), merge thử ra 13 conflict đụng file lõi (cron `vercel.json` — bản Minh thiếu 5 cron production,
  `analytics-helpers.ts`, `ga4.ts`, `b2c-advanced-dashboard.tsx` vừa redesign UI Strict Lock). Đã abort
  merge, dùng 2 fork song song đọc kỹ + so sánh 2 bản (không đoán) cho tab B2C và Website Analytics, báo
  cáo lại Hiếu — Hiếu chọn hướng an toàn: chỉ port phần đã verify đúng, bỏ qua UI/cron/tỷ giá của Minh.
  **Đã port 2 việc, tự đọc trực tiếp code HEAD xác nhận bug thật (không tin theo báo cáo ngoài)**: (1)
  `lib/b2c-report-snapshot.ts` `loadRevenue()` — nguồn snapshot mặc định toàn dashboard B2C — cả 4 query
  THIẾU HẲN điều kiện chặn ngày trên (chỉ `>= windowStart`), cộng dư doanh thu ngày CHƯA kết thúc; thêm
  `lib/analytics-engine/date-math.ts` 2 hàm mới `vnToday()`/`getSafeReportDate(daysAgo=1)` (Intl.DateTimeFormat
  timezone Asia/Ho_Chi_Minh, đúng bất kể server timezone) làm cutoff DUY NHẤT cho cả snapshot generator lẫn
  `api/analytics/b2c/monthly/route.ts` (trước route live có xử lý T-1 khi forceRefresh nhưng snapshot thì
  không). (2) Route mới `GET /api/analytics/b2c/ga4-categories` (traffic theo channel group, so kỳ trước)
  — port từ Minh nhưng sửa `classifySite()` dùng đúng field `GA4Site.kind` (HEAD thêm s194+1) thay vì đoán
  tên/URL như bản gốc (bản gốc không biết field này). tsc + lint (0 lỗi mới) + vitest (216/216, +4 test)
  PASS. **Đã tự QA trên staging**: tab `/analytics/b2c` load đúng, badge "Live · T-1 (đến 2026-09-08)"
  khớp chính xác cutoff mới; gọi trực tiếp route `ga4-categories` qua Dev Tools → 200, trả đúng
  `elapsedDays:8` (khớp T-1) + site `gohub-app` (kind=app) phân đúng nhóm `app`, 2 site web phân đúng nhóm
  `web`. Wiki `docs/wiki/system/tabs/analytics-b2c.md` đã cập nhật. **CHƯA áp dụng UI mới của Minh**
  (breakdown khách theo kênh, Revenue Compare card) — để sau nếu Hiếu muốn, không gấp. Không cần Hiếu làm
  gì thêm.
|---|---|
| ✅ **s195+11 (2026-09-09) — Inventory: feedback team OPS (sub-tab Tồn kho), đã tự QA Chrome** | Hiếu
  đưa feedback OPS cho tab Inventory (theo lô/HSD/ngày nhập, export ICCID, tách VN/US, tách SIM/eSIM, công
  thức tốc độ bán/DOI/cảnh báo/số bán dự kiến). Trước khi code, tự query trực tiếp gohub_dw qua SQL Query
  (Dev Tools) trên staging để verify schema thật — không đoán: xác nhận `fact_inventory.batch` có cột
  nhưng 0/451 dòng có data (ETL Sapo chưa sync lot-tracking), không có cột "ngày nhập kho của lô" nào, và
  ICCID không tồn tại trong `fact_inventory`/`dim_warehouse` (chỉ có ở `fact_data_usage`/`data_usage_log`,
  usage 3HK, khác hẳn tồn kho vật lý) — 3 mục này **chưa làm được**, cần Hiếu hỏi Sapo/ETL bổ sung nguồn.
  Đồng thời xác nhận tất cả 7 kho `dim_warehouse` đều ở VN (không có kho US) → tách VN/US **theo SKU**
  (JOIN `fact_fulfillment_revenue.company_code`, lấy company xuất hiện nhiều nhất — KHÔNG đoán qua ký tự
  đầu SKU, verify 1 SKU cùng prefix `E` có thể thuộc cả 2 company). Đã làm: tách VN/US + SIM/eSIM (filter
  toggle, `dim_sku.type_of_sim`, kèm fix bug field này trước bị gán nhầm hiển thị làm tên sản phẩm), thêm
  cột "Bán tuần trước", đổi cảnh báo sang 4 mức (An toàn/Bình thường/Cần chú ý/Nguy hiểm) theo ngưỡng DOI
  **OPS tự cấu hình** qua `/analytics/settings` (card mới "Ngưỡng cảnh báo tồn kho", `app_settings` key
  `inventory_alert_thresholds`, không hardcode — theo yêu cầu rõ của Hiếu khi hỏi lại khoảng 60-90 ngày),
  mặc định 90/60/30. Thêm Export Excel. Chuẩn bị sẵn group theo lô trong breakdown kho (tự hiện khi ETL bổ
  sung batch, không cần sửa lại). Không cần migration DB nào (dùng lại `app_settings` key-value có sẵn).
  tsc + lint (0 lỗi mới) + vitest (212/212) PASS. **Đã tự QA qua Chrome trên staging**: filter VN/eSIM lọc
  đúng (30→9 SKU), expand row hiện đúng "Mã lô: —" + ghi chú chờ ETL, đổi ngưỡng An toàn 90→120 ở Settings
  → Inventory phản ánh ngay (1 SKU 96 ngày đổi từ "An toàn" sang "Bình thường"), đã trả lại 90 sau test.
  Wiki `docs/wiki/system/tabs/analytics-fulfillment.md` đã cập nhật đủ. Không cần Hiếu làm gì thêm để dùng
  ngay — 3 mục blocked (lô/ngày nhập/ICCID) cần Hiếu tự liên hệ Sapo/ETL khi rảnh, không gấp.
|---|---|
| ⏳ **s195+8/+9/+10 (2026-09-08) — Fix 3 bug thật tab Vendors, chờ Hiếu QA staging** | Hiếu báo liên tiếp
  3 lỗi khi dùng tab Vendors, mỗi lỗi fix xong lộ ra lỗi tiếp theo phía sau (đúng thứ tự user thấy khi test
  thật). **(1) Trang hiện toàn số 0**: `fetchVendors()` tự chọn vendor mặc định bằng
  `list.includes("3HKDATAPOOL")` (không dấu cách) nhưng DB lưu `'3HK DATAPOOL'` (CÓ dấu cách) → không bao
  giờ khớp, luôn rơi về `list[0]` (vendor đầu bảng chữ cái, thường ít/không bán trong kỳ mặc định). Fix so
  khớp bỏ dấu cách + hoa/thường. **(2) Bảng Channel Distribution trống**: `channelSql` SELECT
  `business_group` (CASE dùng `s.group_name`) nhưng `GROUP BY` chỉ có `s.channel_name` → Postgres lỗi
  grouping, query fail âm thầm (chỉ console.error, không hiện banner lỗi) → `channelDistribution` không
  bao giờ được set. Fix thêm `s.group_name` vào GROUP BY. **(3) Channel Strategic bị gắn nhầm
  Non-Strategic**: phát hiện repo có **2 hệ thống phân loại Strategic lệch nhau** — Vendors dùng
  `partner_tiers` (danh sách TÊN kênh liệt kê tay, Supabase) trong khi Quarter Report/Dashboard/BOD/
  All-Time dùng hệ canonical `quarterly_tier_keywords` (mọi KH B2B mặc định Strategic trừ khi
  `price_list_name` khớp keyword VIP/Gold/Silver, xem `buildGroupCaseByCustomerSql` trong
  `analytics-helpers.ts`). Kênh Strategic mới/chưa kịp thêm tay vào `partner_tiers` bị rơi nhầm
  Non-Strategic. Fix đổi `channelSql` sang hệ canonical (JOIN `dim_customer`, tách CTE `classified` phân
  loại từng dòng trước khi GROUP BY vì business_group phụ thuộc cột không aggregate được); KHÔNG áp
  exclusion list của Quarter Report (tránh lệch tổng khỏi KPI card cùng trang). `strategicPerformance`
  (bảng đối tác Strategic named cụ thể, route `b2b/strategic-performance`) CHƯA đổi — vẫn hệ cũ, ngoài
  scope lần này, không ảnh hưởng tính đúng của Channel Distribution. Kèm fix 1 bug latent: `SUM(f.marginCol)`
  ở chế độ Created (`marginCol="0"` literal) từng thành `SUM(f.0)` không hợp lệ. Cả 3 fix: tsc + lint (0
  lỗi mới) + vitest (212/212) PASS. Wiki `docs/wiki/system/tabs/analytics-vendors.md` đã cập nhật đủ 3
  mục. **Cần Hiếu**: QA lại tab Vendors trên staging sau khi Vercel deploy xong — vendor mặc định load
  đúng, Channel Distribution có dữ liệu, các channel Strategic (đối chiếu Quarter Report) hiện đúng nhóm
  B2B-Strategic.
| ⏳ **s195+7 (2026-09-08) — Audit: Orders thiếu đơn SIM vật lý (chỉ hiện eSIM), chờ Hiếu tự verify** | Hiếu
  báo tab Orders sai số liệu — chỉ thấy đơn eSIM, đơn SIM vật lý không hiện. Đọc kỹ `route.ts`
  (`/api/analytics/order-report`) + `orders/page.tsx` toàn bộ — KHÔNG có filter cứng nào (SQL/FE) loại theo
  `type_of_sim`/eSIM → loại trừ nguyên nhân code/filter. Giả thuyết mạnh nhất (chưa verify được — máy dev
  không có `.env.local`, không query gohub_dw trực tiếp): mặc định `dataSource=fulfilled` dùng
  `fulfiled_date` (= ngày ĐÃ XUẤT/GIAO XONG). eSIM giao tức thì → `fulfiled_date` set ngay; SIM vật lý cần
  ops xác nhận ship mới được set cột này trong gohub_dw → đơn chưa confirm ship → `fulfiled_date` NULL →
  bị loại khỏi `WHERE fulfiled_date BETWEEN...` → biến mất khỏi Orders dù đơn có thật. **Cần Hiếu**: đổi
  toggle "Fulfillment"→"Created" ở đầu trang Orders — nếu đơn SIM vật lý hiện ra ở Created thì xác nhận
  đúng nguyên nhân (lưu ý: Created thì GP luôn = 0, không phải bug khác); nếu đúng thì root cause ở khâu
  ops xác nhận "đã giao" tại hệ thống nguồn (Sapo/ETL), không phải bug web app, báo lại để tính hướng tiếp.
  Xem `docs/wiki/system/tabs/analytics-orders.md` mục Gotchas.
| ✅ **s195+6 (2026-09-07) — Inventory: thêm note công thức tính ngay trong UI (+ dạng nút bấm)** | Hiếu:
  "thêm vào trong Inventory 1 chỗ note công thức tính đi". Dùng lại `LogicNote` dùng chung (đã dùng ở B2C
  Metric) — chèn vào sub-tab "Kế hoạch nhập hàng theo tuần" (`fulfillment/page.tsx`), nêu công thức Vận
  tốc bán/Đầu tuần/Gợi ý nhập/Cảnh báo (công thức đã có sẵn trong wiki từ s194+5). Hiếu phản hồi hiện sẵn
  trên trang mất thẩm mỹ → `LogicNote` thêm prop `collapsible` (mặc định `false`, không ảnh hưởng chỗ dùng
  khác như B2C Metric) — thu gọn thành nút "ⓘ Công thức", bấm mới xổ nội dung, có nút "Ẩn công thức" đóng
  lại; Inventory dùng `<LogicNote collapsible>`. Không đổi logic/số liệu. tsc + vitest (212/212) PASS.
  Không cần Hiếu làm gì thêm.
| ✅ **s195+5 (2026-09-07) — `browseWeb` đọc được nhiều trang/lần gọi** | Hiếu phản hồi `browseWeb` (s195)
  chỉ đọc đúng 1 trang, không đủ cho lấy dữ liệu tự động nhiều trang. Hỏi rõ kiểu phân trang thật cần trước
  khi code — Hiếu chọn cả 3: `urls[]` (list URL biết trước, tối đa 20, 1 URL lỗi không chặn URL khác),
  `pagination.mode=click_next` (bấm Next lặp tới `max_pages`, dừng êm khi hết nút — không phải lỗi),
  `pagination.mode=infinite_scroll` (cuộn lặp, tự dừng khi nội dung hết phát triển). Output: text thô gộp
  từng trang có đánh dấu (Hiếu chọn đơn giản hơn structured extraction). Cắt nội dung 2 tầng
  (8000/trang, 60000 tổng) + timeout co giãn theo số bước (20s+8s/bước, trần 180s) — không phá tương
  thích ngược (gọi `{url}` đơn như cũ vẫn y hệt hành vi trước). tsc + lint (0 lỗi mới) + vitest (212/212)
  PASS. Xem `docs/wiki/system/tabs/analytics-creator-ai.md` mục "s195+5". Chưa cần Hiếu làm gì thêm (không
  đổi hạ tầng/env) — tự thử Gấu Pro với 1 trang có phân trang thật khi rảnh để xác nhận.
|---|---|
| ✅ **s195+4 (2026-09-07) — API sản phẩm cho hệ thống bên ngoài (manager tích hợp)** | Hiếu muốn cấp API
  đọc thông tin sản phẩm (kèm giá vốn/COGS) cho manager để tích hợp vào 1 hệ thống/tool khác họ đang xây
  (backend-to-backend, không phải browser). Audit trước: `/api/products`/`/api/skus` hiện có chỉ
  session-cookie (không dùng được ngoài browser); `/api/mcp` (`MCP_SECRET`) đã lộ COGS từ trước nhưng dùng
  1 secret tĩnh chung mọi mục đích, không revoke/audit riêng được — cố ý KHÔNG tái dùng. Thiết kế mới: 2
  route `GET /api/external/products`/`/api/external/skus` (Bearer API key riêng, field list tách hẳn route
  UI nội bộ, `page_size` tới 200, rate-limit 60/phút/key). Bảng `external_api_keys` (migration
  `v52_external_api_keys.sql`) lưu **hash** key (không lưu plaintext — khác token Bridge cá nhân). Tab mới
  "API bên ngoài" trong `/admin` (admin/creator) — tạo/thu hồi key, key thật chỉ hiện 1 lần lúc tạo. tsc +
  lint (0 lỗi mới) + vitest (207/207) PASS. **Cần Hiếu**: chạy migration v52 (nhớ Reload schema Supabase
  sau khi tạo bảng mới), vào `/admin` tab "API bên ngoài" tạo key label "Manager - <tên tool>", gửi
  manager. Xem `docs/wiki/system/tabs/admin-product.md` mục 4.
|---|---|
| ✅ **s195+3 (2026-09-07) — Bridge multi-tenant: mọi user có quyền Gấu Pro tự pair browser CỦA CHÍNH HỌ** |
  Hiếu hỏi ngược s195+2: muốn người khác dùng Gấu Pro như trợ lý riêng của họ. Khác rủi ro đã cảnh báo
  trước (Hiếu đọc dữ liệu người khác — cần chính sách privacy) — đây là mỗi người tự cấp quyền cho máy của
  CHÍNH HỌ, nên sửa đúng gốc: token/queue chuyển 1-global → 1-per-user. Bảng mới
  `browser_bridge_pairings` (migration `v51_browser_bridge_multitenant.sql`) thay `app_settings` singleton
  cũ; `browser_bridge_commands` thêm `owner_username`. 3 route bridge scope theo user (helper mới
  `lib/gp-access.ts` `hasGpAccess()`, dùng chung với `chat/route.ts`). `username` thread xuống tool
  (`dispatchTool` thêm tham số `ctx` thứ 4 optional). `CREATOR_ONLY_TOOLS` rỗng lại — mở `readMyBrowser`/
  `controlMyBrowser` cho MỌI user có `gp_enabled` (đúng field self-check có sẵn, dùng chung
  `analytics/creator/ai/page.tsx`/`sidebar.tsx`). Trang `/analytics/creator/bridge` + nav "Bridge" giờ
  hiện cho non-creator allowed user (không chỉ creator). tsc + lint (0 lỗi mới) + vitest (201/201) PASS.
  **Cần Hiếu**: chạy migration v51 (token cũ tự giữ nếu backfill khớp, không thì tạo lại 1 lần trên trang
  Bridge). Nhờ 1 người đã có `gp_allowed_users` tự pair — xác nhận `list_tabs` ra ĐÚNG tab của họ, không
  lẫn với Hiếu. Xem `docs/wiki/system/tabs/analytics-creator-ai.md` mục "s195+3".
|---|---|
| ✅ **s195+2 (2026-09-07) — Fix 3 việc phát hiện khi Hiếu QA s195+1** | (1) **Bỏ Duyệt → Auto**: Hiếu
  nhận thấy thói quen luôn bấm Duyệt khiến bước xác nhận vô nghĩa — `background.js` bỏ hẳn
  `chrome.notifications` chặn (Duyệt/Từ chối), `controlMyBrowser` thực thi NGAY, chỉ còn notification
  KHÔNG chặn để biết đã làm gì. (2) **Fix fill không hiện chữ**: Hiếu test điền ô nhập nhanh kiểu sheet,
  Gấu Pro báo đã fill nhưng không thấy vì thiếu phím Enter để commit — thêm tham số `press_enter` (dispatch
  keydown/keypress/keyup Enter sau khi set value, kèm `Object.defineProperty` đè `keyCode`/`which` vì
  `KeyboardEvent` constructor không set được 2 field này). (3) **Fix lỗ hổng thật phát hiện qua câu hỏi
  "người khác dùng được không"**: `readMyBrowser`/`controlMyBrowser` trước đây MỌI user có quyền Gấu Pro
  (`gp_allowed_users`) đều gọi được y hệt nhau, nhưng bridge là 1 token = browser THẬT của Hiếu → người
  khác gọi sẽ đọc/thao tác lên browser Hiếu, không phải của họ (rò rỉ dữ liệu cá nhân). Fix: `runCreatorAI`
  nhận `isCreator`, hàm mới `buildFunctionDeclarations(isCreator)` loại 2 tool bridge khỏi danh sách nếu
  không phải creator — đúng pattern `GP_TOOLS_ADMIN_ONLY` đã dùng ở `be-gau.ts`. tsc + lint (0 lỗi mới) +
  vitest (199/199) PASS. Xem `docs/wiki/system/tabs/analytics-creator-ai.md` mục "s195+2". **Cần Hiếu**:
  pull code mới (redeploy tự động qua Vercel), tự QA lại: (a) fill ô sheet có `press_enter` giờ hiện chữ
  chưa, (b) nếu có cấp Gấu Pro cho ai khác qua Creator Settings, xác nhận người đó KHÔNG còn thấy/gọi được
  bridge nữa.
|---|---|
| ✅ **s195+1 (2026-09-07) — Gấu Pro: Extension điều khiển browser cá nhân Hiếu** | Tiếp lộ trình s195.
  `browseWeb` (s195) duyệt web công khai; phase này cho Gấu Pro đọc/thao tác trên chính tab Chrome ĐANG MỞ
  của Hiếu (session đăng nhập thật Lark/Sapo/portal) — giống `claude-in-chrome`. Kiến trúc: hàng đợi lệnh
  Supabase (`browser_bridge_commands`, migration `v50_browser_bridge.sql`) + polling 2 chiều (không dựng
  WebSocket riêng — Vercel serverless không giữ được kết nối 2 chiều). 2 tool mới: `readMyBrowser`
  (list_tabs/read_tab, không cần duyệt) + `controlMyBrowser` (click/fill/navigate — **bắt buộc Hiếu duyệt**
  qua `chrome.notifications` trước khi thực thi vì là session thật; scroll không cần duyệt). Cờ duyệt set
  CỨNG server-side (model không lách được). Trang mới `/analytics/creator/bridge` (creator-only) sinh/xem
  token pairing. Extension mới `browser-extension/` (Manifest V3, unpacked/dev-only, KHÔNG publish Web
  Store) — xử lý đúng gotcha React (Lark/Sapo web) cần native setter khi `fill` input, và giữ service
  worker sống bằng vòng lặp `setTimeout` 15s (né giới hạn `chrome.alarms` tối thiểu 1 phút/lần). Chỉ Gấu
  Pro, chỉ Hiếu — không mở Bé Gấu, không nhiều token. tsc + lint (0 lỗi mới) + vitest (196/196) PASS.
  **Cần Hiếu**: chạy migration v50, load unpacked extension (`chrome://extensions` → Developer mode →
  Load unpacked → `browser-extension/`), vào `/analytics/creator/bridge` sinh token, dán token + Server URL
  vào popup extension, bật toggle, rồi tự QA (list tab, thử 1 lệnh click/fill xem notification Duyệt hiện
  đúng không) — chưa QA được ở máy dev (cần Chrome thật + extension load thủ công). Xem
  `docs/wiki/system/tabs/analytics-creator-ai.md` mục "s195+1". Lộ trình còn lại (chưa làm): mở rộng Lark
  OAuth scope cá nhân · bật thật multi-tenant (cần chính sách privacy trước).
| ✅ **s195 (2026-09-07) — Gấu Pro: tool `browseWeb` (headless browser thật qua CDP)** | Bước đầu lộ trình
  biến Gấu Pro thành "agent assistant" rộng hơn (yêu cầu Hiếu). Đã audit trước: `be-gau.ts` (s190) **đã
  âm thầm merge gần hết tool Gấu Pro sang Bé Gấu** theo đúng tiêu chí "không cá nhân/nội bộ thì mở" —
  không cần code gì thêm, chỉ bổ sung wiki `chatbot.md` mục 4a-3 (trước bị bỏ sót). Việc mới: tool
  `browseWeb` (`web/src/lib/agents/creator/tools/browser.ts`, dùng `playwright-core` connect CDP vào
  container `browserless/chrome` **Hiếu tự host** — không bundle Chromium vào Vercel, đúng tiền lệ né
  Puppeteer của `card-images.ts`) — đọc được trang SPA/JS-nặng mà `webSearch`/`browsePortal` không đọc
  được. Chỉ Gấu Pro (chưa merge Bé Gấu). Migration `v49_creator_kb_owner_prep.sql` thêm cột nullable
  chuẩn bị multi-tenant (chưa bật, không đổi hành vi). tsc + lint (0 lỗi mới) + vitest (190/190) PASS.
  Hạ tầng: container `ghcr.io/browserless/chromium` tự host trên **Render free tier** (`browserless-gohub`)
  + keep-alive qua **cron-job.org** ping `/json/version` mỗi 10 phút (KHÔNG dùng GitHub Actions cron —
  đúng bài học cũ của repo, xem `scheduled-messages.yml`: lịch GitHub Actions trễ 15-60 phút giờ thấp
  điểm, không đủ nhanh để giữ Render free tier khỏi ngủ 15 phút). Env `BROWSERLESS_WS_URL`/
  `BROWSERLESS_TOKEN` đã set Vercel (Production+Preview) + redeploy. **✅ Hiếu đã tự QA trên staging —
  hỏi Gấu Pro mở URL thật, trả đúng nội dung.** Migration v49 Hiếu đã chạy. Xem
  `docs/wiki/system/tabs/analytics-creator-ai.md` mục "s195". Lộ trình còn lại (chưa làm, phase riêng sau):
  extension điều khiển browser cá nhân Hiếu · mở rộng Lark OAuth scope cá nhân · bật thật multi-tenant
  (cần chính sách privacy trước).
| Branch làm việc | `staging` (làm việc ở đây, merge main **CHỈ khi Hiếu yêu cầu RÕ RÀNG** trong chính tin nhắn đó) |
| tsc + `next build` + `next lint` + vitest | PASS (lint: 0 error mới; vitest 190/190) |
| ✅ **s194+12 (2026-09-06) — UI Lô 5: Management (Users/Settings/Admin), Dev Tools, To-Gau + fix bug brand-900/950** | Tiếp lô 5 (plan `eager-popping-aho.md`). **Bug thật phát hiện lúc làm**: `tailwind.config.ts` scale `brand` chỉ có tới 800 (không có 900/950) — nhưng `channels/staff/vendors/cost-management-modal` (do chính sed `blue-*→brand-*` của tôi ở s194+9/+10 convert nhầm `blue-900`→`brand-900` không hợp lệ) và `chatbot/page.tsx` (bug có sẵn từ s192, tác giả gõ tay `brand-900` giả định scale đủ) đều có class KHÔNG LÊN MÀU GÌ (invisible). Đổi toàn bộ `brand-900/950`→`brand-800`. Đã tự QA lại xác nhận đúng (Staff: header "So sánh KH — {tên sales}" giờ hiện navy, trước có nguy cơ hiện đen mặc định). **Users + Admin (Product)**: fix hex `#003B95`/`#002B70` → `brand-*`; giữ role badge categorical (`bod`=blue, `vendor_code` badge=blue cạnh `product_code`=brand). **Settings**: fix hex 5 khu vực config; giữ nút "Sync B2B KH" blue-700 riêng biệt với nút "Kiểm tra" navy (4 nút DB status mỗi nút 1 màu). **Dev Tools**: fix khu SQL Query→brand; giữ HTTP method GET=emerald/POST=blue/khác=orange. **To-Gau** (list + room + toàn bộ 6 component con + `to-gau-format.tsx`): fix LỚN NHẤT — hex `#003B95` là màu bubble chat "mình" + màu chủ đạo xuyên suốt toàn tab (header/input focus/mention/wiki/docs/notes/questions panel) → `brand-600/700`; giữ role tag "Manager"=blue trong danh sách thành viên. Không đổi logic/quyền hạn nào. tsc + lint (0 lỗi mới) + vitest (185/185) PASS. **Đã tự QA qua Chrome trên staging** bằng acc role `bod` (Test tab: chat bubble navy đúng, Docs/Notes/Câu hỏi panel đúng màu; Staff: xác nhận trực tiếp fix brand-800 hiện đúng navy không phải đen). **Users/Settings/Admin/Dev Tools cần quyền admin/creator — acc bod bị redirect về /chatbot đúng thiết kế, CHƯA tự QA được phần này, cần Hiếu tự xem lại bằng acc creator.** |
| ✅ **s194+11 (2026-09-06) — UI Lô 4: Orders, Inventory, 3HK Usage, CS Troubleshoot, Products, Targets — XONG, đã tự QA Chrome** | Tiếp lô 4 sau lô 3 (plan `eager-popping-aho.md` mục "Đợt 4+"). **Orders**: fix hex navy SAI `#003B95`/`#002d73` (audit s192 từng flag, sót từ trước redesign) → `brand-600`/`brand-700`. **CS Troubleshoot**: cùng fix hex sai (`#003B95`/`#002B70`, 16 chỗ) + `blue-*`→`brand-*`; 4 KPI card viết tay → `StatTile` (Units Sold=neutral, TBS Tickets=warn, TBS Rate=cost, Avg Handle Time=margin); chart TBS Volume → `CHART_PALETTE`/`CHART_GRID_COLOR`/`chartTooltipStyle`. **Inventory**: phần "Kế hoạch nhập hàng" cũ (PO tracker + lưới tuần, giữ nguyên logic s194+5) còn sót `blue-*` (16 chỗ, cả `stock-view.tsx`) → `brand-*`; sub-tab "Tồn kho" đã StatTile từ trước không đổi. **3HK Data Usage**: `blue-*`→`brand-*`, 2 chart grid→`CHART_GRID_COLOR`; giữ nguyên màu semantic thật (đỏ=vượt mức/xanh lá=trong kế hoạch/xám=kế hoạch/dải màu categorical nhóm tốc độ). **Products**: 5 KPI card viết tay→`StatTile`; banner "Month-End Projection" + 2 chart (Trend, Top Regions)→`CHART_PALETTE`/`CHART_GRID_COLOR`/`chartTooltipStyle`; `blue-*`→`brand-*` (giữ indigo=B2C, slate=B2B Non-Strategic). **Targets**: `blue-*`→`brand-*` toàn trang. **My Metrics**: đã sạch từ trước, không cần sửa. Không đổi logic/công thức/API nào ở cả 6 trang có thay đổi. tsc + lint (0 lỗi mới) + vitest (185/185) PASS. **Đã tự QA qua Chrome trên staging cả 6 trang** — StatTile/chart/badge/expand-row/WeeklyGrid đều đúng màu, số liệu không đổi, không phát hiện lỗi. **Lô 4 coi như hoàn tất hẳn** (My Metrics vốn đã sạch). Lô 5 (Management/Scheduled/Dev Tools/To-Gau) và Lô 6 (ngoài analytics: Admin/Chatbot/NCC/SKUs/Countries/Promotions/Users/Creator Settings/Gấu Pro) còn lại — xem `eager-popping-aho.md`. |
| ✅ **s194+10 (2026-09-06) — UI Lô 3: Website, Staff, Customers, Vendors — XONG, đã tự QA Chrome** | Tiếp lô 3 (theo plan `eager-popping-aho.md`). **Website Analytics**: 5 KPI card viết tay → StatTile (accent theo ý nghĩa: Revenue=revenue, Purchases/Avg.CTR=positive, Sessions/Search Clicks=neutral); 3 chart (Traffic Overview/Search Trends/Revenue Breakdown) đổi hex tự chọn sang `CHART_PALETTE`/`CHART_GRID_COLOR`/`chartTooltipStyle`; `blue-*`→`brand-*` toàn trang. **Staff Performance**: `STAFF_COLORS[0]` từ hex navy SAI `#003B95` (audit s192 từng flag, nặng nhất 16 hex ngẫu hứng) sửa đúng `#0f4c81`; 6 KPI card viết tay → StatTile (thêm icon, trước chỉ chữ màu không icon); giữ nguyên bảng màu tier Strategic/VIP/Gold/Silver/B2C và `STAFF_COLORS` categorical (biểu đồ nhiều sales cùng lúc — cần phân biệt thực thể, không phải màu ngẫu nhiên). **Customers**: fix đúng 1 chỗ hex sai `#003B95` (tier badge) → `brand-600`; vài chỗ CM1 `text-blue-*`→`brand-*`; KHÔNG đổi theme indigo xuyên suốt trang (thiết kế "editorial" bo góc lớn/in nghiêng hoa riêng biệt, giống cách B2C Advanced giữ Apple-glass style — không phải màu lệch). **Vendors**: hero "Month-End Projection" banner gradient `blue-600/700`→`brand-600/700`; 5 KPI card → StatTile; chart Revenue Trend → `CHART_PALETTE`/`CHART_GRID_COLOR`/`chartTooltipStyle`; `blue-*`→`brand-*` toàn trang (giữ indigo/purple/amber phân biệt Orders/Units/Margin, đúng tiền lệ Channels). Không đổi logic/công thức/API nào ở cả 4 trang. tsc + lint (0 lỗi mới) + vitest (185/185) PASS. **Đã tự QA qua Chrome trên staging cả 4 trang** — StatTile/chart/tier badge/expand-row đều đúng màu, số liệu không đổi, không phát hiện lỗi. **Lô 3 coi như hoàn tất hẳn** — lô tiếp theo: Orders/Inventory/3HK Usage/CS Troubleshoot/Products/Targets/My Metrics (lô 4). |
| ✅ **s194+9 (2026-09-06) — UI Lô 2 phần Channels — XONG, đã tự QA Chrome** | Tiếp lô 2 sau B2B/B2C (plan `eager-popping-aho.md`). `channels/page.tsx`: KPI card đã dùng `StatTile` từ trước (không cần đổi); chart Revenue Trend đổi hex tự chọn `#3b82f6`/`#10b981`/`#f1f5f9` sang `CHART_PALETTE`/`CHART_GRID_COLOR`/`chartTooltipStyle` dùng chung; toàn bộ `blue-*` Tailwind class còn sót (badge Group, tier pill, progress bar contribution, nút Filters...) đổi sang `brand-*`; 4 chỗ hex inline `#0f4c81` đổi sang class `brand-600`. Nhân tiện phát hiện `CostManagementModal`/`showCostModal`/`dbRole` trong `channels/page.tsx` là **dead code** (import/state khai nhưng không còn nút nào gọi tới — đúng như wiki `analytics-channels.md` §4 đã ghi "Manage Costs đã ngắt 2026-07-28", chỉ còn sót state cũ chưa dọn) — KHÔNG xoá lần này (ngoài scope batch màu), nhưng vẫn đổi màu `cost-management-modal.tsx` (25 chỗ `blue-*`→`brand-*`) vì file này **đang thật sự render ở tab Targets** (`analytics/targets/page.tsx` cũng import). KHÔNG đụng bảng B2B Tier/Channel Overview (giữ `<table>` viết tay, đúng tiền lệ B2B) hay logic/công thức/API. tsc + lint (0 lỗi mới) + vitest (185/185) PASS. **Đã tự QA qua Chrome trên staging** — All Channels Overview, chọn 1 kênh (VN-Wholesales) xem đủ 6 StatTile + Revenue Trend chart (line/area brand navy đúng) + Performance Breakdown + Daily Performance + Top Selling Products, tất cả hiển thị đúng màu, số liệu không đổi, không lỗi. |
| ✅ **s194+8 (2026-09-06) — Fix bug lớn: MỌI role không phải admin/creator chưa từng vào được Tổ Gấu** | Hiếu báo "mở lại Tổ Gấu cho tất cả mọi người vào được — vài acc tôi bấm vào không được". Test acc thật role `bod` (username `hieu`) đã được add làm member group "Test": bấm sidebar "Tổ Gấu" → không có phản ứng gì (không đổi trang). Điều tra: sidebar/nav.ts thiết kế đúng — Tổ Gấu hiện cho MỌI role, chỉ ẩn qua `hiddenTabs` (creator config), KHÔNG gate theo `allowed_analytics`. Nhưng `analytics/layout.tsx` (server-side, áp dụng cho MỌI route con `/analytics/*`) lại coi `/analytics/to-gau` như 1 trang analytics bình thường, check `granted.has("to-gau")` — vì "to-gau" không nằm trong `role_permissions`/`allowed_analytics` của BẤT KỲ role nào (đúng ý đồ thiết kế, nó không phải trang analytics), điều kiện này LUÔN false → mọi role không phải admin/creator bị `redirect("/chatbot")` NGAY LẬP TỨC khi vào `/analytics/to-gau`, bất kể có phải member group thật hay không. Bug này tồn tại từ khi tách `analytics/layout.tsx` ra làm gate chung, ảnh hưởng TOÀN BỘ user thường (staff/manager/bod/...) — chỉ admin/creator (bypass sớm ở đầu layout) dùng được Tổ Gấu bình thường bấy lâu nay, không ai để ý vì đội ngũ test chủ yếu là creator. Fix: thêm early-return `if (id === "to-gau") return <>{children}</>` trước khi check `granted`, giữ nguyên gate cho mọi trang analytics khác. tsc + lint (0 lỗi mới) + vitest (185/185) PASS. **Đã tự QA lại bằng chính acc `hieu` (role bod) qua Chrome trên staging — vào được Tổ Gấu, vào được group, thấy chat/members/AI đầy đủ.** ✅ **Hiếu đã tự xác nhận trên staging — vào được, OK.** |
| ✅ **s194+7 (2026-09-06) — Fix thật phát hiện khi QA s194+6: `gemini-2.0-flash` bị Google khai tử, Gấu Tổ AI crash 500 suốt 6 ngày** | QA panel Câu hỏi PASS, nhưng hỏi AI Gấu Tổ trả 500 rỗng body. Tra Vercel runtime error log: model `gemini-2.0-flash` trả 404 "no longer available" liên tục từ **2026-08-31** (6 ngày, không liên quan gì task đang làm — Gấu Tổ AI đã chết âm thầm từ trước, không ai biết vì route không có try/catch nên lỗi không hiện gì cho user, chỉ im lặng fail). Grep toàn repo: cả hệ thống đã chuyển sang `gemini-3.6-flash` từ lâu, CHỈ còn sót đúng 3 route dùng model cũ: `to-gau/groups/[id]/ai/route.ts` (Gấu Tổ), `usage-stats/classify`, `usage-stats/evaluate` — cả 3 đổi sang `gemini-3.6-flash`. Thêm try/catch quanh lời gọi Gemini trong `ai/route.ts` (trả "Hiếu đang fix, vui lòng đợi" thay vì 500 rỗng) để lần sau dễ chẩn đoán hơn. tsc + lint (0 lỗi mới) + vitest (185/185) PASS. **Đã tự QA lại qua Chrome + fetch trực tiếp trên staging — AI trả lời đúng + trích nguồn đúng format `(Nguồn: [Ghi chú nhóm] ...)`.** Hiếu nên tự hỏi thử Gấu Tổ 1 câu ở group thật để yên tâm. |
| ✅ **s194+6 (2026-09-06) — Tổ Gấu: panel "Câu hỏi CS" + AI search Docs/Notes nhóm + trích nguồn — đã QA xong** | Hiếu: CS hay tag người trong ticket/troubleshoot hỏi sản phẩm/policy nhưng câu hỏi "trôi mất", không biết đã update chưa. (1) Bảng mới `chat_questions` (migration `v48_chat_questions.sql` — Hiếu đã chạy) — status `chua`/`dang`/`da_xu_ly`, bất kỳ member nào trả lời/đổi trạng thái được (mang tính cộng tác). Panel mới `components/to-gau/questions-panel.tsx`, sub-tab thứ 3 "❓ Câu hỏi" cạnh Docs/Notes trong track "Của nhóm". (2) `searchKB()` (`to-gau/groups/[id]/ai/route.ts`) trước CHỈ tìm `kb_wiki_pages` — nay tìm thêm `chat_docs`+`chat_notes` CỦA CHÍNH GROUP (ILIKE trực tiếp bảng sống, không cần embedding/reindex riêng — lưu Doc/Note mới có hiệu lực ngay lập tức, đúng yêu cầu "bot cập nhật ngay"). (3) System prompt Gấu Tổ thêm rule bắt buộc trích nguồn `(Nguồn: [Wiki]/[Tài liệu nhóm]/[Ghi chú nhóm] ...)` cuối câu trả lời để người hỏi bấm sang tab tương ứng kiểm chứng lại — đáp ứng yêu cầu "kiểm chứng ngay câu trả lời". **Đã tự QA đầy đủ qua Chrome trên staging thật (`stg-intel-v2.gohub.cloud`)**: đặt câu hỏi/đổi trạng thái chưa→đang→đã xử lý/trả lời tự chuyển đã xử lý — tất cả PASS; hỏi AI 1 câu có đáp án trong Notes group → AI trả lời đúng + trích đúng nguồn `(Nguồn: [Ghi chú nhóm] Nguyễn Hoàng Hiếu)` (xem fix 500 liên quan ở dòng s194+7 trên). |
| ✅ **s194+5 (2026-09-06) — Tab Inventory: thêm sub-tab "Tồn kho" thật (fact_inventory, Sapo sync), đã tự QA Chrome** | Yêu cầu Hiếu: gohub_dw đã có data tồn kho (đúng — 2 bảng mới `fact_inventory`+`dim_warehouse`, ~1 tuần data), build tab quản lý tồn kho/nhập hàng chuyên nghiệp dựa theo 2 file Lark OPS đang dùng ("Plan nhập hàng theo tháng" + "INVENTORY REPORT 2026"). Đã đọc kỹ DB schema thật (qua SQL Query trên staging, không đoán) + 2 file Lark (SIM sheet: Stock/Available for sale/Expired date left/Inventory Age/Last 15-30 days Sold; Draft v2: pivot SKU×kho) trước khi code. `/analytics/fulfillment` (route "Inventory") giờ có 2 sub-tab: **Tồn kho** (mới, mặc định — API `inventory-stock`: StatTile tổng quan + trend chart tồn kho theo ngày (thay hẳn việc OPS phải tự copy tab Lark mới mỗi vài ngày — fact_inventory là snapshot theo NGÀY sẵn trong DB) + bảng SKU expand xem breakdown theo kho, cảnh báo hết hàng/hết hạn, filter+search) và **Kế hoạch nhập hàng** (nội dung cũ y nguyên — PO tracker + lưới tuần — chỉ thêm 1 điểm nối: "Tồn thực tế" tuần đang chạy giờ auto-suggest từ Sapo thật qua `getLatestStock()`, đóng đúng TODO cũ "chưa có nguồn tự động", vẫn ghi đè tay được). tsc + lint (0 lỗi mới) + vitest (185/185) PASS. **Đã tự QA qua Chrome trên staging** — cả 2 sub-tab render đúng, alert logic đúng (SKU sắp hết hàng theo tốc độ bán ra "Nguy hiểm" dù hạn dùng còn xa), expand row breakdown theo kho đúng, auto-suggest tồn thực tế hiện đúng khung nét đứt khớp số liệu thật. Wiki `docs/wiki/system/tabs/analytics-fulfillment.md` cập nhật đầy đủ. |
| ✅ **s194+4 (2026-09-06) — Quarter Report B2B: thêm mục Sản phẩm/SKU + Biểu đồ, đã tự QA Chrome** | Yêu cầu Hiếu: expand 1 KH trong bảng "Chi tiết theo Nhóm × Tháng" (B2B) → mục "Chi tiết số liệu" trước chỉ Tháng/Ngày → thêm nút thứ 3 **Sản phẩm** (liệt kê SKU/tên SP KH hay mua, join `dim_sku`) + nút **Biểu đồ** hiện bar chart cho đúng chế độ đang chọn. Backend: `api/analytics/b2b-customer-orders` thêm `groupBy=sku` (tái dùng shape response cũ, không vỡ 2 mode cũ). FE `b2b-tier-section.tsx`: bảng tự đổi cột khi ở chế độ sku (SKU/Sản phẩm/SL), chart Tháng/Ngày phải cộng dồn theo kỳ trước khi vẽ (data gốc nhiều dòng/kênh cùng kỳ, không cộng ra cột trùng tên chồng lấn) — phát hiện lúc code, sửa luôn. tsc + lint (0 lỗi mới) + vitest (185/185) PASS. **Đã tự QA qua Chrome trên staging** (phải dùng `javascript_tool` click DOM trực tiếp vì bảng quá nhiều cột/dòng, toạ độ chuột từ screenshot không trúng đúng ô — xác nhận cả 3 toggle + chart hoạt động đúng, số liệu SKU thật). Wiki `docs/wiki/system/tabs/analytics-quarterly.md` đã cập nhật. |
| ✅ **s194+3 (2026-09-06) — B2C Advanced+Metric: thêm màu THẬT, hết đơn điệu, đã tự QA Chrome** | Hiếu phản hồi bản s194+2 (chỉ đồng bộ màu lệch) vẫn "chỉ nền trắng chữ đen" — yêu cầu thêm màu sắc/chuyên nghiệp hơn, tự chọn role phù hợp làm. Đã nạp skill `frontend-design`, chọn hướng: dùng LẠI đúng bảng màu "kênh" đã có sẵn ở hero card (VN=`#0071e3`, US=`#6366f1`, Web=`#00a6a6`, App=`#2f9d55`) xuyên suốt trang thay vì phát minh màu mới — màu mang Ý NGHĨA (kênh/thị trường/funnel-stage), không phải trang trí. **Advanced**: 6 KPI mini-card giờ có icon chip màu + viền trái màu theo ý nghĩa funnel (trước `icon`/`accent` prop có khai nhưng chưa từng render — dead code); 6 Section icon chip mỗi cái 1 màu riêng theo nội dung (trước tất cả cùng xanh dương); helper `marketDot()` thêm chấm màu trước tên dòng VN/US/Web/App/New/Returning trong RollingTable/SimpleRollTable/AcquisitionTable (khớp chính xác token đầu nhãn, không lẫn tên sản phẩm như "VN-Web eSIM"); sửa màu chart VN B2C từ `#2563eb` lệch sang đúng `#0071e3`. **Metric**: thêm dải 6 StatTile tóm tắt tháng hiện tại (trước không có card nào), header bảng đổi gradient brand thay slate-800, biến `isBlue` (dead code, khai nhưng chưa dùng) nay dùng thật để tô nền+chữ brand cho dòng nhóm chỉ số, dòng Web/App có chấm màu khớp đúng bảng màu Advanced (nhất quán ngôn ngữ màu 2 sub-tab). Không đổi logic/công thức/API/số liệu. tsc + lint (0 lỗi mới) + vitest (185/185) PASS. **Đã tự QA qua Chrome trên staging — OK**, số liệu khớp bản trước, màu hiển thị đúng như thiết kế. |
| ✅ **s194+2 (2026-09-06) — UI Lô 2 phần B2C (Advanced + Metric), chờ Hiếu QA** | Hiếu chọn hướng qua AskUserQuestion: Advanced ("y chang mockup" đã duyệt — Apple-glass `Section`/`KpiCard`/`RollingTable`) → CHỈ sửa màu lệch + KHÔNG đổi bố cục (audit trước khi sửa: layout đã nhất quán, mọi section dùng chung `Section` wrapper, không cần rearrange); Metric → áp cùng playbook B2B (đổi màu, không đổi cấu trúc bảng pivot). Kết quả: `b2c-advanced-dashboard.tsx` sửa 15 chỗ bảng/banner lỡ dùng Tailwind `blue-*` mặc định thay vì đúng accent `#0071e3` đã dùng ở hero card/KPI row/header (RollingTable, KpiTable, AcquisitionTable, 2 banner cảnh báo). `b2c-metric.tsx`: `bg-blue-50/30`→`bg-brand-50/30`, ghi chú công thức chuyển sang `LogicNote` dùng chung. Không đổi logic/API/công thức. tsc + lint (0 lỗi mới) + vitest (185/185) PASS. Wiki `docs/wiki/system/tabs/analytics-b2c.md` đã cập nhật. ⏳ **Chờ Hiếu QA trên staging.** |
| ✅ **s194+1 (2026-09-06) — GA4 App: fix code chọn sai property khi toggle App** | Phát hiện khi làm theo checklist GA4 App connect: `lib/ga4.ts` `GA4Site` thêm field `kind?: "web"\|"app"` (mặc định `"web"` nếu thiếu, backward-compat). Tab Website (`analytics/website/page.tsx`): toggle Web/App giờ TỰ ĐỘNG chọn đúng site cùng `kind` (trước phải tự tay đổi cả dropdown site NGOÀI việc bấm toggle, không thì query nhầm property web → 0 kết quả). `api/analytics/b2c/metric` (Traffic/Users by platform): trước gọi `platform:"app"` trên `sites[0]` (site web đầu tiên) — nay tìm đúng site `kind==="app"`, không có thì bỏ qua graceful. Chỉ còn thiếu 1 bước: Hiếu chạy SQL Supabase thêm entry `gohub-app` (đã cấp Viewer service account) — xem checklist dưới + `docs/wiki/system/tabs/analytics-website.md` mục 4. tsc + lint (0 lỗi mới) + vitest (185/185) PASS. |
| ✅ **s194 (2026-09-06) — UI Lô 2 phần B2B: KPI→StatTile + hex fix, chờ Hiếu QA** | Tab `/analytics/b2b`: 5 KPI card Actual + 5 card Projected đổi sang `StatTile` (dashboard-kit), icon màu theo ý nghĩa (revenue/margin/positive), chart Revenue&CM1 Trend đổi sang `CHART_PALETTE`/`CHART_GRID_COLOR`/`chartTooltipStyle` dùng chung. Toàn bộ `blue-*` Tailwind class còn sót (nút Apply Filters, tab Fulfillment/Created, tier header, sort icon...) đổi sang `brand-*` — riêng `indigo-*` ở bảng Strategic Partners GIỮ NGUYÊN (màu chủ đích phân biệt, không phải lỗi navy). **KHÔNG đổi** bảng Strategic/Tier Performance sang `DataTable` dùng chung — 2 bảng này có group-header theo tier + expand-row + tổng TOTAL, còn `DataTable` hiện chỉ hỗ trợ bảng phẳng phân trang → ép vào sẽ mất tính năng thật (không phải quick-win), giữ nguyên `<table>` viết tay. KHÔNG đổi logic/công thức/API nào. tsc + lint (0 lỗi mới) + vitest (185/185) PASS. Wiki `docs/wiki/system/tabs/analytics-b2b.md` đã cập nhật. ⏳ **Chờ Hiếu QA trên staging.** B2C (Lô 2 phần còn lại) — theo checklist cũ cần audit thêm 2 component con trước khi làm, CHƯA làm. |
| ✅ **s193 (2026-09-05) — UI Đợt "quick-win": All-Time, Scheduled, Schema, Promotions, Countries** | Hiếu chọn hướng "quick-win nhỏ trước" từ audit UI/UX s192. 5 trang: (1) **All-Time** — chart area/legend/bảng đổi hex tuỳ hứng `#2563eb`/`#93c5fd`/`#312e81` sang bảng nhất quán (B2B-Strategic=`brand-600`, B2B-Non-Strategic=`brand-300`, B2C=`emerald-600`), dùng `CHART_GRID_COLOR`/`chartTooltipStyle` chung. (2) **Scheduled** — bảng lịch đổi `<table>` tay sang `DataTable` (thêm phân trang, trước không có), bỏ pattern nút ẩn-khi-hover (DataTable chưa hỗ trợ `group` per-row) → nút Test/Sửa/Xoá luôn hiện. (3) **Schema** — chỉ đổi `blue-*`→`brand-*` (trang form editor, không có bảng liệt kê nên không áp DataTable). (4) **Promotions** — bảng khuyến mãi sang DataTable (thêm phân trang). (5) **Countries** — cả 4 sub-tab (Mã Nước/Nhóm Nước Hỗ Trợ/Category/Mã Vendor) sang DataTable (Mã Nước trước hiện hết 271 dòng không phân trang — nay có). Toàn bộ 5 trang: mọi `blue-*` còn sót đổi sang `brand-*` (token thật `#0f4c81`). KHÔNG đổi logic nghiệp vụ/query nào. tsc + lint (0 lỗi mới) + vitest (185/185) PASS. ✅ **Hiếu đã QA trên staging — OK**, cả 5 trang hiển thị đúng, phân trang mới hoạt động tốt. |
| ✅ **s192+1 (2026-09-05) — Bé Gấu: thêm xuất file (Excel/Word/PDF/CSV)** | Tiếp theo s192 (upload ảnh/file), Hiếu chọn làm nốt gap "xuất file" trong báo cáo đối chiếu Bé Gấu vs Gấu Pro. Tách `buildXlsxFromSql`/`buildDocxFromMarkdown` từ `api/creator-ai/export/route.ts` sang `lib/export-docs.ts` dùng chung; tách FE `ExportBar` (nút CSV/Excel/JSON/PDF/Word) + helper parse marker từ `analytics/creator/ai/page.tsx` sang `components/chat-export.tsx` (nhận prop `apiEndpoint` để trỏ đúng route mỗi agent) — Gấu Pro đổi sang import, KHÔNG đổi hành vi. Route mới `POST /api/chat/export` — khác Gấu Pro ở chỗ mở cho **mọi role đã login** (không chỉ admin/creator, vì Bé Gấu phục vụ cả công ty; cùng mức tin cậy đã có sẵn ở tool executeSQL), rate-limit riêng 20/phút. `BE_GAU_PROMPT` thêm quy tắc xuất file (marker \`\`\`export, tự động xuất bảng >15 dòng) — marker luôn bị ẩn khỏi nội dung hiển thị (không vi phạm rule "không lộ SQL cho user", giống cách Gấu Pro làm). FE Bé Gấu tách message assistant thành component `BeGauMsgContent` (cần `contentRef` riêng cho xuất PDF) — nút xuất tự ẩn khi CHÍNH message đó đang stream dở, tránh flicker vì marker có thể chưa đóng `\`\`\`` xong. tsc + lint (0 error mới) + vitest (185/185) PASS. ✅ **Hiếu đã QA trên staging — OK**, xuất Excel/Word/PDF cho Bé Gấu hoạt động đúng. |
| ✅ **s192 (2026-09-05) — audit UI/UX 32 trang + Bé Gấu: thêm upload ảnh/file** | Theo yêu cầu Hiếu "quét UI/UX mọi tab" + "check Bé Gấu đã có hết tính năng Gấu Pro chưa (ảnh/file/xuất file)". 2 audit song song (đọc code thật, không chỉ tin wiki) → publish Artifact cho Hiếu (không lưu file trong repo, theo đúng convention s190): (1) UI/UX — chỉ 4/32 trang dùng `dashboard-kit.tsx` (StatTile/DataTable), 7 file còn hex sai `#003B95` sót lại (kể cả 1 chỗ trong `analytics/page.tsx` Dashboard dù KPI đã redesign), Staff Performance nặng nhất (16 hex ngẫu hứng); đã xếp lô ưu tiên chi tiết hơn cho "Đợt 4+" của plan `eager-popping-aho.md` (chưa code, chờ duyệt — UI Strict Lock). (2) Bé Gấu vs Gấu Pro — phát hiện s190 đã âm thầm gộp gần hết TOOL Gấu Pro vào Bé Gấu rồi (wiki `tabs/chatbot.md` mô tả cũ, chưa cập nhật); gap thật còn lại là **upload ảnh/file** + **xuất file** (route/FE, không phải tool). **Đã fix ngay gap upload ảnh/file** (xuất file để dành làm riêng, ngoài scope lần này): tách `parseUploadedFile`/`FileContext` từ `creator-ai/chat/route.ts` sang `lib/agents/file-parser.ts` dùng chung 2 agent (tránh chép logic); `be-gau.ts` nhận `fileContexts`, build Gemini parts multimodal (text + `inlineData` cho ảnh/PDF) y hệt cách `runCreatorAI` làm; route `/api/chat` nhận thêm `multipart/form-data` (giữ nguyên nhánh JSON cũ — tin nhắn thường không đổi hành vi); FE `chatbot/page.tsx` thêm nút paperclip + kéo-thả + paste ảnh (Ctrl+V) + chip file đính kèm, giới hạn 5 file/20MB khớp Gấu Pro. tsc + lint + vitest (185/185, gồm `be-gau-runner.test.ts`/`creator-ai.test.ts`) PASS. ✅ **Hiếu đã QA trên staging — OK**, upload ảnh/file cho Bé Gấu hoạt động đúng, tin nhắn thường không bị ảnh hưởng. |
| ✅ **s191 (2026-09-05) — nâng cấp cache + Đợt 1 redesign UI (3 tab thí điểm)** | Theo yêu cầu Hiếu "UI đẹp/chuyên nghiệp hơn cho mọi tab + sửa cache hay lỗi". Kế hoạch đầy đủ: `C:\Users\nhhie\.claude\plans\eager-popping-aho.md` (đã duyệt qua EnterPlanMode, làm theo đợt). **Đợt 1 — cache**: thay `B2B_COST_CACHE_PREFIXES` (prefix-list viết tay, gây ≥3 sự cố lịch sử s168b/s169/s169(c)) bằng `deps` khai NGAY tại chỗ `cachedQuery()` — `flushByDeps(["b2b-cost"])` xoá theo chủ đề thay vì phải nhớ danh sách route. Migration `v47_cache_deps.sql` (thêm cột `deps text[]` + GIN index vào `analytics_query_cache` — Hiếu đã chạy). Audit trước khi sửa: KHÔNG có bug cache-stale nào đang sống, đây là nâng cấp phòng ngừa. **Đợt 2 — bộ giao diện dùng chung**: hoàn thiện `dashboard-kit.tsx` (vốn có sẵn nhưng chỉ 3/32 trang dùng) — `StatTile` (thẻ KPI, màu icon theo Ý NGHĨA số liệu thay vì ngẫu nhiên), `DataTable` (port từ my-metrics, tổng quát cho mọi trang), theme chart dùng chung. **Đợt 3 — rollout thí điểm 3 tab quan trọng nhất** (đã QA qua Chrome trên staging, số liệu y hệt bản cũ): BOD Report (8 card → StatTile), Dashboard (4 KPI đầu trang → StatTile), Quarter Report (sửa hex xanh navy tự đoán sai `#003B95` → `brand-600` thật `#0f4c81`, cùng lỗi đã fix ở my-metrics-charts s167 nhưng chưa ai sửa ở đây — 87+ chỗ). **CHƯA làm**: các tab còn lại (Channels/B2B/B2C rồi tới Website/Staff/Customers/Vendors rồi tới phần còn lại — xem plan file mục "Đợt 4+" để biết thứ tự lô), trong đó Channels + `creator/usage` cũng đang dính CÙNG lỗi hex `#003B95` (chưa sửa, để dành đúng lô của nó). |
| Plan đang chạy | Rebuild toàn diện theo `C:\Users\nhhie\.claude\plans\effervescent-zooming-wilkinson.md` (Hiếu đã duyệt) — Phase 0-6, mỗi phase 1 lần xin xác nhận riêng trước khi merge main. Phase 0-6 đều đã làm xong tách cơ học/hạ tầng (xem session_summary.txt s183-s189); merge main CHƯA xin. |
| ✅ **s190 (2026-09-05) — audit toàn diện + 2 fix thật phát hiện qua audit** | Theo yêu cầu Hiếu "đánh giá toàn diện quy trình/hệ thống/code/OOP/security/UI-UX". Report đầy đủ (21 phát hiện, ưu/nhược + hướng sửa) đã publish Artifact cho Hiếu, không lưu file trong repo. 2 fix đã làm ngay trong lúc audit: (1) **`creator-ai.ts` 2060→750 dòng** — xoá 3 khối code chết cộng dồn 63% file (declarations cũ + implementation cũ của executeSQL/querySupabase/browsePortal/generateImage/... + nguyên khối `if (false) await Promise.all(...)`), tất cả đã bị thay thế hoàn toàn bởi `creator/declarations.ts` + `creator/tools/dispatch.ts` từ trước, không đổi hành vi (giữ nguyên `runReadKnowledgeBase` vì be-gau.ts còn import trực tiếp). (2) **`guardian.ts` — xoá cơ chế policy DB mồ côi**: Hiếu tự kiểm tra Supabase thấy `app_settings.access_policy` còn dữ liệu CŨ đang deny margin_cogs/staff_hr/customer_pii/system_internal cho staff/b2b/b2c/saleb2c/ops-&-cs/product — route UI ghi policy đã xoá từ lúc gộp Bé Gấu/Gấu Pro nhưng `guardCheck()` vẫn đọc override này mỗi request, âm thầm trái với chủ trương "ai cũng như nhau" đã chốt, không ai biết vì hết UI hiển thị. Đã xoá route `/api/config/access-policy` + toàn bộ `loadPolicy`/cache/`DEFAULT_POLICY` dept-branch trong guardian.ts — quyết định giờ cứng trong code, không còn "cấu hình ẩn" nào lệch khỏi ý định. `canViewCogs()` giờ luôn `true`. tsc+eslint+vitest (182/182) PASS cả 2 fix. Dòng cũ trong Supabase vẫn còn nhưng vô hại (code không đọc nữa) — Hiếu có thể tự `DELETE FROM app_settings WHERE key='access_policy'` cho gọn, không bắt buộc. |
| ✅ **Phase 6 (2026-09-05) — vá lỗ hổng quy trình** | Thêm script `lint` thật (`next lint`, trước đây không có dù docs mô tả có). Rule pragmatic cho codebase 285+ file chưa từng lint (no-explicit-any off, vài rule hạ warn) — xem `.eslintrc.json`. Fix 2 bug thật: eslint-disable-comment dùng "—" thay "--" nên không có tác dụng. GitHub Actions CI — Hiếu chọn KHÔNG setup, giữ quy trình tsc-tay. Smoke test route đã migrate — KHÔNG làm được (máy dev thiếu credential DB thật, route crash ngay khi import do client DB khởi tạo dùng env ở module-level). |
| ✅ **Phase 5 (2026-09-04/05, QA xong 2026-09-06) — dọn 4 trang FE khổng lồ, tách cơ học** | `quarterly/page.tsx` 3077→1564 dòng, `channels/page.tsx` 1944→1843, `to-gau/[id]/page.tsx` 2843→1224, `my-metrics/page.tsx` 1809→629. Nguyên tắc: CHỈ move nguyên khung JSX/logic, KHÔNG gộp khối JSX khác nhau. QA Chrome thật xác nhận PASS cho cả 4 file (quarterly/channels đợt trước; to-gau + my-metrics + B2BTierSection tự QA đầy đủ s194 — xem checklist dưới đã tick). Phase 5 hoàn tất hẳn, không còn nợ QA nào. |
| ✅ Phase 0-4 (2026-09-04) | Wiki tái cấu trúc `business/`+`system/` · engine `getKpiFactor`/`getElapsedRatio` + 30 test · fix bug thật All-Time + timezone date-math + migrate BOD/Quarter/B2B sang engine · dọn tàn dư Orders/Order Report · rate-limit Upstash Redis + mở rộng 4 route. Chi tiết: `docs/session_summary.txt` s183-s187. |
| 📌 **Ghi nhớ: Vercel Hobby plan = cron tối đa 1 lần/ngày/job** | Từng gây FAIL deploy ~2 tiếng (s167 đặt cron 3h/lần) — khi thêm cron mới, luôn set tối đa 1x/ngày. |
| 📌 **Ghi nhớ: máy dev KHÔNG có `web/.env.local`** | Không chạy được dev server / `next build` collect-page-data / query gohub_dw-Supabase thật. tsc + vitest (unit, mock DB) là lưới an toàn duy nhất chạy được tại chỗ — mọi thay đổi chạm DB/UI cần Hiếu tự QA trên staging. |

---

## Việc Hiếu cần làm (còn mở)

- [ ] **s195+18 — QA stream token thật Bé Gấu + Gấu Pro trên staging** — mở cả 2 chat, hỏi 1 câu cần vài
  giây (BI/phân tích), xác nhận: (a) chữ CHẠY DẦN theo thời gian thực thay vì im lặng rồi bung nguyên cục
  như trước; (b) nội dung không lặp/không thiếu đoạn nào so với trước; (c) Gấu Pro: status "đang tìm
  kiếm/đang query..." vẫn hiện đúng lúc tool đang chạy, biến mất đúng lúc câu trả lời bắt đầu chảy chữ; (d)
  nguồn tham khảo (Bé Gấu) + nút export/followup (Gấu Pro) vẫn hiện đúng ở cuối như trước.
- [ ] **s195+17 — QA toàn bộ AI sau khi đổi model gemini-3.8-flash (mọi agent, không chỉ Bé Gấu)** — sau
  khi Vercel deploy staging: (a) Bé Gấu + Gấu Pro — hỏi 1 câu BI nhiều bước mỗi bên, xác nhận đúng/không
  chậm/không lỗi JSON; (b) nếu tiện, thử nhanh usage-stats classify/evaluate, Tổ Gấu AI (group chat),
  config/schema AI-suggest (nút gợi ý mô tả bảng ở Dev Tools) — các đường ít traffic hơn nên rủi ro thấp
  hơn nhưng chưa ai verify. Theo dõi Gemini API cost vài ngày đầu (model mới có thinking tokens tính phí
  dù đã set thinkingLevel thấp ở các agent chính).
- [ ] **s195+15 — QA tab B2C Advanced trên staging (fix query timeout)** — sau khi Vercel deploy: mở
  `/analytics/b2c` (sub-tab Advanced, mặc định), xác nhận (a) trang load nhanh/không còn timeout, (b) số
  Customers New/Returning khớp bản trước (nếu badge "Admin API lỗi" hiện — báo lại, nghĩa là đang fallback
  DB, vẫn đúng số nhưng nên biết để check `ADMIN_GOHUB_*` env).
- [ ] **s195+13 — GA4 Category Performance (3 section mới của Minh) không render — cần debug tiếp** —
  code có trong `b2c-advanced-dashboard.tsx`, build sạch, không lỗi console/network, nhưng chỉ 6/9 Section
  hiện ra trên trang B2C Advanced (thiếu "GA4 Web Category Performance"/"GA4 App Category Performance"/
  "GA4 Conversion Rate Charts"). Đã điều tra sâu (console/network/DOM query/raw JS bundle/build log Vercel)
  không tìm ra nguyên nhân. Không chặn gì khác (mọi thứ còn lại đã QA đúng). Gợi ý: hỏi Minh xem anh ấy đã
  tự thấy 3 section này chạy được ở branch riêng chưa (commit cuối "Clarify..." còn dở dang) — nếu Minh
  cũng chưa từng thấy nó chạy thì có thể là bug có sẵn từ code gốc của Minh, không phải do merge.
- [ ] **s195+11 — Inventory: hỏi Sapo/ETL bổ sung 3 nguồn dữ liệu (không gấp, khi rảnh)** — đã verify thật
  trên staging là hệ thống KHÔNG có: (1) "ngày nhập kho của lô" trong `fact_inventory` (chỉ có `date`
  snapshot + `expired_date`), (2) `fact_inventory.batch` (cột có nhưng ETL Sapo chưa sync, luôn NULL),
  (3) ICCID theo tồn kho vật lý (chỉ có ICCID trong `fact_data_usage`/`data_usage_log`, dùng cho usage
  3HK, khác hẳn). 3 mục OPS xin (lô/ngày nhập/export ICCID) cần Sapo/ETL bổ sung nguồn trước — không tự
  code thêm được (Hiếu không có DDL trên gohub_dw). Còn lại (VN/US, SIM/eSIM, cảnh báo, số bán tuần trước,
  ngưỡng tự cấu hình, Export Excel) đã xong, đã tự QA — không cần Hiếu làm gì để dùng ngay.
- [ ] **s195+8/+9/+10 — QA tab Vendors trên staging** — sau khi Vercel deploy xong 3 commit fix (default
  vendor 0 số liệu / Channel Distribution trống / Strategic phân loại sai): mở `/analytics/vendors`, xem
  (a) load lần đầu tự chọn đúng vendor 3HK DATAPOOL có số liệu thật; (b) bảng Channel Distribution có dữ
  liệu; (c) đối chiếu vài kênh Strategic đã biết ở Quarter Report — Vendors giờ phải gắn đúng nhóm
  B2B-Strategic. Nếu vẫn thấy sai, báo cụ thể tên kênh để điều tra tiếp.
- [ ] **s195+7 — Orders thiếu đơn SIM vật lý: tự verify giả thuyết** — đổi toggle "Fulfillment"→"Created"
  ở đầu trang `/analytics/orders`, xem đơn SIM vật lý có hiện ra không. Có → đúng nguyên nhân
  `fulfiled_date` NULL (khâu ops/ETL nguồn, không phải bug web). Không → báo lại để điều tra tiếp hướng
  khác. Xem `docs/wiki/system/tabs/analytics-orders.md` mục Gotchas.
- [ ] **s195+4 — API sản phẩm cho manager: chạy migration v52 + tạo key + gửi manager** —
  (1) Chạy `web/db/migrations/v52_external_api_keys.sql` trên Supabase, nhớ Reload schema (Database → API
  → Reload schema, hoặc `NOTIFY pgrst, 'reload schema';`) — đúng gotcha đã gặp ở v51. (2) Vào `/admin` →
  tab "API bên ngoài" → tạo key, đặt label rõ (vd "Manager - CRM tool") → copy key gửi manager (chỉ hiện 1
  lần). (3) Gửi manager 2 endpoint: `GET /api/external/products`, `GET /api/external/skus` (header
  `Authorization: Bearer <key>`) — xem `docs/wiki/system/tabs/admin-product.md` mục 4 để biết field trả
  về. (4) Test thử `curl` xác nhận trả đúng data + COGS trước khi gửi manager.
- [x] **s195+3 — Bridge multi-tenant — XONG (2026-09-07), Hiếu đã tự QA với acc khác** — migration v51 đã
  chạy; gặp gotcha PostgREST schema cache chưa nạp bảng mới (`Could not find table 'browser_bridge_pairings'
  in schema cache`) → fix bằng "Reload schema" trong Supabase Dashboard (Database → API) hoặc
  `NOTIFY pgrst, 'reload schema';` — không phải bug code, xem wiki mục "s195+3" phần Gotcha. Acc khác tự
  tạo token + pair thành công, xác nhận hoạt động độc lập với token Hiếu. Xác nhận thêm: hoạt động trên
  Microsoft Edge (và mọi trình Chromium khác) — chỉ đổi `chrome://extensions` → `edge://extensions`, code
  không cần sửa gì (dùng chung API `chrome.*`).
- [x] **s195+1/+2 — Gấu Pro Extension + Auto + fix Enter — XONG, Hiếu đã tự QA** — đã pair, list_tabs +
  fill (kèm `press_enter`) hoạt động đúng. Xem mục "s195+1"/"s195+2" trong wiki.
- [x] **s195 — Gấu Pro `browseWeb` — XONG (2026-09-07), Hiếu đã tự QA trên staging** — migration v49 đã
  chạy; container `ghcr.io/browserless/chromium` tự host trên Render free tier (`browserless-gohub`) +
  keep-alive cron-job.org (10 phút/lần, KHÔNG dùng GitHub Actions — bài học cũ repo); env
  `BROWSERLESS_WS_URL`/`BROWSERLESS_TOKEN` đã set Vercel + redeploy. Hỏi Gấu Pro mở 1 URL thật → trả đúng
  nội dung. Xem `docs/wiki/system/tabs/analytics-creator-ai.md` mục "s195".
- [ ] **s194+12 — QA bằng acc creator/admin: Users, Settings, Admin (Product), Dev Tools** — UI Lô 5 đã fix
  màu (hex sai `#003B95` → brand, fix thêm bug `brand-900/950` không tồn tại làm vài chỗ mất màu ở Channels/
  Staff/Vendors/Bé Gấu). Acc test của tôi chỉ có quyền `bod` nên bị chặn ở 4 trang này (đúng thiết kế,
  không phải bug) — cần Hiếu tự đăng nhập bằng acc creator/admin xem 1 lượt cho chắc. To-Gau + phần còn lại
  đã tự QA qua Chrome bằng acc bod — OK.
- [x] **s194+6/+7 — Tổ Gấu panel Câu hỏi + AI trích nguồn — XONG (2026-09-06), đã tự QA Chrome** — migration
  v48 Hiếu đã chạy, đặt câu hỏi/đổi trạng thái/trả lời PASS, AI trích nguồn đúng. Fix kèm theo: model
  `gemini-2.0-flash` bị khai tử làm Gấu Tổ AI chết 500 âm thầm 6 ngày (2026-08-31 tới nay) — đã đổi sang
  `gemini-3.6-flash` (3 route). Không cần làm gì thêm, Hiếu hỏi thử Gấu Tổ 1 câu cho yên tâm là được.
- [x] **s194 — QA thị giác B2B + B2C — XONG (2026-09-06), tự QA qua Chrome trên staging** — B2B: 5 StatTile
  Actual + 5 StatTile Projected (đổi filter sang tháng đang chạy để hiện đủ 2 khối) đều đúng icon/màu, badge
  vs Prev Period đúng dấu +/-, chart Revenue&CM1 đúng brand palette, bảng Tier Performance render đúng. B2C
  Advanced: hero card + 6 KPI mini-card đúng icon/viền màu, dot màu kênh (VN=xanh dương/US=tím/Web=teal/
  App=xanh lá) hiện đúng ở mọi bảng breakdown (RollingTable/Doanh thu B2C & Breakdown), chart area màu brand
  đúng. B2C Metric: 6 StatTile đầu trang đúng màu, dot Web/App đúng convention trong bảng. Không phát hiện
  lỗi nào, số liệu không đổi so với trước.
- [x] **s194+9 — UI Channels (nốt lô 2) — XONG (2026-09-06), tự QA qua Chrome trên staging** — chart palette
  chung + `blue-*`→`brand-*` toàn trang + modal Manage Costs, StatTile đã có sẵn từ trước. Không phát hiện
  lỗi, số liệu không đổi. **Lô 2 (Channels/B2B/B2C) coi như hoàn tất hẳn** — lô tiếp theo: Website/Staff/
  Customers/Vendors (lô 3, xem `C:\Users\nhhie\.claude\plans\eager-popping-aho.md` mục "Đợt 4+").
- [x] **GA4 App connect — XONG (2026-09-06)** — Hiếu cấp quyền Viewer + chạy SQL thêm entry `gohub-app`
  vào `app_settings.ga4_configs`. Đã tự QA qua Chrome thật trên staging: toggle Web/App tab Website ra
  đúng data mỗi lần (kể cả bấm nhanh liên tục App→Web→App). Trong lúc QA phát hiện thêm 1 race condition ở
  chính fix này (useEffect đổi site SAU platform → 2 fetch chồng nhau, response về không theo thứ tự có
  thể kẹt UI ở data site cũ) — đã sửa gộp chung 1 handler `switchPlatform()`, xem
  `docs/wiki/system/tabs/analytics-website.md` mục "s194". Không cần làm gì thêm.
- [ ] **s191 — QA thị giác 3 tab vừa đổi UI trên staging** (BOD Report/Dashboard/Quarter Report — đã tự QA
  qua Chrome, số liệu khớp bản cũ, nhưng Hiếu nên tự xem 1 lượt trước khi làm tiếp lô tab kế) — xem plan
  `C:\Users\nhhie\.claude\plans\eager-popping-aho.md` để biết lô tiếp theo (Channels/B2B/B2C).
- [ ] **s190 audit — quyết định lại quyền `bod` cho sub-tab SQL Query** (Dev Tools): mất khi gộp SQL
  Explorer vào Dev Tools (vốn chỉ admin/creator) — nếu bod cần lại, báo để tách check quyền riêng.
- [ ] **s190 audit — (không gấp) dọn tay hàng `access_policy` trong Supabase** `app_settings` — code đã
  không đọc nữa (xem dòng s190 ở trên), xoá cho gọn hay để cũng không sao.
- [x] **Phase 5 — QA UI to-gau + My Metrics + B2BTierSection — XONG (2026-09-06), tự QA qua Chrome** —
  to-gau: `SettingsModal` (icon/tên/mô tả/thành viên/AI scope) ✅, `DocsPanel` (Chính thức = wiki, Của
  nhóm→Docs) ✅, `NotesPanel` (Của nhóm→Notes, ghi chú dùng chung) ✅, `WikiPanel` (tab Chính thức) ✅, upload
  file+ảnh (test upload thật, preview thumbnail đúng) ✅, @mention (gõ `@` ra picker đúng, chip mention có
  sẵn render đúng trong lịch sử chat) ✅, xoá tin (nút "Thu hồi" xác nhận có trong menu hover tin nhắn, không
  bấm thật để tránh xoá dữ liệu thật) ✅. My Metrics: `EvidenceCard`/`LarkReviewPanel` (mở case đã từ chối)
  ✅, `SkuScanSection` ✅, `BegauInsightsSection` — xác nhận qua DOM/console (data load đúng, bảng quality +
  chart topUsers + tag topKeywords đều có data thật, 0 lỗi console) dù ảnh chụp Chrome tự động bị chụp hụt
  đúng vùng này nhiều lần liền — đã soát kỹ (màu/opacity/filter/transform DOM đều bình thường, không phải
  bug CSS thật) → kết luận là hạn chế của tool chụp màn hình tự động, không phải lỗi app; Hiếu liếc qua 1
  lần cho chắc khi rảnh — ✅, `LarkConfigModal` (Cấu hình Bé Gấu quét Lark) ✅, `DatapoolDetailTable` (2210
  SKU, filter vendor + search) ✅. B2BTierSection đã QA ở đợt trước (mục tính năng Sản phẩm/Biểu đồ). Phase
  5 coi như hoàn tất hẳn.
- [ ] **Phase 4 — tạo tài khoản Upstash Redis** (free tier) + set `UPSTASH_REDIS_REST_URL`/
  `UPSTASH_REDIS_REST_TOKEN` trên Vercel (Production + Preview) để rate-limit chặn thật cross-instance —
  chưa set vẫn chạy đúng như in-memory cũ, chỉ chưa có lợi ích cross-instance.
- [ ] **s173 — xác nhận đã Kết nối Lark cá nhân** (Creator Settings) + **bot đã add vào group Sales/PIC
  liên quan** — 2 điều kiện để bot My Metrics capture real-time hoạt động (Lark chỉ gửi event cho group
  bot LÀ THÀNH VIÊN, không tự động hoá được).
- [ ] **s163 — chạy migration `v43_kb_wiki_group_scope.sql`** trên Supabase nếu chưa (kiểm tra lại — có
  thể đã chạy, chưa xác nhận gần đây).
- [ ] Liên hệ DB owner gohub_dw cho Looker Studio / Power BI.
- [ ] **Portal Affiliate**: nhập App ID + Secret Shopee Affiliate Open API.
- [ ] **BC Datapool — lấy appSecret đúng từ BC support** (AppSecret hiện tại luôn trả `[1008] Signature
  verification failed`, formula đúng spec nhưng secret sai).
- [ ] **Cà Thread**: thêm bot Bé Gấu vào group Lark + bật scope `im:message` &
  `im:message.reaction:readonly` + publish version mới.
- [ ] **GA4 App connect**: add service account
  `ais-gemini-key-88b236e5f62d4cf@612144486106.iam.gserviceaccount.com` Viewer vào property `465150028`
  (Firebase Console → Project Settings → Integrations → GA → Manage → Property Access Management) → thêm
  entry `gohub-app` vào `app_settings.ga4_configs` Supabase.

**Ghi chú:**
- Quarter Report: target CM1 KH nhập là target QUÝ (không nhân × 3).
- Daily 【3】 theo QUÝ; nếu hiện "Chưa nhập target quý" → Hiếu nhập ở tab Quarter Report.
- Bé Gấu: Lark slow (skip — giới hạn kiến trúc).

---

## Migrations đã chạy (mốc gần nhất)

v31–v42 (cũ, xem session_summary.txt nếu cần chi tiết) · **v43** `kb_wiki_pages.visibility_mode` +
`kb_wiki_page_groups` (⚠️ xác nhận lại đã chạy chưa — xem checklist trên) · **v44**
`okr_evidence_records`/`okr_sku_tags` · **v45** `okr_lark_events` + nới `okr_sku_tags.effective_date` ·
**v46** `okr_lark_message_log` — tất cả v44-v46 Hiếu đã xác nhận chạy. · **v47** `analytics_query_cache.deps` (Hiếu đã xác nhận chạy 2026-09-05) · **v48** `chat_questions` (Hiếu đã chạy, đã QA xong 2026-09-06) ·
**v49** `creator_kb.owner_username` + `chatbot_learning_log.target_owner_username` (chuẩn bị multi-tenant,
CHƯA đổi hành vi — Hiếu đã chạy 2026-09-07) · **v50** `browser_bridge_commands` (hàng đợi lệnh Extension —
Hiếu đã chạy, đã QA xong bridge hoạt động 2026-09-07) · **v51** `browser_bridge_pairings` + `owner_username`
(bridge multi-tenant — Hiếu đã chạy + đã reload PostgREST schema cache, đã QA xong với acc khác 2026-09-07) ·
**v52** `external_api_keys` (API sản phẩm cho manager — ⚠️ Hiếu CẦN CHẠY, chưa xác nhận — nhớ Reload schema
Supabase sau khi chạy).

---

## Đọc theo thứ tự khi bắt đầu session mới

> ⚠️ **Multi-machine**: `Bug.txt`, `new_info.txt`, `docs/ERRORS.md`, `docs/SYSTEM.md`, `docs/CHANGELOG.md` bị **gitignore** (local-only trên máy gốc của Hiếu, KHÔNG sync qua git — xem commit `4b47996` "docs chỉ commit wiki — gỡ internal docs khỏi remote"). Trên máy mới clone/checkout, các file này **có thể không tồn tại** — bình thường, không phải lỗi, đừng báo "thiếu file". Dùng bước 2–3 dưới đây làm nguồn thay thế đầy đủ.

1. **CLAUDE.md** (file này) — trạng thái + rules
2. **`docs/session_summary.txt`** — log chi tiết từng session (nếu có trên máy) — context lịch sử, thay `docs/CHANGELOG.md`. Đọc từ cuối file lên (session mới nhất trước).
3. **`docs/wiki/`** (**git-tracked, LUÔN có** trên mọi máy, tái cấu trúc s183 2026-09-04 thành 2 khu
   `business/` + `system/`) — nguồn tham chiếu đầy đủ nhất, đọc hết 1 lần đầu session (hoặc khi được yêu
   cầu "đọc hệ thống"):
   - `docs/wiki/system/*.md` — kiến trúc hệ thống, chatbot 7-agent + Guardian, Operations Runbook, quy
     trình vận hành (thay `docs/SYSTEM.md`)
   - `docs/wiki/system/analytics-data-model.md` — đọc TRƯỚC mọi tab analytics khác (bảng fact/dim,
     `getAnalyticsSource`, filter chuẩn dùng chung)
   - `docs/wiki/system/tabs/*.md` — 1 file/tab web: mục đích · luồng data · API · công thức · **Gotchas**
     (mỗi tab có mục riêng — dùng thay `docs/ERRORS.md` khi file đó vắng mặt)
   - `docs/wiki/business/*.md` — nghiệp vụ dạng văn bản đọc (mã SKU/Item, COGS 3HK, vendor priority, combo
     chuẩn, import NCC...) — viết cho CS/Sale/Product, KHÔNG dùng bảng
4. **`new_info.txt`** (nếu có) — tick ✅ items chưa xong
5. **`docs/ERRORS.md`** (nếu có) — lỗi hay gặp; nếu KHÔNG có trên máy → tra mục "Gotchas"/"Vấn đề đã gặp" trong `docs/wiki/system/tabs/*.md` hoặc log lỗi trong `docs/session_summary.txt`
6. **`Bug.txt`** (nếu có) — khi user báo có bug

---

## Rules bắt buộc

1. **Staging-first** — mọi thay đổi lên `staging`. KHÔNG push thẳng `main`.
2. **KHÔNG tự merge** staging → main dù staging PASS, chờ Hiếu yêu cầu rõ ràng.
3. **UI Strict Lock** — không đổi màu/bố cục/font/chart analytics mà không có chỉ thị từ Hiếu/Bảo.
4. **Wiki sync** — sửa tab nào → cập nhật `docs/wiki/system/tabs/<tên-tab>.md` ngay cùng lần.
5. **Commit + push sau mỗi task** — không batch nhiều task thành 1 commit lớn.
6. **tsc trước khi push** — `npx.cmd tsc --noEmit` (PowerShell, không phải `npx tsc`). `npm run lint`
   (`next lint`, từ s189) cũng nên chạy — không chặn nhưng cảnh báo dead code thật.

---

## Coding rules

- Minimum code giải quyết đúng vấn đề — không thêm abstraction/feature ngoài yêu cầu.
- Chỉ touch những gì cần — không refactor code không liên quan.
- Không comment giải thích "what" — chỉ comment "why" khi thật sự không rõ.
- Tự test/fix/push, chỉ hỏi khi thao tác web hoặc chưa rõ ý tưởng.
- Mọi lỗi UI hiện: "Hiếu đang fix, vui lòng đợi".
- **Luôn tự chọn role chuyên gia phù hợp trước khi làm task không nhỏ** (Staff Engineer/Design Lead/Senior
  Data Analyst/DevSecOps...) — nêu 1 dòng ngắn rồi làm, không kể lể dài. Yêu cầu cố định của Hiếu (2026-09-06).

---

## Ghi tài liệu

| Nội dung | File đích |
|---|---|
| Lỗi gặp + cách fix + lesson learned | `docs/ERRORS.md` |
| Lịch sử session / thay đổi lớn | `docs/CHANGELOG.md` |
| Bug tracker (danh sách thô) | `Bug.txt` |
| Session log chi tiết | `docs/session_summary.txt` (append) |
| Kiến trúc hệ thống | `docs/SYSTEM.md` |
| Wiki từng tab (kỹ thuật) | `docs/wiki/system/tabs/<tên-tab>.md` |
| Wiki nghiệp vụ (sản phẩm/vendor/giá) | `docs/wiki/business/<tên-bài>.md` — văn bản, không bảng |
| Audit số analytics | `docs/AUDIT_ANALYTICS.md` (local, gitignored) |
| Agent/prompt changes | `.ai/agents/AGENTS.md` |

---

## Stack nhanh

- **Next.js 14** App Router · **Vercel** · **Supabase** (products/KB/config) · **gohub_dw** GCP Postgres (analytics, read-only) · **Turso** (b2b costs, config)
- Analytics DB: Hiếu không có quyền DDL trên gohub_dw
- Vercel env: `TURSO_URL`, `TURSO_AUTH_TOKEN`, `SUPABASE_SERVICE_KEY`, `CRON_SECRET`, `ANALYTICS_DB_*` (phải tick scope Preview)
- Chatbot chính: **Bé Gấu** (`be-gau.ts`, single function-calling agent, s131+) — pipeline 6-agent cũ = legacy
- Creator AI: **Gấu Pro** (`creator-ai.ts`, 16+ tools, Wave 1: trend + image gen)
- FE design: xem `.ai/FESkill.md`
- Coding rules chi tiết: `.ai/CLAUDE.md`
