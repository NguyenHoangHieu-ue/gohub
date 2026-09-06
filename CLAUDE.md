# CLAUDE.md — GoHub Intel · START HERE

> File này auto-load mỗi session. Đọc hết trước khi làm bất cứ thứ gì.
> Lịch sử chi tiết từng session nằm ở `docs/session_summary.txt` (đọc từ cuối lên) — file này CHỈ giữ
> trạng thái hiện tại + rule + checklist việc còn phải làm, không giữ narrative cũ (rút gọn s189 2026-09-05).

---

## Trạng thái hiện tại (2026-09-06, s194)

| | |
|---|---|
| Branch làm việc | `staging` (làm việc ở đây, merge main **CHỈ khi Hiếu yêu cầu RÕ RÀNG** trong chính tin nhắn đó) |
| tsc + `next build` + `next lint` + vitest | PASS (lint: 0 error mới; vitest 185/185) |
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

- [ ] **s194 — QA thị giác B2B + B2C trên staging** (B2B: KPI cards StatTile + màu brand-*/chart palette;
  B2C Advanced: icon/dot màu theo kênh (VN/US/Web/App) xuyên suốt, KPI card có màu; B2C Metric: thêm dải
  StatTile + header gradient + dot Web/App — số liệu cả 3 KHÔNG đổi, chỉ presentation) — xong thì làm tiếp
  Channels (lô 2, còn lại) hoặc chọn lô khác.
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
**v46** `okr_lark_message_log` — tất cả v44-v46 Hiếu đã xác nhận chạy. · **v47** `analytics_query_cache.deps` (Hiếu đã xác nhận chạy 2026-09-05).

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
