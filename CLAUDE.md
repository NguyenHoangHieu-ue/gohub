# CLAUDE.md — GoHub Intel · START HERE

> File này auto-load mỗi session. Đọc hết trước khi làm bất cứ thứ gì.

---

## Trạng thái hiện tại (2026-08-31, s170)

| | |
|---|---|
| Branch làm việc | `staging` (làm việc ở đây, merge main **CHỈ khi Hiếu yêu cầu RÕ RÀNG** trong chính tin nhắn đó) |
| tsc + `next build` | PASS |
| ⏳ Trên staging CHƯA merge main | s170(a) bỏ filter SG/HK Orders **ĐÃ merge main**. s170(b) audit+vá bảo mật Tổ Gấu (`4c7ed75`) + s170(c) Weekly Report feature (commit tiếp theo) — **CHƯA merge main**, chờ Hiếu QA staging (đặc biệt: PNG card ảnh CHƯA verify được trên máy dev Windows, xem gotcha trong mục s170(c) dưới). |
| ✅ Đã lên main | ...+ s169 audit toàn diện B2B Performance ↔ Quarter Report + s170(a) bỏ filter SG/HK Orders (đến `476eb20`, 2026-08-31) |
| 🆕 **s170(c) — Weekly Report: ĐÃ CODE XONG, CHƯA VERIFY ẢNH TRÊN LINUX** | Nút "Create Weekly Report" (tab Scheduled Messages) hoạt động end-to-end (data/docx/pdf tested), nhưng bước vẽ card ảnh (`next/og` `ImageResponse`) lỗi TRÊN MÁY DEV WINDOWS do bug path Windows trong `@vercel/og` bundled — production (Vercel Linux) tin là KHÔNG dính (đã chứng minh bằng phân tích lỗi, xem chi tiết dưới). **Hiếu BẮT BUỘC bấm thử nút này trên staging trước khi tin dùng** — nếu ảnh card lỗi/trống trên staging thật, báo lại ngay. |
| ⚠️ **Deploy Vercel bị FAIL ~2 tiếng (2026-08-27 05:54-07:xx UTC)** | Cron `my-metrics-lark-scan` trong s167 đặt `0 */3 * * *` (3 giờ/lần) — **project trên Vercel Hobby plan chỉ cho cron chạy tối đa 1 lần/ngày** → Vercel REJECT thẳng deployment (GitHub commit status "Vercel: Deployment failed" trỏ `vercel.com/docs/cron-jobs/usage-and-pricing`), khiến MỌI deploy sau đó (cả staging lẫn main) không lên được, không chỉ riêng My Metrics. Đã fix: đổi `0 10 * * *` (1x/ngày, 17:00 ICT). **Nhớ khi thêm cron mới sau này: Hobby plan = tối đa 1 lần/ngày/cron job.** |
| 📊 **Số thật My Metrics Q3-2026 — query trực tiếp Supabase 2026-08-27 17:xx ICT** | SLA + Vendor Speed: **0 case cả 2** (0 manual, 0 Lark) suốt quý — bot Lark ĐÃ cấu hình đúng (`app_settings.my_metrics_lark_scan_config`: `chat_id=oc_95d72ac79dd09df585e974c0b71221b3`, `enabled=true`, `days_back=30`) nhưng **CHƯA CHẠY LẦN NÀO** tính tới lúc query (`okr_lark_events` 0 dòng mọi status). Bé Gấu tasks: **291/450 (64.7%)**, Web 291 · Lark 0 — đúng tiến độ (63.0% thời gian quý đã qua). SKU GM + %Datapool Rev: không query được (cần `gohub_dw`, máy dev không có `ANALYTICS_DB_*`). Đã tạo `D:\gohub\Report_Aug.docx` (báo cáo tháng 8 cho Bảo, file cá nhân KHÔNG commit git) điền sẵn 3/5 số thật, còn 2 số Hiếu tự điền từ My Metrics. |

**s170(c) — Weekly Report (2026-08-31): ĐÃ CODE XONG theo spec Hiếu chốt (đọc file mẫu `Company Weekly
Performance.pdf` + 4 quyết định kỹ thuật Hiếu trả lời trực tiếp trong chat).**

Nút **"Create Weekly Report"** trong tab **Scheduled Messages** (`/analytics/scheduled`, cạnh nút "Lịch mới",
cùng quyền `canWriteScheduled`) → gọi `POST /api/admin/scheduled-messages/weekly-report` → BE tính số liệu +
render 2 file → trả JSON `{docx, docxFilename, pdf, pdfFilename}` (base64) → FE tự tải cả 2 file cùng lúc.

**Quyết định Hiếu chốt → cách làm:**
1. Ảnh minh chứng = **tự vẽ lại bằng code** (không Puppeteer) — dùng `next/og` `ImageResponse` (built-in
   Next.js 14, KHÔNG cần thêm dependency nào, KHÔNG cần canvas/browser). Mỗi card LUÔN in tên tab nguồn số liệu
   (theo đúng yêu cầu, vd "B2C Performance", "Vendor Performance") ở header card.
2. PDF hoá ra **dễ** (đã verify `jsPDF` — vốn đã có sẵn trong deps — chạy được thuần Node kể cả `addImage()`,
   KHÔNG cần DOM/canvas như tưởng) → làm CẢ 2 định dạng, không chỉ Docx.
3. Đã bổ sung chèn ảnh cho converter markdown→docx hiện có — tách `markdownToDocx` từ
   `api/creator-ai/export/route.ts` ra `web/src/lib/docx-markdown.ts` (dùng chung, KHÔNG đổi hành vi cũ) + thêm
   cú pháp marker `![[IMG:key]]` → `ImageRun` (co theo tỉ lệ, tối đa 600px ngang). `creator-ai/export` route giờ
   import từ lib này thay vì định nghĩa riêng.
4. Viết route/logic mới tính **pro-rata tháng này vs actual tháng trước, theo TỪNG channel** (B2B: Klook/
   ShopeePay/MoMo/VN-Wholesales/...; B2C: VN-Web SIM/VN-Web eSIM/Mobile App/...) — `fetchChannelMoM()` trong
   `lib/weekly-report/data.ts`, filter khớp B2B Performance tab (`shipFilter`/`internalOpsFilterByCode`/
   `excludeInactiveCustomers`/`excludeOpsByCode` từ `quarterly-settings`).

**File mới** (toàn bộ ở `web/src/lib/weekly-report/`):
`period.ts` (tính tuần trước Mon-Sun + MTD/tháng trước, ICT) · `data.ts` (`buildWeeklyReportData()` — TÁI DÙNG
`fetchBODGroupMarginData` (bod-data.ts) cho GP/CM1 B2B/B2C khớp BOD/Quarter Report, không viết công thức cost
riêng) · `narrative.ts` (Gemini `gemini-3.6-flash` JSON-mode viết 1 câu nhận định/channel — CHỈ diễn giải số đã
tính sẵn, cấm bịa nguyên nhân ngoài data, đúng pattern precompute→format của `scheduled-report-data.ts`; lỗi
Gemini → fallback câu template) · `card-images.ts` (vẽ 6 card qua `ImageResponse`, viết `.ts` KHÔNG JSX —
`React.createElement` thuần — để không phụ thuộc cấu hình jsx của bộ build đang chạy) · `report-content.ts` (build
markdown + ảnh — 1 NGUỒN NỘI DUNG DUY NHẤT cho cả docx lẫn pdf) · `docx-export.ts` (wrap `markdownToDocx` +
header/footer, port từ `creator-ai/export`) · `pdf-export.ts` (`markdownToPdf` viết riêng bằng `jsPDF` — heading/
bullet/table/ảnh/bold, layout tay vì jsPDF không tự parse markdown).

**Route**: `web/src/app/api/admin/scheduled-messages/weekly-report/route.ts` — `maxDuration=180` (nhiều query
gohub_dw + Gemini + render ảnh + docx/pdf, giống cron scheduled-messages).

**⚠️ Đã verify được (vitest, mock `card-images` để cô lập) — CHẮC CHẮN đúng:** markdown→docx (bảng, heading, ảnh
`ImageRun` — 7/7 ảnh embed đúng qua `word/media/`), markdown→PDF (`%PDF-1.3` hợp lệ, `jsPDF.addImage` hoạt động),
toàn bộ pipeline data→content→file với data giả lập khớp cấu trúc `WeeklyReportData`. `npx.cmd tsc --noEmit` +
`next build` PASS.

**⚠️ CHƯA verify được trên máy dev — cần Hiếu QA trên staging TRƯỚC KHI TIN DÙNG:** bước vẽ card ảnh
(`ImageResponse`/`next/og`, dựa trên `@vercel/og` bundled sẵn trong Next.js) lỗi `TypeError: Invalid URL` khi
chạy `next dev` THẬT trên máy Windows này — root cause xác định rõ qua log lỗi (`input:
".\file:\D:\...\noto-sans-v27-latin-regular.ttf"`): code nội bộ `@vercel/og` gọi
`path.join(import.meta.url, "../noto-sans...ttf")` rồi `fileURLToPath()` — trên Windows, `path.join` (win32,
dùng `\`) phá cú pháp chuỗi `file://` URL (vốn dùng `/` và `:`). Đây là bug Windows-path THUẦN TUÝ của thư viện
(không phải lỗi trong code card-images.ts của mình) — trên Vercel (Linux, `path.posix.join`) không dính lỗi này
(đã đối chiếu: input lỗi thấy đúng dạng "path.join làm hỏng URL windows-style", trên POSIX join 2 chuỗi `/`-
separated ra URL hợp lệ). Tin production hoạt động đúng (next/og là tính năng chính thức, phổ biến rộng rãi trên
Vercel) nhưng **CHƯA có bằng chứng thực tế trên môi trường thật** → **Hiếu PHẢI bấm thử nút "Create Weekly Report"
trên staging, kiểm tra card ảnh trong 2 file xuất ra không rỗng/lỗi, báo lại ngay nếu có vấn đề.**

**Số liệu — CHƯA verify với DB thật** (máy dev thiếu `ANALYTICS_DB_*`, như mọi tính năng khác gần đây) — mọi
công thức dựa trên tái dùng helper/hàm ĐÃ CÓ (`fetchBODGroupMarginData`, `getAnalyticsSource`, `getDateFilter`,
`getProjectionFactor`, các filter chuẩn `excludeInactiveCustomers`/`shipFilter`/`internalOpsFilterByCode`) nên
tin khớp logic các tab đã verify trước đó, nhưng Hiếu cần tự đối chiếu 1-2 số trên staging với Dashboard/BOD/B2B/
B2C/Vendor Performance thật trước khi gửi báo cáo cho sếp.

**Không như file mẫu 100%** (cố ý, đã giải thích lý do): file mẫu gốc do Hiếu tự làm tay có nhiều mâu thuẫn nội
bộ (bảng Weekly WoW ghi "17-23/8" trong khi mô tả đầu bài nói "24-30/8" — chính là lý do CẦN tự động hoá).
Report tự động LUÔN nội bộ nhất quán (1 lần fetch data, mọi section dùng chung tham số ngày). Nhận định
"Điểm sáng/Hạn chế" do Gemini viết dựa CHỈ trên %MoM đã tính — sẽ khách quan/chung chung hơn bản Hiếu viết tay
(không có breakdown theo quốc gia như "Philippines +64%" trong file mẫu — ngoài scope v1, cần thêm dimension
nếu muốn sâu hơn).

**s168b/s169 — đã làm (2026-08-28): audit toàn diện B2B Performance ↔ Quarter Report — 7 bug thật (CM1 sai + cache
không đồng bộ), theo yêu cầu Hiếu "check kỹ, tìm vấn đề, lên plan fix/test/check thật kỹ, kiểm tra cả subtab/
sub-channel".**
1. **B2B Performance thiếu lọc KH INACTIVE** (`b2b/kpis`, `b2b/performance`, `b2b/trend`) — Quarter Report lọc
   KH `price_list_name` chứa "INACTIVE" từ lâu, 3 route B2B Performance thì không → Revenue/GP/CM1 cao hơn
   Quarter Report có hệ thống bất cứ khi nào có KH INACTIVE phát sinh trong kỳ. Thêm helper dùng chung
   `excludeInactiveCustomers()` (`analytics-helpers.ts`). Nhân tiện vá `b2b/trend` thiếu LUÔN cả 3 filter chuẩn
   (`includeShip`/`includeInternalOps`/`includeOpsCustomers`, s132) — chart trend trước chỉ lọc theo group+date.
2. **Sub-channel CM1 breakdown cao hơn CM1 hàng cha** (`b2b/performance`, bảng B2B Tier Performance, click
   "View details" 1 KH) — `sub_channels.gpm2` chỉ trừ cost khớp ĐÚNG TÊN sub-channel (gần như không bao giờ
   khớp cho KH B2B) → bỏ qua chCost Turso per-customer + group cost đã trừ ở CM1 hàng cha (case thật: Momo
   cm1=215tr nhưng sub-channel cộng lại 437tr). Fix: tách cost đã gán đúng 1 sub-channel cụ thể, phần chung
   (chCost + group cost) phân bổ theo tỷ trọng revenue → Σ sub_channels luôn khớp CM1 cha. Cùng bug (chưa lộ
   vì `partner_tiers` rỗng) ở `b2b/strategic-performance` — vá luôn cùng lúc.
3. **Root cause chính "sửa cost ở Quarter Report không cập nhật B2B Performance"**: `/api/analytics/
   b2b-customer-costs` (nơi Quarter Report "Sửa chi tiết" ghi CH.Cost per-customer vào Turso) KHÔNG flush cache
   nào — trong khi `channel-costs`/`channel-group-costs` (Supabase) đã `flushAnalyticsCache()` từ lâu. Không chỉ
   B2B Performance: `channels/*`, `bod-summary`/`bod-group-margin`/`bod-channel-performance`, `monthly-kpis`
   (Dashboard), `all-time-performance` đều cache NGUYÊN khối kết quả đã tính (gồm cost) tới 12h — chỉ 2 route
   Quarter Report tự tươi (cố ý đặt `fetchCustomerCosts` ngoài `cachedQuery`). Fix: `flushAnalyticsCache()` sau
   khi lưu/xoá cost (3 route ghi). Nhân tiện vá `quarterly-cache-flush` (nút "Tải lại mới") — danh sách prefix
   cứng đã lỗi thời (`qreport_raw_v7:`...`v1:` trong khi cache key thật đã lên `v9`) → không xoá được cache hiện
   hành cho người KHÔNG bấm nút; đổi sang `flushAnalyticsCache()` cho khỏi lệch version về sau.
4. `b2b/performance`: mẫu số chia group cost theo tỷ trọng revenue tính từ danh sách đã cap `.slice(0,500)` →
   nếu >500 KH/kênh trong kỳ, mẫu số hụt làm CM1 tổng lệch nhẹ so với `b2b/kpis` (SQL SUM không cap). Đổi mẫu
   số sang tổng doanh thu không cap.
5. Bảng B2B Tier Performance (FE `b2b/page.tsx`): 2 chỗ field `cm1` không đồng bộ với `gpm2` khi (a) lọc bớt
   sub-channel trùng tên đối tác Strategic, (b) merge 2 dòng cùng TÊN hiển thị khác `customer_code` (case thật
   hay gặp: nhiều mã lỗi/rỗng đều gộp chung tên "Chưa xác định") — chỉ cộng `gpm2`, không cộng `cm1`/`ch_cost`.
6. **Squad Progress (Quarter Report) — 2 bug field-mismatch liên tiếp ở flat view** (bật filter/search, phát
   hiện + fix qua 2 vòng riêng sau khi Hiếu báo lại lần 2): cột "GP PR" đọc field `c.gp_pr` KHÔNG TỒN TẠI
   trong response API → luôn hiện "0"; cột "%TGT CM1" đọc nhầm `c.cm1_pct` (CM1% trên doanh thu, không liên
   quan target) thay vì `c.cm1_tgt_pct` (% đạt target — đúng ý nghĩa cột). View per-squad (không filter) dùng
   đúng field cả 2 chỗ → đây là lý do Hiếu thấy "không filter số bình thường, có filter số khác/sai". Root
   cause: flat view là khối JSX viết tay riêng, không share component với view per-squad dù cùng hiển thị 1
   bộ field. Fix cả 2 chỗ khớp per-squad view.
7. **Squad Progress không hiện companyCode (ALL/VN/US) đang chọn** — Hiếu báo tiếp "acc tôi đúng, acc người
   khác lại sai" dù đã reload. Audit lại xác nhận route `squad-progress` **zero role-branching, zero cache**
   (server trả y hệt mọi account cùng tham số) → không phải bug code. Tìm ra: thanh filter Quý/Năm/ALL-VN-US
   nằm ở header CHUNG toàn trang, `companyCode` ảnh hưởng thật tới data nhưng card Squad Progress không ghi
   companyCode đang chọn trong tiêu đề → 2 người khác companyCode ra số khác THẬT nhưng không có dấu hiệu để
   nhận ra khi so sánh. Fix: thêm companyCode vào tiêu đề card.
- **s169(c) — TỰ GÂY RA rồi tự fix cùng ngày: cache flush toàn app nuke SẠCH gây "web load lâu".** Fix mục 3
  ở trên (ban đầu) dùng `flushAnalyticsCache()` (xoá sạch bảng `analytics_query_cache`) sau mỗi lần sửa/xoá
  cost B2B + mỗi lần bấm "Tải lại mới" — đúng đồng bộ nhưng xoá LUÔN cache mọi tab KHÔNG liên quan
  (Products/Staff/Vendors/Orders/Customers/SQL Explorer...). Session test sửa cost/bấm nút liên tục nhiều
  lần → cache toàn app bị nuke lặp lại → mọi trang phải query gohub_dw sống → Hiếu báo "web load lâu quá".
  Fix: `B2B_COST_CACHE_PREFIXES` (`analytics-helpers.ts`) liệt kê ĐÚNG route thật sự cache kết quả phụ thuộc
  cost B2B + helper `flushB2BCostCaches()` — 3 route ghi cost dùng helper này thay vì nuke sạch.
  `quarterly-cache-flush` đổi sang scoped-prefix, import `QREPORT_CACHE_PREFIX`/`QB2B_CACHE_PREFIX` TRỰC TIẾP
  từ `lib/quarterly-settings.ts` (cùng 1 hằng số với route sinh ra key đó — không bao giờ lệch version như
  prefix list hardcode cũ; Next.js App Router không cho export hằng số tuỳ ý trong `route.ts` nên phải đặt ở
  lib — tsc tự bắt lỗi này).
- tsc + `next build` PASS từng commit. **KHÔNG verify được số thật bằng live query** (máy dev thiếu
  `ANALYTICS_DB_*`/`TURSO_*`) — mọi fix dựa trên đọc code đối chiếu công thức 2 bên (Quarter Report vs B2B
  Performance) tới khi khớp tuyệt đối logic. Hiếu đã test tay xác nhận đúng cho case Momo (mục 2), Squad
  Progress GP PR→0 (mục 6), và xác nhận "ok rồi" sau mục 7 trên staging trước khi merge main.
- Wiki: `docs/wiki/Tab/analytics-b2b.md` §6 Gotchas (3 mục fix mới, gồm s169(c)) + `docs/wiki/Tab/
  analytics-quarterly.md` §Subtab Squad Progress (2 mục fix mới).

**s168 — đã làm (2026-08-28): fix 2 bug thật trong Scheduled Messages (Daily/Weekly/Monthly Report).**
1. **Lỗi "column f.fulfiled_date does not exist" — toàn bộ report fail** (Hiếu báo sáng cùng ngày). Root cause:
   `fetchBODGroupMarginData` (`lib/bod-data.ts`, dùng bởi mọi report period qua `scheduled-report-data.ts`) —
   query `custRevRows` dựng CTE `filtered_f` KHÔNG `SELECT` cột ngày, nhưng query ngoài lại dùng
   `TO_CHAR(f.${dateCol}::date,...)` tham chiếu tới CTE đó → Postgres báo cột không tồn tại. Fix: thêm
   `${source.dateCol}` vào SELECT của CTE. Commit `92d4a5d`.
2. **Daily Report mục 【3】 thiếu target quý + %tiến độ + %Pro-rata/Target**. Điều tra kỹ logic (`getDateFilter`,
   `getQuarterTargets`, format cache key...) — KHÔNG tìm thấy bug logic (khớp 100% Quarter Report cùng nguồn
   Turso `target_planning_quarter`). Root cause thật: `getQuarterTargets` nuốt im lặng MỌI lỗi Turso, coi giống
   hệt "chưa nhập target" (`total=0`) → không phân biệt được lỗi thật với thiếu data khi debug. Fix: log lỗi ra
   Vercel + tách 2 thông báo trong report ("Chưa nhập target quý" vs "Lỗi lấy target quý từ Turso"). Hiếu xác
   nhận sau fix: **do thiếu data thật** (chưa nhập target Q3-2026), không phải lỗi code — nhập target xong là
   hết. Commit `984b4e8`.
- tsc PASS cả 2 commit. Wiki: chưa có trang riêng cho Scheduled Messages ngoài
  `docs/wiki/Tab/analytics-scheduled.md` (không cần sửa — 2 fix này thuộc `lib/bod-data.ts`/
  `lib/scheduled-report-data.ts`, không đổi hành vi mô tả trong wiki, chỉ sửa bug).

**s167 — đã làm (2026-08-27): rebuild My Metrics lần 2 — theo yêu cầu Hiếu sau khi đọc offer letter thật
(`Hieu/Offer Letter...pdf`, trang 2 bảng KPI bị PDF gốc cắt cứng ở cột Target Q3 — Target Q4 KHÔNG có trong tài
liệu gốc, xác nhận số Q4 trong code trước đó là ước lượng đúng như đã ghi chú).** Hỏi Hiếu chốt 3 quyết định qua
AskUserQuestion trước khi code (không tự đoán): nguồn Lark = 1 group có sẵn (Hiếu tự nhập chat_id sau) · nhận
diện = AI đề xuất + Hiếu duyệt 1-click (không tự động tính luôn) · SKU scope = quét toàn hệ thống theo Pareto
doanh thu + SKU mới (không giữ cách tag tay cũ).
- **SKU Gross Margin — bỏ hẳn tag tay, quét TOÀN BỘ SKU công ty** (`api/analytics/my-metrics/sku-scan`, route
  mới): mọi SKU có đơn trong quý, so GM% quý này vs quý trước, xếp Pareto 80% doanh thu = "trọng điểm" + SKU
  mới trong quý, weighted theo revenue → **số KPI chính thức**. `okr_sku_tags` (bảng cũ) hạ cấp thành ghi chú
  tuỳ chọn gắn vào 1 dòng trong bảng scan (bỏ yêu cầu `effective_date`, migration v45 nới NOT NULL).
- **Bot Lark tự động phát hiện SLA/Vendor Speed** (theo đúng yêu cầu "setup bot tự động lấy thông tin, đánh
  giá, nhận diện"): cron `api/cron/my-metrics-lark-scan` (1x/ngày 17:00 ICT — ban đầu đặt 4x/ngày nhưng bị
  Vercel Hobby plan reject, xem mục "Deploy bị FAIL" ở bảng trên) quét 1 group Lark (config qua modal "⚙️ Lark
  Bot", admin/creator, Hiếu tự nhập chat_id — CHƯA hoạt động tới khi nhập) → Gemini (`okr-lark-classify.ts`,
  cùng convention `agents/classifier.ts`) phân loại thread là Product Request (SLA) hay Vendor Rate Query, tìm
  tin hoàn thành → ghi `okr_lark_events` (status=pending_review) + DM Lark báo Hiếu có case mới. Hiếu duyệt
  Xác nhận/Sửa giờ/Từ chối trong panel "🤖 Bé Gấu phát hiện N case" ngay trong tab — chỉ case `confirmed` mới
  gộp vào TB SLA/Vendor Speed cùng evidence ảnh cũ (route `evidence` nay merge 2 nguồn, trả thêm
  `sources:{manual, lark_auto}`).
  - Refactor: tách `lib/lark-thread-scan.ts` (`fetchRecentThreads`) từ logic quét thread của Cà Thread
    (`api/creator/ca-thread/route.ts`) ra dùng chung — Cà Thread đã đổi sang gọi hàm này, hành vi giữ nguyên
    (đã đối chiếu kỹ từng điều kiện lọc reaction/participant/mention khi tách).
- **UI/UX rebuild**: mọi KPI lấy từ DB nay có bảng dữ liệu gốc kèm theo (`DataTable` component mới, dùng chung
  toàn trang) — bảng SKU scan (search + phân trang), bảng evidence records (nguồn 🤳/🤖 + trạng thái), bảng %3HK
  theo tháng, bảng Bé Gấu theo tháng. Badge độ tin cậy thống nhất: Auto (xanh dương) / AI-detected chờ duyệt
  (vàng) / đã duyệt (tím) / Context (xám).
- Migration `v45_okr_lark_events.sql`: bảng `okr_lark_events` + nới `okr_sku_tags.effective_date` thành nullable.
  ✅ Hiếu đã chạy v44+v45 trên Supabase (2026-08-27).
- tsc PASS + `next build` PASS. **CHƯA verify số thật** (máy dev thiếu `ANALYTICS_DB_*`, chưa test được
  cron/Gemini với dữ liệu Lark thật) — còn lại cần Hiếu: (1) nhập `chat_id` group Lark thật qua modal "⚙️ Lark
  Bot", (2) QA tay UI My Metrics trên staging (bảng SKU scan/evidence không lỗi), (3) theo dõi vài ngày đầu xem
  AI phân loại đúng không trước khi tin số báo cáo hiệu suất.
- Wiki: viết lại `docs/wiki/Tab/analytics-my-metrics.md` toàn bộ theo kiến trúc mới.

**s167 (tiếp, cùng ngày) — Hiếu báo bot Lark set 30 ngày mà quét được 0 case + màu vẫn chưa ổn + thêm
filter/bảng.** Tìm ra **2 bug thật** trong bot Lark (không phải chỉ AI đoán sai):
1. Trần cứng 5 trang fetch (250 tin), không scale theo `days_back` → group nhiều tin, 250 tin mới nhất chỉ
   phủ vài ngày, phần còn lại cửa sổ 30 ngày KHÔNG BAO GIỜ được fetch. Fix: scale theo `daysBack`.
2. Không lưu case bị AI từ chối → cron luôn chọn lại đúng N thread mới nhất mỗi lần chạy, giẫm chân tại chỗ
   vô hạn nếu N thread đó toàn bị từ chối. Fix: ghi cả `status='not_matched'` để dedupe tự đẩy cron tiến
   qua backlog. Thêm `lib/lark-scan-runner.ts` (logic dùng chung) + nút **"Quét ngay để test"** trong modal
   Lark Bot (không cần đợi cron 1x/ngày) + panel review hiện "đã quét N thread" + mục audit "không khớp".
- **Màu — sửa lần 2**: phát hiện lần 1 dùng hex `#003B95` TỰ ĐOÁN, không phải token thật của project — check
  `tailwind.config.ts` mới ra brand color THẬT là `brand-600 = #0f4c81` (dùng khắp app: sidebar/top-bar/
  login...). Đổi toàn bộ sang class `brand-*` đúng token thay vì hex tuỳ hứng.
- Bỏ cột "Category" khỏi 2 bảng (giữ filter). Thêm filter Loại/Category/Vendor cho bảng SKU scan. Thêm bảng
  mới "Datapool Rev — chi tiết theo SKU" (route `datapool-detail`) cho card %Datapool.
- tsc + `next build` PASS. Route mới: `api/analytics/my-metrics/datapool-detail`,
  `api/analytics/my-metrics/lark-config/scan-now`. File mới: `lib/lark-scan-runner.ts`.
- **Vẫn CHƯA verify chất lượng phân loại Gemini với data thật** (2 bug trên là lỗi logic rõ ràng, chắc chắn
  đúng; nhưng nếu sau fix vẫn còn sót request thật, cần Hiếu bấm "Quét ngay" rồi xem mục "không khớp" để tinh
  chỉnh prompt `okr-lark-classify.ts`).

**s166 — đã làm (2026-08-27): fix %TGT CM1 Squad Progress lệch bảng KH nhóm bên Tổng quan.**
Hiếu yêu cầu audit lại logic %TGT CM1/%TGT 3HK per-customer, đảm bảo Squad Progress khớp y hệt Tổng quan
(chỉ khác đánh giá risk thêm vào). Đối chiếu `custPr()` (`quarterly/page.tsx`) với `calcCustCm1AndPr`
(`squad-progress/route.ts`) — tìm ra: cost dạng "amount" (tiền cố định/tháng) trong `calcRecordCostProjected`
bị Squad Progress hardcode `elapsedRatio=1` (trừ nguyên tiền cố định dù mới giữa tháng) rồi VẪN nhân cả CM1
với `factor=dim/elapsed` để chiếu hết tháng → phần cost amount bị nhân đúp theo factor, CM1 (cả actual lẫn
PR) thấp hơn Tổng quan có hệ thống cho KH đang có cost dạng amount trong tháng đang chạy (cost dạng percent
không bị ảnh hưởng — tự triệt tiêu factor ở cả 2 route). Bug chỉ lộ GIỮA THÁNG (đầu/cuối tháng elapsed≈dim
nên không khác biệt) → dễ sót khi QA. Fix: thêm `elapsedRatioOf(i)` (giống hệt công thức Tổng quan), áp cho
CẢ 2 chỗ gọi `calcRecordCostProjected` trong file (per-customer + squad-level cm1Pr recompute — thiếu 1 chỗ
thì squad-total lệch tổng customer). tsc + `next build` PASS. **CHƯA verify số thật** (máy dev thiếu
`ANALYTICS_DB_*`) — Hiếu tự so vài KH có cost dạng amount giữa tháng trên staging, %TGT CM1/3HK phải khớp
đúng cột tương ứng bên Tổng quan. Wiki: `docs/wiki/Tab/analytics-quarterly.md` §Squad Progress đã thêm.

**s165 — đã làm (2026-08-27): fix quyền ghi (write) admin bị 403 oan trên nhiều tab analytics.**
Hiếu báo: admin không sửa được Target Squad trong Squad Progress (tab Quarter Report). Root cause tìm
được — KHÔNG phải bug logic FE, mà **JWT stale**: `squad-targets/route.ts` (và 33 route ghi khác) check
role bằng `session.user.role` (JWT) trực tiếp, không fallback đọc role TƯƠI từ DB. JWT maxAge = 1 ngày
(giảm từ 7 ngày ở s159) → nếu role DB đổi (vd cấp thêm quyền admin) mà user chưa re-login trong ngày đó,
JWT vẫn mang role CŨ → check `["admin","creator"].includes(session.user.role)` fail dù DB đã đúng là
admin → 403 dù FE đã cho hiện nút (FE gate `canEditSettings` dùng role TƯƠI qua `/api/user/me` nên nút
vẫn hiện — hai tầng lệch nhau, đúng như gotcha đã ghi ở s110-111 cho 5 trang admin-only, nhưng CHƯA áp
cho các route ghi (POST/PATCH/DELETE) của tab analytics — lỗ hổng cùng họ, khác chỗ).
- Thêm hàm dùng chung `canWrite(session, tabKey, baseRoles)` trong `lib/writable-tabs.ts`: fast-path
  check role JWT trước (đỡ round-trip DB case thường) → fallback `canWriteTab` (đọc role TƯƠI qua
  `getDbRole`) khi fast-path fail. Thay thế MỌI chỗ check `session.user.role` một mình trong route ghi.
- Quét toàn bộ `web/src/app/api/**` tìm route có POST/PATCH/DELETE gate bằng `session.user.role` không
  fallback fresh — tìm ra 34 file dính, áp `canWrite()` cho tất cả (KHÔNG đổi role nào được phép, chỉ
  thêm fallback khi JWT stale — an toàn, chỉ nới không siết):
  - **Quarter Report** (đúng cái Hiếu báo): `squad-targets`, `b2b-customer-targets`, `b2b-customer-costs`
    (POST+DELETE), `config/squad-config`, `fix-turso-customer-costs` (DELETE+GET).
  - **Channels**: `channel-costs`, `channel-cost-settings`, `channel-group-costs` (+`[id]`),
    `analytics/channel-costs-repair`, `analytics/channel-costs-fix-renamed`, `admin/sync-turso-costs`.
  - **Settings/Users/Products/B2C/Targets/SQL/Schema**: `config/access-policy`, `config/chatbot-rules`,
    `config/partner-tiers`, `config/role-filters`, `config/role-permissions`, `config/b2c-budget`,
    `config/b2c-kpi-targets`, `config/item-channel-types`, `config/sku-destination-rule`, `config/schema`
    (+`ai-suggest`), `planning/targets`, `admin/sql-query`, `admin/settings`, `admin/promotions`,
    `admin/template`, `admin/flush-analytics-cache`, `admin/import-ref-data`, `admin/init-b2b-cost-table`,
    `admin/migrate-turso-tickets`, `admin/sync-lark-tickets`, `analytics/sync-b2b-customers`.
- **KHÔNG đụng** (khác họ, cố ý giữ nguyên): `config/tab-visibility` (creator-only theo thiết kế, không
  phải bug) · `usage-stats/classify|evaluate` (creator-only theo thiết kế) · `to-gau/*`/`kb/documents`/
  `ncc/import-*`/`feedbacks`/`chat`/`creator-ai/*` (permission model khác — theo group-membership hoặc
  mở cho mọi role đăng nhập, không phải role-gate đơn giản) · `analytics/query` (đọc-only, không phải
  bug "không sửa được").
- tsc PASS + `next build` PASS. **CHƯA test tay** (không có tài khoản admin JWT stale sẵn để tái tạo bug
  thật trên máy dev) — Hiếu tự thử lại "Target Squad" trên staging, báo nếu vẫn 403.
- Wiki: chưa cập nhật riêng (đây là fix hạ tầng permission xuyên nhiều tab, không thuộc 1 file wiki cụ
  thể) — nếu gặp thêm route nào khác 403 oan cho admin, áp lại đúng pattern `canWrite()` này.

**s164 — đã làm (2026-08-27): rebuild tab My Metrics (OKR cá nhân Hiếu) cho minh bạch/đáng tin hơn.**
Lý do: Hiếu chưa ưng ý số liệu, sếp (Bảo) chưa tin số chính xác. Đọc offer letter thật
(`D:\gohub\Hieu\Offer Letter...pdf`, KHÔNG commit) lấy đúng 5 KPI + trọng số 70/30 time-allocation.
Hỏi Hiếu chốt 3 quyết định trước khi code (không tự đoán): SKU GM giữ cả verified+blended; Bé Gấu
đếm company-wide có lọc "trả lời được"; SLA/Vendor Speed giữ manual nhưng siết trust (chưa có event
hệ thống thật để tự động hoá — product onboarding vẫn thủ công).
- **Migration `v44_okr_tracking.sql`** (CHƯA CHẠY — cần Hiếu): ghi lại schema `okr_evidence_records`
  (bảng cũ tạo tay ngoài Supabase, không có migration từ trước) + thêm cột audit `updated_by/updated_at`
  + bảng mới `okr_sku_tags` (chỉ lưu sku_code + ngày áp dụng, KHÔNG cho nhập tay số margin).
- **SKU GM verified (mới)**: `api/analytics/my-metrics/sku-tags` — Hiếu tag SKU + ngày áp dụng giá/rate
  mới → API tự so margin THẬT (gohub_dw `fact_fulfillment_revenue`) trước/sau ngày đó, không thể tự
  khai khống. SKU mới (không có giai đoạn trước) so với baseline công ty 36.7%. Weighted theo revenue.
  Số blended toàn công ty (cách tính cũ) giữ lại làm context phụ, nhãn rõ "không phải KPI chính".
- **Evidence SLA/Vendor Speed siết trust**: bắt buộc đủ 2 ảnh (request+completion) mới tính vào TB
  KPI (thiếu ảnh vẫn lưu, badge riêng "không tính"); thêm audit trail hiển thị (created_by/at,
  updated_by/at); **khoá quý đã đóng** (`isQuarterLocked` — qua ngày cuối quý thì không sửa/xoá được
  evidence/SKU tag nữa, tránh số bị đổi ngược sau khi đã báo cáo).
- **Bé Gấu tasks**: vẫn đếm company-wide (đúng tinh thần "AI Agent giúp Sales/CSKH/Ops") nhưng loại
  response <15 ký tự (chào hỏi/lỗi cụt); thêm breakdown theo `user_role` (phòng ban).
- **Weighted OKR Score** (card mới đầu trang): Σ(đạt-%ᵢ × trọng-sốᵢ)/100, trọng số 70/30 lấy đúng
  offer letter, 4 chỉ số trong nhóm 70% chia đều 17.5% (offer letter không ghi riêng từng chỉ số —
  giả định minh bạch, hiện công thức ngay trong UI, sửa hằng số `WEIGHTS` trong `page.tsx` nếu sếp
  chốt khác). Data-freshness bar hiển thị cutoff gohub_dw + giờ tải trang.
- Dọn `ManualMetrics`: xoá 5 field chết (`sla_time/sla_pct/vendor_speed/gm_baseline/gm_actual`) không
  hiển thị ở đâu từ trước, chỉ giữ `target_*`.
- File mới: `web/src/lib/okr-helpers.ts` (quarterRange/parseQuarterLabel/isQuarterLocked/baseline
  constants, dùng chung 3 route). Wiki mới: `docs/wiki/Tab/analytics-my-metrics.md` (tab này TRƯỚC
  ĐÂY CHƯA CÓ WIKI — vi phạm rule sync, đã bổ sung).
- tsc PASS + `next build` PASS. **CHƯA test tay** (máy dev thiếu `ANALYTICS_DB_*`/Supabase key) —
  cần Hiếu: (1) chạy migration v44, (2) QA UI trên staging, (3) thử tag vài SKU thật đã renegotiate
  rate trong Q3 để xem số verified có hợp lý không trước khi show sếp.

**➡️ TIẾP THEO (2026-08-26+):**
- **✅ ĐÃ FIX bug định danh member Tổ Gấu (task riêng, cùng ngày, theo yêu cầu Hiếu "fix ngay")** — bug phát hiện
  khi test s163, có từ s142 (KHÔNG phải do s163 gây ra): toàn bộ Tổ Gấu xác định "có phải member group X không"
  bằng `chat_group_members.user_email` lấy từ `session.user.email || ""`. 43 user có `email=NULL` (đa số qua
  Lark OAuth, GỒM CẢ account `creator` của Hiếu) → tất cả cùng chung "" → user không-email bất kỳ mặc nhiên "là
  member" group nào có 1 user không-email khác đã join. Fix: đổi khoá định danh sang `session.user.username`
  (luôn duy nhất + luôn có) xuyên suốt 10 route `api/to-gau/**` + `api/kb/wiki/route.ts`; đổi API thêm-thành-
  viên nhận `username` thay vì gõ email tay (`user-search` nay trả thêm `username`, FE bắt buộc chọn từ gợi ý);
  backfill 2 group + 2 member + 8 message + 1 note cũ của Hiếu sang username thật. Verify bằng HTTP thật (session
  tự ký qua NEXTAUTH_SECRET): 2 user giả không-email khác nhau → chỉ người được add mới thấy group, người kia
  KHÔNG còn thấy nữa (trước đây sẽ thấy do collision) — PASS. Toàn bộ add/đổi-role/xoá-member qua username cũng
  PASS. Chi tiết: `docs/wiki/Tab/analytics-to-gau.md` §"Fix identity-collision".
- **s163 — đã test bằng tay qua HTTP (session giả lập, không qua browser)**: dùng `NEXTAUTH_SECRET` sẵn có để tự
  ký session hợp lệ (không đụng password ai), gọi thẳng API như 1 user `staff` (email giả không trùng ai) + 1
  user `admin` thật (`seikobao`) trên dev server local, dữ liệu Supabase thật. **Toàn bộ PASS**: staff không phải
  member → 403 khi xem group không thuộc về mình; thêm vào group → chỉ thấy đúng group đó; tạo/gán/đổi phạm vi
  nhóm cho 1 trang Wiki qua API → lọc đúng theo từng group; staff bị chặn tạo/gán trang (403, đúng thiết kế
  admin/creator-only); Docs API (chưa đổi) không bị ảnh hưởng. Đã dọn sạch toàn bộ dữ liệu test sau khi xong
  (xác nhận lại bằng query — không còn dòng rác). **Chưa test được**: click UI thật qua browser (không có
  Claude in Chrome/credential) — logic BE đã xác nhận đúng, còn lại là UI polish Hiếu tự xem qua khi rảnh.
  1. Chạy migration `web/db/migrations/v43_kb_wiki_group_scope.sql` trên Supabase — ⚠️ **Hiếu báo đã chạy
     (2026-08-26)**, đã test xác nhận cột/bảng hoạt động đúng.
  2. Vào `/analytics/to-gau` bằng vài tài khoản role khác nhau → xác nhận sidebar giờ hiện "Tổ Gấu" (trước đây
     CHỈ creator thấy — đã sửa bug này cùng đợt, xem Gotcha trong `docs/wiki/Tab/analytics-to-gau.md`).
  3. Vào 1 group → tab "📚 Tài liệu" → thử "Soạn trang mới" (Chính thức), gán nhóm, xác nhận group khác không
     thấy trang gán riêng (đã verify đúng qua API — chỉ còn xem UI có hiển thị đúng modal/badge không).
  4. Xác nhận `/info` và `/kb` không còn truy cập được (đã xoá route).
  5. Vào Creator Settings (`/analytics/creator`) → section "Tài liệu chính thức — Upload & AI đề xuất Wiki" →
     thử upload 1 file, xác nhận MRP vẫn hoạt động (port từ `/kb` cũ, chưa test lại end-to-end).
- **QA số liệu s162 (QUAN TRỌNG — đã lên main)**: Claude chưa verify được B2B CM1 fix bằng live gohub_dw (máy dev thiếu `ANALYTICS_DB_*`). Hiếu so B2B CM1 giữa BOD/Channels/Dashboard/B2B tab trước và sau fix trên production — số sẽ THẤP HƠN (nay trừ thêm Turso B2B cost). Đặc biệt **BOD tab** (leadership xem) — báo Claude nếu số lệch không hợp lý.
- **Squad Progress vs Tổng quan**: đã fix 4 nguyên nhân (group cost, gộp KH trùng dòng, futureScale, %TGT 3HK) — Hiếu tự so số từng KH/PIC cụ thể trên production, báo nếu còn lệch.
- ✅ **Inventory tab — đã seed xong (2026-08-26)**: chạy `import_inventory_plan.mjs` thành công. Kết quả: `inventory_plan_skus` 12 dòng (9 VN+3 US) · `inventory_plan_weekly` 276 dòng · `inventory_po` 9 dòng — khớp Excel. 4 dòng PO ngày AMBIGUOUS (cả 2 số ≤12, tạm lấy mặc định MM/DD) **cần Hiếu soát tay trong Supabase `inventory_po`**: `1ETHATMF01507`/`AB0003DK00000`/`1D0003DK00000`/`ACTHATMF05010`. Còn lại: QA trực quan tab `/analytics/fulfillment` (đã đổi nội dung, giữ URL) trên production.
- **Scheduled Messages**: theo dõi vài ngày xem còn timeout/Lark alert lỗi không (đã fix s161, nâng maxDuration 60→180s + soft-timeout + alert).
- Hiếu cấp quyền GA4 App cho service account → test toggle App trong Web Analytics. Xem lại UI Squad Progress trên production, báo nếu cần chỉnh.

**s163 — đã làm (2026-08-26):**
- ✅ **Gộp Note (`/info`) + Knowledge Base (`/kb`) vào Tổ Gấu, phân quyền tài liệu theo group** — theo yêu cầu
  Hiếu ("tách biệt tài liệu creator push vs tài liệu member trong nhóm push, phân theo Nhóm nào thấy"). Plan đầy
  đủ (đã Hiếu duyệt qua plan mode) lưu ở phiên chat, tóm tắt:
  - **Migration `v43_kb_wiki_group_scope.sql`** (CHƯA CHẠY — cần Hiếu): thêm `kb_wiki_pages.visibility_mode`
    ('all'|'groups', default 'all' = không phá dữ liệu cũ) + bảng nối `kb_wiki_page_groups` (page_id × group_id,
    tái dùng `chat_groups` của Tổ Gấu làm đơn vị phân quyền — KHÔNG tạo khái niệm nhóm riêng).
  - **API `/api/kb/wiki*` mở rộng** (route CŨ đã tồn tại từ trang `/kb`, chất lượng tốt hơn bản `/api/to-gau/kb`
    thử nghiệm trước đó — giữ lại làm nguồn DUY NHẤT, xoá `/api/to-gau/kb`): GET thêm `groupId` filter + member
    check; POST thêm role gate admin/creator (TRƯỚC ĐÂY KHÔNG GATE, chỉ ẩn nút ở FE — lỗ hổng nhỏ đã vá) +
    `group_ids`/`visibility_mode`. Route mới `GET/PUT /api/kb/wiki/[id]/groups` (gán/xem nhóm, admin/creator only).
  - **UI Tổ Gấu** (`to-gau/[id]/page.tsx`): tab bar 4 tab cũ (Chat/Docs/Notes/Wiki) gộp còn 2 (**Chat | 📚 Tài
    liệu**), Tài liệu có sub-tab **Chính thức** (WikiPanel viết lại toàn bộ — full CRUD + version history + modal
    gán nhóm, trước chỉ có view+edit không tạo/xoá được) và **Của nhóm** (DocsPanel/NotesPanel CŨ, không đổi 1
    dòng logic, chỉ đổi vị trí render).
  - **🐛 Bug phát hiện giữa chừng (đã sửa)**: sidebar (`components/sidebar.tsx`) gate nav "Tổ Gấu" bằng
    `isCreatorUser` — CHỈ role `creator` thấy link trong sidebar dù API đã hỗ trợ member thường từ lâu. Nếu không
    sửa, xoá tab Note sẽ làm TOÀN BỘ staff mất đường vào tài liệu. Đổi sang hiện cho MỌI role (gate còn lại =
    `hiddenTabs` config như Note trước đây), đồng bộ cả `lib/nav.ts` (Command Palette).
  - **Dọn permission chết**: bỏ `perm_kb_upload/wiki_view/wiki_edit` (3 role-toggle không còn ý nghĩa vì Track A
    giờ hardcode admin/creator), bỏ `"kb"` khỏi `DEPT_UNLOCKABLE_TABS`/PM tabs, bỏ `"info"` khỏi
    `ALL_ANALYTICS_IDS`/REPORTS matrix (`analytics-roles.ts`, `user-admin.tsx`, `api/permissions/route.ts`,
    `analytics/users/page.tsx`).
  - **Pipeline Upload→MRP giữ nguyên, dời UI**: `/kb` DocsTab (upload/parse/chunk/embed/AI-đề-xuất-Wiki) port
    gần như nguyên khối sang `analytics/creator/kb-docs-section.tsx`, render trong Creator Settings.
  - **Đã bỏ hẳn theo quyết định Hiếu** (không port): Overview tra cứu nước, ghi chú cá nhân (`user_notes`), file
    tham khảo cá nhân (bucket `Information`) — bảng/bucket KHÔNG xoá (an toàn), chỉ mất UI truy cập.
  - **Xoá file**: `app/(dashboard)/kb/`, `app/(dashboard)/info/`, `app/api/info/*`, `app/api/to-gau/kb/`.
  - tsc PASS. **CHƯA test bằng tay** (máy dev thiếu Supabase key) — xem checklist ở mục TIẾP THEO trên.
  - Wiki: viết lại `docs/wiki/Tab/analytics-to-gau.md` (§"s163"), xoá `docs/wiki/Tab/kb.md` + `Tab/info.md`
    (nội dung gộp vào analytics-to-gau.md). ⚠️ 2 trang wiki cũ "Knowledge Base…"/"Note…" (`page_type: tab_guide`,
    sync từ file .md cũ) còn tồn tại trong Supabase `kb_wiki_pages` — sync script chỉ upsert theo title, không tự
    xoá page khi file nguồn mất → **Hiếu cân nhắc xoá tay 2 dòng đó** trong tab Tài liệu (Creator Settings hoặc
    trực tiếp Supabase) nếu muốn dọn sạch, không bắt buộc (chỉ admin/creator thấy vì `is_hidden` cũ = true).

**s162 — đã làm (2026-08-26):**
- ✅ **Fix Squad Progress thiếu Group Cost B2B** (`api/analytics/squad-progress/route.ts`, commit ea2296b): CM1 Squad Progress chỉ trừ chi phí per-customer (Turso), thiếu trừ Group Cost B2B (Supabase `analytics_channel_group_costs`) mà Tổng quan (`quarterly-report`) + tier (`quarterly-b2b-customers`) đều trừ → CM1 cao hơn Tổng quan có hệ thống. Áp lại công thức phân bổ theo revenue-share y hệt route tier (#4 NHẤT QUÁN GROUP COST), trừ ở cả mức Actual và PR, chỉ ở mức squad/tổng (từng customer giữ nguyên).
- ✅ **Fix Squad Progress khác Tổng quan mọi số liệu per-customer** (Hiếu báo Rev→CM1 lệch hết, `squad-progress/route.ts`, commit 6b38009+1ffc095) — 4 nguyên nhân:
  1. **Gộp KH bị SQL trả nhiều dòng** (6b38009): query GROUP BY cả price_list_name/currency_code/sales_pic_code → KH đổi PIC/bảng giá giữa quý ra NHIỀU dòng SQL; code cũ `.find()` chỉ lấy dòng đầu → mất doanh thu + gán sai squad. Nay gộp đúng theo customer_code trước khi build squad.
  2. **Thiếu `futureScale`** (1ffc095): Tổng quan (`quarterly/page.tsx` `custPr()`) ước tính CẢ tháng CHƯA TỚI trong quý (T9 khi mới qua T7-T8) bằng `futureScale = tổng_ngày_cả_quý/tổng_ngày_các_tháng_đã_có`. Squad Progress trước bỏ qua bước này → PR luôn thấp hơn Tổng quan đáng kể giữa quý. Đã thêm, áp cho mọi giá trị PR.
  3. **%TGT 3HK sai không gian tính** (1ffc095): Tổng quan so DOANH THU 3HK PR với target doanh thu; Squad Progress trước so % với %. Đổi sang so revenue.
  4. **Zero-revenue-month** (b68a06a, trước đó cùng đợt): đã fix riêng, xem trên.
  ⚠️ **Lưu ý UI cũ dễ hiểu nhầm** (đã giải thích Hiếu trong chat, không phải bug): cột chính "Revenue"/"CM1" ở bảng Tổng quan hiển thị **PR**, còn cột chính ở Squad Progress hiển thị **Actual** (PR nằm ở field phụ `revenue_pr`/`cm1_pr`) — so 2 cột tên giống nhau giữa 2 tab dễ tưởng lệch dù đúng logic.
- ⏳ **CHƯA verify bằng live DB** (vẫn thiếu `ANALYTICS_DB_*` trên máy dev) — Hiếu tự QA số Squad Progress vs Tổng quan trên staging theo từng KH/PIC cụ thể, báo nếu còn lệch.
- ✅ **Audit + fix B2B CM1 toàn hệ thống — 3 "thế hệ" cost model chạy song song** (commit 921cf9c): phát hiện B2B cost thật (Ops nhập qua Turso `b2b_customer_cost_monthly`, tab Quarter Report) KHÔNG được các route sau biết tới, chúng chỉ trừ `analytics_channel_costs` Supabase (gần như luôn rỗng cho B2B) hoặc chỉ group cost → CM1 B2B cao ảo, khác Quarter Report/B2B-detail-table cùng kỳ dù "code theo OOP dùng chung `cost-engine.ts`" (OOP chỉ chung CÔNG THỨC 1 dòng cost, KHÔNG chung việc chọn NGUỒN cost — đây là root cause thật). Đồng bộ Turso cho: `b2b/kpis` (KPI card đầu tab B2B — trước khác cả với bảng chi tiết CÙNG TAB), `b2b/trend`, `channels/kpis`, `channels/performance`, `monthly-kpis` (Dashboard), **cron `refresh-monthly-kpis`** (snapshot Bé Gấu dùng trả lời câu hỏi CM1 theo tháng — TRƯỚC FIX CHATBOT TRẢ LỜI SAI SỐ CM1), `bod-data.ts` (`fetchBODGroupMarginData`/`fetchBODChannelPerformanceData`/`fetchBODReportData` → cả 4 route BOD), `all-time-performance`. B2C/Other giữ nguyên channel cost Supabase (đúng, không đổi).
  - ⚠️ **Biết trước, CHƯA fix**: Dashboard/`monthly-kpis` vẫn thiếu channel-level cost cho B2C (chỉ group cost) — khác Channels/B2B tab đã có. `all-time-performance` có bug tồn tại từ trước (query chính thiếu `JOIN dim_customer c` dù CASE tham chiếu `c.price_list_name` — chỉ không lỗi khi tier keywords rỗng) — cần Hiếu xác nhận trước khi sửa riêng.
  - **KHÔNG verify được bằng live query** — máy dev Claude không cầm được secret thật (`.env.local` bị harness sandbox redact thành literal `"[SENSITIVE]"` ngay khi Claude/bất kỳ process nào trong session này chạm tới file, kể cả sau khi Hiếu tự `vercel env pull` — thử 2 lần đều vậy). Toàn bộ fix dựa trên đọc code + đối chiếu công thức, **Hiếu cần tự QA số trên staging** trước merge main.
  - Wiki cập nhật: `analytics-b2b.md`, `analytics-bod.md`, `analytics-channels.md`, `analytics-dashboard.md`, `analytics-all-time.md`, `analytics-quarterly.md`.

**s161 — đã làm (2026-08-25):**
- ✅ **Fix Scheduled Messages không tự gửi** (`api/cron/scheduled-messages/route.ts`, commit 881e436): root cause — Daily report (nặng nhất, ~6 batch query gohub_dw tuần tự + Gemini + Lark) vượt `maxDuration=60s` cũ → Vercel kill giữa chừng SAU khi atomic claim đã ghi `last_run_at` nhưng TRƯỚC khi gửi Lark → slot bị đánh dấu "đã chạy" dù tin chưa từng tới, lặp lại mỗi ngày, không alert (khớp đúng triệu chứng: cron-job.org báo timeout ~30s, Lark im lặng hoàn toàn). Fix: `maxDuration` 60→180 (cron + nút Test ngay), soft-timeout guard bailout chủ động ở 160s, chia ngân sách khi nhiều message đến hạn cùng lúc, **thêm Lark alert khi 1 message thất bại** (trước chỉ alert lỗi đọc danh sách đầu route).
- ✅ **Tab Inventory thay hoàn toàn Fulfillment cũ** (commit a358c70, theo yêu cầu Hiếu dựa trên `Plan nhập hàng theo tháng.xlsx` Ops dùng): bỏ hẳn theo dõi tồn kho theo kho vật lý PQ/DD/TSN + vendor balance (s147) → thay bằng **dự phóng tồn kho theo tuần từng SKU (VN/US)** + **PO tracker**. Route/permission giữ nguyên `/analytics/fulfillment` (id `"fulfillment"`), chỉ đổi nhãn hiển thị "Fulfillment"→"Inventory".
  - Migration `v42_inventory_plan.sql`: `inventory_plan_skus` (watchlist) + `inventory_plan_weekly` (actual_stock/sales_forecast/import_qty theo tuần, `*_auto` đánh dấu OPS đã ghi đè) + `inventory_po` (thay sheet PO Dự kiến nhập). **Hiếu đã chạy migration trên Supabase.**
  - Gợi ý tự động (`lib/inventory-plan.ts`): Bán dự kiến từ vận tốc bán 30 ngày (`gohub_dw`), Số nhập theo rule reorder-to-target khi tồn dự phóng dưới ngưỡng an toàn — OPS ghi đè thì giữ nguyên, không bị tính lại đè lên.
  - `actual_stock` (tồn thực tế) **chưa có nguồn `gohub_dw`** — OPS nhập tay tạm, Hiếu sẽ báo cột khi tech bổ sung để nối tự động.
  - `scripts/import_inventory_plan.mjs`: import 1 lần dữ liệu Excel hiện có — **CHỜ Hiếu chạy** (máy dev không có `.env.local`).
  - Wiki `docs/wiki/Tab/analytics-fulfillment.md` viết lại toàn bộ.
- ✅ **Cài skill `caveman`** (plugin marketplace `JuliusBrussee/caveman`, scope user) — chế độ trả lời tối giản token, active mặc định toàn máy theo yêu cầu Hiếu. Không liên quan trực tiếp code GoHub, ghi chú lại để nhớ nguồn nếu cần gỡ (`claude plugin uninstall caveman@caveman`, hoặc `/caveman off` tắt tạm 1 phiên).

**s160 — đã làm (2026-08-25):**
- ✅ **Squad Progress — fix logic đánh giá risk** (`api/analytics/squad-progress/route.ts`, commit d7d9218): `getRiskLevel` đổi sang **ưu tiên mức xấu nhất** — trước đây 1 trong 2 metric (CM1%/3HK%) ≥100% là đủ để lên "An toàn" dù metric còn lại rất thấp (case thật: ShopeePaySG CM1 50%/3HK 106% bị gắn nhầm "An toàn"). Nay chỉ cần 1 metric <85% là kéo cả cặp xuống nhóm nguy hiểm. Cập nhật `docs/wiki/Tab/analytics-quarterly.md` khớp logic mới.
- ✅ **Squad Progress — redesign UI** (commit cea6214, chỉ UI không đổi logic/công thức): badge đánh giá dot+màu rõ hơn + legend dùng chung; 3 stat tile Doanh thu/CM1/3HK thay dòng text dồn cục (số PR trọng tâm, tile tự viền đỏ khi %TGT <85%); dải màu risk bên trái mỗi dòng squad/KH để quét nhanh; footer "Tổng" thành thanh tóm tắt nền brand blue.
- ⚠️ **Máy dev (D:\gohub) chưa có `web/.env.local`** → không chạy được dev server live để test UI trực tiếp; đã tsc PASS + dựng preview tĩnh minh hoạ bằng số liệu thật để tự kiểm tra bố cục trước khi merge.

**s159 — đã làm (2026-08-24):**
- ✅ **Full system audit** (luồng vận hành, bảo mật, rate limit, UX, cron, DB)
- ✅ **Security hardening** — 2 commit (e190aaf + 8c64e9c):
  - Rate limiting: 20 req/min Bé Gấu, 10 req/min Gấu Pro (`lib/rate-limit.ts`)
  - Cron auth: refresh-trends đổi `?secret=` → `Authorization` header; fix bypass khi CRON_SECRET rỗng (4 cron routes)
  - Lark signature: `verifyLarkSignature` (HMAC-SHA256, cần set `LARK_VERIFICATION_TOKEN`)
  - SSL gohub_dw: conditional `rejectUnauthorized: true` khi có `ANALYTICS_DB_SSL_CA` env
  - JWT maxAge: 7 ngày → 1 ngày
  - Cron timing: prewarm/kpis/b2c dời sang 08:30-09:30 ICT (sau ETL 08:00)
  - Lark dedup cleanup: ca-thread-remind xóa entries >7 ngày mỗi thứ 2
  - Hardcode fallback: xóa host IP/DB name/user fallback → throw Error nếu env chưa set
  - CSP headers: X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, CSP
- ✅ **Ops wiki**: `docs/wiki/system/Operations-Runbook.md` (luồng, auth, cron, incident response)

**⚠️ QUY TẮC MERGE (nhắc lại):** KHÔNG tự merge main. "tiếp tục"/"làm tiếp" = chỉ push staging. Chỉ merge khi Hiếu nói "merge main" trong CHÍNH tin đó.

**Migrations & ENV — đã xong:**
- [x] ✅ v31–v35 (cũ) · v36 BC Datapool · v37 staff hk3 split
- [x] ✅ v38 `target_rev` + v39 `target_3hk_rev` trên `b2b_customer_targets`
- [x] ✅ **v40 `ca_thread_log`** (lịch sử cà thread)
- [x] ✅ **v41 `access_audit_log`** (audit log cấp quyền)
- [x] ✅ **v42 `inventory_plan_skus/inventory_plan_weekly/inventory_po`** (tab Inventory, s161 — Hiếu đã chạy)
- [ ] ⏳ **v43 `kb_wiki_pages.visibility_mode` + `kb_wiki_page_groups`** (gộp Note/KB vào Tổ Gấu, s163 — CẦN Hiếu chạy trước khi QA)
- [x] ✅ **v44 `okr_evidence_records`/`okr_sku_tags`** (My Metrics, s164 — Hiếu đã chạy 2026-08-27)
- [x] ✅ **v45 `okr_lark_events` + nới `okr_sku_tags.effective_date`** (My Metrics rebuild bot Lark, s167 — Hiếu đã chạy 2026-08-27)
- [x] ✅ ENV Vercel: `BC_DATAPOOL_*` · `LARK_CREATOR_USER_ID`

**Hiếu cần làm (còn lại, s159+):**
- [x] ✅ **Vercel env**: `LARK_VERIFICATION_TOKEN` đã set Production + Preview
- [x] ✅ **Vercel env**: `ANALYTICS_DB_HOST` / `ANALYTICS_DB_NAME` / `ANALYTICS_DB_USER` đã xác nhận
- [ ] **s163 — chạy migration `v43_kb_wiki_group_scope.sql`** trên Supabase trước khi QA gộp Note/KB vào Tổ Gấu.
- [x] ✅ **s164/s167 — chạy migration `v44_okr_tracking.sql` rồi `v45_okr_lark_events.sql`** — Hiếu đã chạy 2026-08-27.
- [ ] **s167 — nhập `chat_id` group Lark thật** vào modal "⚙️ Lark Bot" (`/analytics/my-metrics`, admin/creator) — bot không chạy tới khi có chat_id.
- [ ] **s167 — QA UI My Metrics trên staging**: mở tab, kiểm bảng SKU scan/evidence không lỗi 500 (bảng mới cần cột `okr_sku_tags.effective_date` nullable từ v45), thử gắn/xoá ghi chú SKU, thử thêm case evidence tay.
- [ ] **Inventory tab**: chạy `node scripts/import_inventory_plan.mjs "D:\gohub\Plan nhập hàng theo tháng.xlsx"` (trong `web/`, máy có `.env.local`) để seed dữ liệu Excel, gửi output kiểm tra khớp.

**Hiếu cần làm (còn lại, cũ):**
- [ ] Liên hệ DB owner gohub_dw cho Looker Studio / Power BI
- [ ] **Portal Affiliate**: nhập App ID + Secret Shopee Affiliate Open API
- [ ] **BC Datapool — lấy appSecret đúng từ BC support**
- [ ] **Cà Thread**: thêm bot Bé Gấu vào group Lark + bật scope `im:message` & `im:message.reaction:readonly` + publish version mới
- [ ] **Cà Thread**: Kết nối Lark cá nhân (Creator page → Kết nối Lark)
- [ ] **Test Wave 1.1** trên staging: cà 1 thread → reload → còn badge "Đã cà" + section Lịch sử → nếu OK → merge main
- [ ] **GA4 App connect**: add service account `ais-gemini-key-88b236e5f62d4cf@612144486106.iam.gserviceaccount.com` Viewer vào property `465150028` (Firebase Console → Project Settings → Integrations → GA → Manage → Property Access Management) → thêm entry `gohub-app` vào `app_settings.ga4_configs` Supabase

**s158 — đã làm (2026-08-22):**
- ✅ **Tổ Gấu — fix toàn diện** (25a8129→da0a197):
  - Smart scroll: không auto-jump khi user đang đọc lịch sử; badge "N tin mới ↓" khi realtime có tin
  - Load more: nút "Tải thêm tin cũ" + cursor pagination `?before=<uuid>` + preserve scroll position
  - N+1 query → 2 batch queries; sort groups theo last activity
  - ConfirmModal + useConfirm hook thay toàn bộ `confirm()` native (DocsPanel, NotesPanel, SettingsModal, handleRecall)
  - Textarea auto-resize; @mention keyboard nav (ArrowUp/Down); Manager badge sidebar
  - Search click miss → toast hướng dẫn
- ✅ **Wiki 3-tier + KB tab Tổ Gấu** (c2d147c):
  - Rewrite 3HK, WM, Vendor-Priority theo format tư vấn CS (TL;DR, Q&A, script copy-paste)
  - Frontmatter mới: `audience`/`visibility`/`last_edited_by`/`last_edited_at` trên 12 files
  - API `/api/to-gau/kb`: browse/search/PATCH (edit tracking không cần migration)
  - AI Gấu Tổ inject KB context trước khi gọi Gemini
  - Tab 📚 Wiki trong Tổ Gấu: 2-pane, search, filter, render markdown, edit mode

**➡️ TIẾP THEO s158:** Chạy `python backend/seeding/import/import_wiki.py` để sync wiki mới lên Supabase KB. Cấp quyền GA4 App cho service account.

**s157 — đã làm (2026-08-21):**
- ✅ **fix Daily Report revenue lệch Dashboard** (ca712c5→82d7347, `lib/scheduled-report-data.ts`):
  - Root cause: 5 query revenue thiếu filter `SHIPPINGFEE0` + `INTERNAL-TRANSACTION`.
  - Fix lần 1: thêm `STD_FILTER` = `shipFilter` + `internalOpsFilterByCode` → timeout (NOT IN subquery chậm + cache cold → 8 query đồng thời vượt pool max=3).
  - Fix lần 2: đổi sang `s.group_name` alias (không subquery) + serialize gohub_dw queries (2/lần) theo thứ tự nhẹ→nặng.
- ✅ **Squad Progress — CM1 thực thay GP** (ee1c095→b2bff89, `api/analytics/squad-progress/route.ts`):
  - GP → CM1 = GP − chi phí KH (`b2b_customer_cost_monthly` Turso).
  - Đồng bộ logic với quarterly-report Overview: `buildQuarterMonthMeta` per-month factor, `SHIPPINGFEE0` filter, `fetchQuarterlySettings()` dynamic excluded customers.
  - Risk level: cập nhật comment 5 mức (rất AT/AT/AT Ít/NH Ít/NH Nhiều).
  - FE: nhãn GP→CM1, thêm %CM1 + %TGT CM1 squad card, bảng KH, total row, Excel export.
- ✅ **Quarter Report — thêm 3HK Revenue (số) bên cạnh 3HK%** (71edf3c→b2bff89):
  - 12 vị trí: KPI card · monthly table · total row · MonthSubRow · QtSummaryRow · Squad card/table/total · B2B customer row · B2B per-month · tier total · sub-row.
  - API quarterly-b2b-customers: thêm `hk3Rev` vào monthly data, `totalHk3Rev` vào tier totals.

**s156 — đã làm (2026-08-20/21):**
- ✅ **Quarter Report — UI/UX polish toàn bộ** (→ main 0ff2e62, `quarterly/page.tsx`):
  - **Squad Progress** S1–S5: admin toolbar compact · squad card progress bar · filter 1 tầng dropdown · customer table 9 cột · flat view banner · Export Excel (2 sheet). Bug fix: pct shadow, expandedSquads reset, total row GP PR.
  - **Overview** O1–O3: target card collapsible · monthly table toggle B2B/B2C · skeleton loading.
- ✅ **Web Analytics — App platform toggle** (main 8169cb1): toggle Web/App ở header; App → GA4 filter `platform=ios|android` thay `hostName`; ẩn GSC section khi App.
- ✅ **B2C — subtab Metric** (main 8169cb1): bảng YTD monthly Revenue/GP/CM1/Orders/AOV/Traffic/User/Customer với Web+App breakdown, %MoM badge.
- ✅ **fix Daily Report revenue + query timeout** (ebd6ac8): thêm filter SHIPPINGFEE0 + INTERNAL-TRANSACTION; dùng alias `s.group_name` thay NOT IN subquery để tránh timeout; serialize gohub_dw queries.

**s155 — đã làm (2026-08-19):**
- ✅ **Wave 1.2** Cà Thread multi-group (main): selector tabs, thêm/sửa/xóa group, backward-compat.
- ✅ **Wave 2.1** Tab Visibility bulk toggle + preview modal (main).
- ✅ **Wave 2.2** Access Audit Log + autocomplete username — v41 migration, gp-access/my-metrics-access ghi log (main).
- ✅ **Wave 2.3** Knowledge Search + Import batch Excel/CSV (main).
- ✅ **Wave 3** Usage compare kỳ trước · DevTools saved queries/history · cron ca-thread-remind (main).
- ✅ **C2** Product Win Rate: JOIN dim_sku lấy vendor thực + win_deadline + export Excel (main).
- ✅ **D1** Tests be-gau.ts (24/24 PASS) · **D3** Gấu Pro 6 image style presets (main).
- ✅ **Quarter Report — subtab Squad Progress** (main 0ff2e62): cấu hình squad · progress table Rev/GP~CM1/3HK · risk per-customer · filter + sort · target squad theo quý.

**s153 — đã làm (2026-08-18):**
- ✅ **Quarter Report — fix save target không được** (→ main b15b354)
  - `quarterly-targets` API: check `session.user.role` trực tiếp trước `canWriteTab` → tránh 403 khi getDbRole fail
  - `b2b-customer-targets` API: `Math.round()` target_rev/target_3hk_rev trước khi upsert BIGINT (lỗi `invalid input syntax for type bigint`)
  - `b2b-customer-targets` API: fallback upsert không có cột mới nếu migration chưa chạy (error 42703)
  - FE `saveTarget`: parseFmt vào trong try-catch + null-safe `?? ""`
- ✅ **Quarter Report — thu hẹp bảng KH để screenshot** (px-3→px-1.5, header 9px)

**s152 — đã làm (2026-08-18):**
- ✅ **Cà Thread — fix bugs** (ms timestamp, pagination, emoji field path, sort DESC)
- ✅ **Quarter Report — cột Target 3HK Revenue + %TGT 3HK + nhập tay** (migration v39)

**s151 — đã làm (2026-08-18):**
- ✅ **Cà Thread — gộp Dry-run/Live → Quét & Cà từng thread**
- ✅ **Quarter Report — CH.Cost B2B tier fix** (projected thay actual, cộng T9 ước tính)
- ✅ **Quarter Report — Target Revenue per-customer** (migration v38)
- ✅ **Áp dụng .ai skill**: staging-first pipeline, wiki sync, session log

**s150 — đã làm (2026-08-17):**
- ✅ **Cà Thread Lark** (`/analytics/creator`): bot quét group Lark, tag người trong thread chưa có reaction YES kèm "Dạ thread này còn update thêm thông tin gì nữa không ạ a/c"
- ✅ **OAuth Lark fix**: dùng `NEXTAUTH_URL` làm base, `sameSite: "none"` khi production
- ✅ **My Metrics — phân quyền**: chỉ creator + whitelist mới thấy tab

**s149 — đã làm (2026-08-17):**
- ✅ **B2B Tier Performance export**: đổi CSV → Excel, gộp strategic + all tiers, thêm cột Tier (commit 1bc594d → merge main)
- ⚠️ **BC Datapool**: xác nhận code hoàn chỉnh, thử 5 variant MD5 signature đều trả `[1008]` → AppSecret `082746f265c6412da554855fe415785a` SAI, chờ Hiếu lấy secret đúng từ BC support

**s148 — đã làm (2026-08-14):**
- ✅ **BC Datapool integration**: tab `/analytics/bc-datapool` (Product group), sync cron 7h ICT, tra cứu F011/F012/F023/F046, debug endpoint `/api/bc/debug`
- ✅ **Staff tab — 3HK Target tách Strategic/Non-Strategic**: migration v37, update API + page
- ✅ **Staff tab — fix button Sửa**: chỉ hiện với role có quyền (admin/creator/manager/bod + explicit grant); fix bug input chỉ nhập 1 số; cảnh báo số âm/không hợp lệ

**⚠️ BC Datapool — ĐANG BỊ CHẶN (cần Hiếu xử lý):**
- Channel ID: `GohubDataPool` ✅ (BC tìm thấy)
- AppSecret hiện tại `082746f265c6412da554855fe415785a` ❌ → BC luôn trả `[1008] Signature verification failed`
- Đã debug kỹ: formula `md5(appSecret + jsonBody)` đúng theo spec, nhưng secret sai
- **Việc cần làm**: Liên hệ BC support, hỏi: *"AppSecret `082746f265c6412da554855fe415785a` cho channel GohubDataPool có đúng không? Vui lòng xác nhận hoặc cung cấp secret đúng + 1 working example request."*
- Sau khi có secret đúng: cập nhật `BC_DATAPOOL_APP_SECRET` trên Vercel → bấm "Sync ngay" trên tab BC Datapool → test bằng "Test App Secret" trên tab Tra cứu

**s147 — đã xong (ghi lại):**
- ✅ Ẩn tab Tổ Gấu · Staff target · Inventory Management · Quarter Report · Quyền chỉnh sửa · My Metrics

**Ghi chú:**
- Quarter Report: target CM1 KH nhập là target QUÝ (không nhân × 3).
- Daily 【3】 theo QUÝ; nếu hiện "Chưa nhập target quý" → Hiếu nhập ở tab Quarter Report.
- Bé Gấu: Lark slow (skip — giới hạn kiến trúc)

---

## Đọc theo thứ tự khi bắt đầu session mới

> ⚠️ **Multi-machine**: `Bug.txt`, `new_info.txt`, `docs/ERRORS.md`, `docs/SYSTEM.md`, `docs/CHANGELOG.md` bị **gitignore** (local-only trên máy gốc của Hiếu, KHÔNG sync qua git — xem commit `4b47996` "docs chỉ commit wiki — gỡ internal docs khỏi remote"). Trên máy mới clone/checkout, các file này **có thể không tồn tại** — bình thường, không phải lỗi, đừng báo "thiếu file". Dùng bước 2–3 dưới đây làm nguồn thay thế đầy đủ.

1. **CLAUDE.md** (file này) — trạng thái + rules
2. **`docs/session_summary.txt`** — log chi tiết từng session (nếu có trên máy) — context lịch sử, thay `docs/CHANGELOG.md`. Đọc từ cuối file lên (session mới nhất trước).
3. **`docs/wiki/`** (45 file, **git-tracked, LUÔN có** trên mọi máy) — nguồn tham chiếu đầy đủ nhất, đọc hết 1 lần đầu session (hoặc khi được yêu cầu "đọc hệ thống"):
   - `docs/wiki/system/*.md` — kiến trúc hệ thống, chatbot 7-agent + Guardian, Operations Runbook (thay `docs/SYSTEM.md`)
   - `docs/wiki/Tab/_analytics-data-model.md` — đọc TRƯỚC mọi tab analytics khác (bảng fact/dim, `getAnalyticsSource`, filter chuẩn dùng chung)
   - `docs/wiki/Tab/*.md` — 1 file/tab web: mục đích · luồng data · API · công thức · **Gotchas** (mỗi tab có mục riêng — dùng thay `docs/ERRORS.md` khi file đó vắng mặt)
   - `docs/wiki/company|pricing|products|vendors|processes/*.md` — nghiệp vụ (mã SKU/Item, COGS 3HK, vendor priority, combo chuẩn, import NCC...)
4. **`new_info.txt`** (nếu có) — tick ✅ items chưa xong
5. **`docs/ERRORS.md`** (nếu có) — lỗi hay gặp; nếu KHÔNG có trên máy → tra mục "Gotchas"/"Vấn đề đã gặp" trong `docs/wiki/Tab/*.md` hoặc log lỗi trong `docs/session_summary.txt`
6. **`Bug.txt`** (nếu có) — khi user báo có bug

---

## Rules bắt buộc

1. **Staging-first** — mọi thay đổi lên `staging`. KHÔNG push thẳng `main`.
2. **KHÔNG tự merge** staging → main dù staging PASS, chờ Hiếu yêu cầu rõ ràng.
3. **UI Strict Lock** — không đổi màu/bố cục/font/chart analytics mà không có chỉ thị từ Hiếu/Bảo.
4. **Wiki sync** — sửa tab nào → cập nhật `docs/wiki/Tab/<tên-tab>.md` ngay cùng lần.
5. **Commit + push sau mỗi task** — không batch nhiều task thành 1 commit lớn.
6. **tsc trước khi push** — `npx.cmd tsc --noEmit` (PowerShell, không phải `npx tsc`).

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
| Wiki từng tab | `docs/wiki/Tab/<tên-tab>.md` |
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
