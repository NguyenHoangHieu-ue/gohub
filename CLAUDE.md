# CLAUDE.md — GoHub Intel · START HERE

> File này auto-load mỗi session. Đọc hết trước khi làm bất cứ thứ gì.
> Lịch sử chi tiết từng session nằm ở `docs/session_summary.txt` (đọc từ cuối lên) — file này CHỈ giữ
> trạng thái hiện tại + rule + checklist việc còn phải làm, không giữ narrative cũ (rút gọn s189 2026-09-05).

---

## Trạng thái hiện tại (2026-09-21, s203+1)

| | |
|---|---|
| ⏳ **s203+1 (2026-09-21) — 3HK Data Usage: nút "Export theo tháng" bảng Average Usage by SKU (đã push staging, CHƯA merge main, chờ Hiếu thử file)** | Hiếu: export nhiều tháng cần cột tháng để phân biệt + thống kê. Nút ở header bảng SKU (`exportMonthly`, `3hk-usage/page.tsx`) xuất đúng cột bảng UI: Tháng · SKU · Active SIMs · Total Plan · Kế hoạch/ngày/SIM · Total Actual · Avg. Usage % · GB/ngày/SIM, mỗi dòng = SKU × tháng của kỳ lọc, theo tab + Search (không có dòng "Cả kỳ" để pivot không cộng đôi). Export Records thêm cột Tháng/Kỳ từ/Kỳ đến. Lịch sử: bản 1 thiếu cột, bản 2 nhiều sheet quá tay → Hiếu chốt đúng cột bảng SKU (commit chốt `33db63e8`). ⚠️ Tổng Active SIMs các tháng của 1 SKU > số bảng UI (1 SIM = 1 lần cả kỳ) — đúng thiết kế. tsc PASS. Wiki `analytics-3hk-usage.md` §9. |
| ⏳ **s203 (2026-09-21) — Audit + tăng tốc toàn bộ tab analytics (đã push staging, CHƯA merge main, chờ Hiếu QA)** | Hiếu: "nhiều tab load rất lâu". Đo thật (không đoán) bằng route mới `/api/analytics/perf-probe` (creator) + log `[analytics-db] SLOW wait=… run=…`. **3 nguyên nhân gốc**: (1) **`TRIM()` phía `dim_customer` trong JOIN** (`TRIM(f.customer_code)=TRIM(c.code)`) làm join 355k dòng mất **9,6-10,9s**, đổi `TRIM(f.customer_code)=c.code` còn ~1s, kết quả y hệt (đã verify data sạch) — sửa 22 file (b2b/*, bod-data, quarterly-*, squad-progress, staff, customer, all-time, order-report…); (2) **Supabase 280-450ms/hop từ iad1** (gohub_dw chỉ ~30ms) mà cache L2 cũ dùng chính Supabase + route đọc cấu hình nối tiếp; (3) **gohub_dw chạy gần như TUẦN TỰ** (3 query nặng song song = 3× thời gian 1 query) nên tổng số lần quét bảng fact mới quyết định độ trễ, pool `max=3` không phải nút thắt. **Đã làm**: `cachedQuery` = L1 45s + **L2 Vercel Runtime Cache** (4-15ms, nén gzip mục >400KB vì trần 2MB im lặng) + **stale-while-revalidate** (hết TTL trả bản cũ ≤6h + tính lại nền `waitUntil`) + dedupe request đồng thời + ghi L2 không chặn; ETL sync dùng `softExpireAll` + prewarm nền thay xoá cứng; `lib/memo.ts` memo 15-20s cho settings/partner tiers/`user/me`/layout quyền; Quarter Report **7→2 query** (`splitQuarterRows`), lifecycle 112k KH nén 3,4MB→0,7MB, **squad-progress trước KHÔNG cache** nay có; BOD song song + `fetchBODGroupMarginMulti` (bod-summary 10→4 query); B2C Advanced gửi `live=1` thay `nocache=1` mỗi lượt xem (trước 5-60s mỗi lần mở tab); BOD/Dashboard bắn request "tháng trước" cùng lúc; planning/targets cache. **Kết quả đo (staging, cold→)**: quarterly-report 14,4s→4,6s · squad-progress 17,2s→5,7s · b2b-performance 21,5s→2,0s · lượt xem thứ 2 mọi tab 0,5-4s (chỉ Website 4,1s = GA4 ngoài, CS 4,2s). Mọi route sửa đều **diff JSON với bản cũ = 0 khác biệt**. tsc + vitest 359 PASS. Chi tiết + quy tắc SQL: wiki `analytics-data-model.md` §10, `analytics-quarterly.md`/`analytics-b2c.md`/`analytics-bod.md` §s203. ⚠️ Runtime Cache tách `preview`/`production`: sau khi merge main, lượt xem đầu tiên mỗi khoá trên production vẫn cold (B2C customer-breakdown ~60s do Admin API) — gọi tay `GET /api/cron/prewarm-analytics` (Bearer CRON_SECRET) để làm nóng. |
| ✅ **s202 (2026-09-20) — Bridge ghi nhận thiết bị (creator-only) + gộp Giám sát Dữ liệu vào "Dữ liệu & API" + SQL Query kiểu Power BI (Query Studio) + fix cron `refresh-monthly-kpis` — đã merge main (`c1eba247`), production deploy OK** | **Bridge**: extension 1.1.0 sinh `deviceId`, gửi OS/arch/Chrome/ext version/múi giờ/email tài khoản Chrome (`identity.email`); server (`lib/bridge-device.ts` `authBridge`) bắt buộc `X-Device-Id` (bản cũ bị 400), ghi IP, gắn device+IP vào từng lệnh claim. Migration `v61_browser_bridge_devices.sql` (Hiếu đã chạy). **Thông tin thiết bị + nhật ký lệnh CHỈ creator xem/sửa — admin cũng không** (API `bridge/devices` gate `getDbRole`, test `bridge-devices-route.test.ts`); user khác chỉ thấy dòng thông báo minh bạch. Chrome KHÔNG cho extension đọc tên máy. Đã QA sống: lệnh `list_tabs` gắn đúng máy/IP. **Giám sát Dữ liệu**: 3 mục thành 1 trang liền (`data-health-view.tsx`), gộp vào `/analytics/creator/devtools` tab con "Giám sát" (chỉ creator thấy); `/creator/data-health` chỉ còn redirect; nav đổi tên "Dữ liệu & API". **Query Studio** (`devtools/query-studio*.tsx`, `lib/query-studio.ts`): Data pane + editor + Visualizations (Table/Column/Bar/Line/Area/Donut/Card, Axis/Legend/Values + Sum/Avg/Count..., Top N chỉ trục chữ, Stacked, kéo-thả), bảng sort/lọc/tổng cột, lịch sử, toàn màn hình; `/api/admin/sql-query` cắt 10.000 dòng. **Cron `refresh-monthly-kpis`**: chỉ export POST nên Vercel Cron (GET) nhận 405 mỗi đêm từ lúc tạo → `analytics_monthly_kpis` đứng yên ở lần chạy tay 2026-07-20 (Bé Gấu thiếu doanh thu/CM1 tháng 8-9). Đã thêm GET + alert Lark khi ghi lỗi/một phần + test `cron-methods.test.ts` (bắt mọi cron trong `vercel.json` phải export GET); đã backfill 9 dòng, Đối chiếu "Khớp" 8/8. tsc + vitest 328 PASS. Chi tiết: wiki `analytics-devtools.md`, `analytics-data-health.md`, `analytics-creator-ai.md` §Bridge s202, `docs/session_summary.txt` s202. |
| ✅ **s201+2..+5 (2026-09-19) — Thông báo Lark nêu tab + vendor mới tự động + Catalogue: tên vendor theo ref_vendors, ẩn Inactive/Preparing, bộ lọc tiếng Anh + Unlimited — đã merge main** | **Thông báo Lark nêu TÊN TAB**: `notify-release.yml` gửi kèm danh sách file mỗi commit; `lib/release-tabs.ts` `tabsForFiles()` suy tab từ ĐƯỜNG DẪN FILE (nhãn lấy từ `nav.ts`, tab mới tự có tên) + route luôn ghép dòng `📍 Tab: …`. **Vendor mới tự động**: `sync.py` `sync_new_vendors()` tự chèn `ref_vendors` (không ghi đè, tên tạm theo operator, `description` "Tự thêm bởi sync") + thông báo `visibility=all`; `flush_catalogue_cache()` xoá cache `catalogue:%` sau sync. **Bug tên vendor**: bảng `VENDOR_NAMES` trong code từng thắng `ref_vendors` nên BC Datapool tách 2 (`WD`=CMHK, `W1`=Singtel) hiện sai — nay `ref_vendors` không IN HOA THẮNG (nguồn sự thật do admin sửa), IN HOA/thiếu mới dùng bảng chuẩn. **Catalogue**: `HIDDEN_STATUSES` = Inactive+Deleted+Preparing loại từ server (chỉ còn Active/Temporary = 1.042 gói, chi tiết 404 cho gói bị ẩn); tự thích ứng vendor/loại SIM/kiểu data/trạng thái/nước mới (`auto-names.ts`, banner xanh chỉ admin/creator); bộ lọc trang nước bằng TIẾNG ANH: Scope / Type / Data (Fixed, Daily, **Unlimited** = gói có SKU không giới hạn, kết hợp được) / Other (`filter-labels.ts`); thẻ gói + ngăn chi tiết vẫn tiếng Việt. tsc + lint (0 lỗi) + vitest 299 + pytest 18 PASS. Chi tiết: `docs/wiki/system/tabs/analytics-catalogue.md` §3b-3d, `docs/session_summary.txt` s201+2..+5. |
| ✅ **s201 (2026-09-19) — Sửa sync PM→Supabase (gốc rễ) + dựng lại Product Catalogue — đã merge main (`b3d2d848`), đã backfill + verify sống** | **Sync**: Supabase products/skus/listings/items đóng băng từ 2026-07-20 — gốc: `sync.py` tải cả 4 bảng rồi mới ghi mà items (233k dòng) tải ~100' (server cắt 200 dòng/trang, 4 luồng KHÔNG nhanh hơn tuần tự) nên run 09-18 hết timeout 90' ở 89% và KHÔNG ghi gì kể cả 3 bảng nhanh. Fix: `sync.py core|items|all` (core upsert ngay từng bảng; items ghi theo khối `sink` + upsert tự CHIA ĐÔI khi Supabase `57014 statement timeout`), tải trang song song có giới hạn, retry cấp trang + cooldown chung, timeout kết nối, flush log, model API chịu trường thiếu (API bỏ `expirations`). `sync.yml`: cron hằng ngày 01:00 UTC CHỈ job `core` (~9'), cron Chủ nhật 02:00 UTC job `items` (~38'), chạy tay = cả hai. Catalogue KHÔNG dùng bảng items (chỉ products/skus/listings); items phục vụ tab Item ở /skus + Bé Gấu tra giá bán/alias. `/api/items` đổi `count: estimated` (exact vượt timeout). ⚠️ `.gitignore` có `backend/` → file mới trong đó cần `git add -f`. Backfill: `gh workflow run sync.yml --ref staging`. **Catalogue**: đập bản s198, dựng lại "chọn nước → theo nhà cung cấp → ngăn chi tiết tiếng thường", chỉ Supabase, giá vốn chỉ admin/creator/product. Nước lấy từ `products.supported_countries` (không suy từ mã SKU). |
| ✅ **s200+12 (2026-09-18) — Lọc bỏ commit đồng bộ wiki + thay đổi nhỏ nhặt khỏi thông báo Lark — đã merge
  main, đã verify sống** | Hiếu: commit sync wiki/tài liệu và thay đổi nhỏ nhặt không cần noti. Chặn CỨNG
  (không tốn Gemini) commit `docs:`/`docs(scope):` ngay tại `parseCommits()` (route
  `api/notify/release`) trước khi vào Gemini — quy ước prefix commit sẵn có của repo. Phần "nhỏ nhặt"
  (đổi tên biến/format/gộp code trùng không đổi hành vi/bump version...) giao cho Gemini lọc qua
  `SYSTEM_PROMPT` (`release-notify.ts`) — 2 rule mới "BỎ HẲN wiki/tài liệu dù chung 1 commit" + "BỎ HẲN
  thay đổi nhỏ nhặt", cùng rule cũ "trả rỗng nếu không còn gì đáng nói" nhấn mạnh "thà bỏ sót còn hơn báo
  phiền". tsc + lint (0 lỗi mới) + vitest PASS. **Đã merge main + verify sống bằng curl trực tiếp** —
  gọi `/api/notify/release` với commit thật khớp mẫu, nhận đúng format `🚀 [Production]...` +
  `🧪 Còn trên staging...`, gửi tin thật vào group Lark thành công.
| ✅ **s200+11 (2026-09-18) — Thông báo Lark phân biệt Staging/Production + kèm backlog staging chưa merge
  — đã merge main, đã verify sống bằng curl** | Hiếu: staging thì note "thay đổi trên staging", production
  thì note "đã đưa lên production" + liệt kê thêm "có trên staging nhưng chưa lên production". Workflow
  `notify-release.yml` đổi trigger `on:push branches:[main,staging]` (trước chỉ `main`); khi push `main`
  thêm bước `git log origin/main..origin/staging` tính backlog, gửi kèm field `pendingCommits` +
  `environment`. Route `api/notify/release` build message khác nhau theo `environment` — staging:
  `🧪 [Staging] Vừa cập nhật (đang test, chưa lên production)`; production: `🚀 [Production] Vừa lên
  production` + (nếu có pending) khối `🧪 Còn trên staging, CHƯA lên production`. **Bug thật gặp lúc code**:
  dùng ký tự `` (control byte) làm delimiter trong lệnh `git log --pretty=format` + script Node lồng
  trong YAML — bị JSON-unescape thành byte 0x1F thật khi ghi file qua tool, làm hỏng cú pháp YAML (GitHub
  Actions fail "workflow file issue", 0 giây, không log gì). Phát hiện qua `od -c` (thấy byte bát phân
  `037`) + validate bằng `js-yaml`. Fix: đổi delimiter sang chuỗi in được `'|||'`. tsc + lint + vitest PASS.
  **Verify sống**: sau khi deploy, curl trực tiếp `/api/notify/release` (bypass workflow) với dữ liệu mô
  phỏng — trả đúng cả 2 nhãn môi trường + khối backlog, gửi tin thật vào group Lark. Vercel
  `get_deployment` xác nhận đúng commit SHA đang chạy production. Response ban đầu (ngay sau lúc vừa
  redeploy) còn trả format CŨ — do độ trễ lan truyền edge, KHÔNG phải bug — retest vài phút sau ra đúng
  format mới, xác nhận chắc chắn không phải lỗi code.
| ✅ **s200+10 (2026-09-18) — 3HK Data Usage: Zone table drill-down theo nước, bỏ bảng Country×Month riêng
  — đã push staging + merge main, đã verify sống** | Tiếp ngay s200+9 (khi đó vẫn giữ song song bảng theo
  nước + theo zone). Hiếu: bảng Zone phải cho biết "zone nào có nước nào" (bấm 1 zone → xổ breakdown các
  nước), sau đó bỏ hẳn bảng theo nước riêng. Thêm `zoneMembers` (zone→danh sách nước, sort TB giảm dần) +
  state `expandedZone` — bấm cả hàng Zone → xổ bảng con thu nhỏ/thụt lề ngay dưới, đóng lại bấm lần nữa.
  Xoá hẳn card "Data Usage by Country × Month" + dọn code chết đi kèm (`countryGrand`, `exportCountryCsv`).
  `exportZoneCsv` đổi xuất đủ 2 cấp (mỗi Zone kèm nước con, prefix `"  · "`). tsc + lint (0 lỗi mới) +
  vitest (261/261) PASS. **Đã tự verify sống trên staging qua Chrome** (lần đầu load dính cache cũ, reload
  lại đúng) — bấm Zone A xổ đúng China/Japan/Philippines/USA... sort TB giảm dần.
| ✅ **s200+9 (2026-09-18) — 3HK Data Usage: 3 việc theo yêu cầu Hiếu, cả 3 verify SQL trực tiếp trước khi
  code** | (1) **Fix regression thật**: bảng "Data Usage by Country × Month" bị đổi dùng CHUNG
  `startDate`/`endDate` với bộ lọc SKU chính (không rõ session nào gây ra) → chỉ hiện đúng 1 tháng, trái
  thiết kế gốc s95 (độc lập, tự tính cửa sổ rộng). Trả lại đúng thiết kế: cửa sổ tự tính
  `MAX(report_date)-23 tháng`, không phụ thuộc filter nào — verify lại T6=186,80 TB khớp số cũ. (2) **Thêm
  bảng "Data Usage by Zone × Month"** — nhóm 47 nước Supabase `ncc_3hk` thành 4 Zone (A=A1+A2 gộp, B, C,
  D) qua route có sẵn `GET /api/ncc/3hk-zones`, tính lại từ `countryRows` (không thêm query gohub_dw).
  Alias tên nước (USA≠US, United Kingdom≠UK, Slovak Republic≠Slovakia) + "Chưa rõ Zone" cho nước thiếu
  trong `ncc_3hk` (chỉ Latvia, 0,01 TB). Verify TỔNG 4 ZONE khớp tuyệt đối GRAND TOTAL theo nước
  (1.237,60 TB). (3) **Fix trùng mã P giữa SKU CŨ (14kt) và MỚI (13kt)** — verify SQL: P-mới (vị trí 8) =
  Daily thật (0/792 SKU có "UNL"); P-cũ (vị trí 10) = thực chất Unlimited (350/350 SKU có "UNL", nằm trong
  token "UNLIP1/P2") — 2 nghĩa trái ngược bị gộp chung 1 bucket khi xem tab "Tất cả". Thêm `skuVintage()`,
  mọi nơi gom theo ký tự giờ tách badge "mã mới · 13kt"/"mã cũ · 14kt". tsc + lint (0 lỗi mới) + vitest
  (261/261) PASS cả 3 việc. **Đã tự QA qua Chrome trên staging** (bảng Unlimited breakdown hiện đúng badge
  vintage, chart "Mã loại gói..." tách riêng "P (mã mới)"/"P (mã cũ)").
  ⚠️ **Phát hiện thêm khi Hiếu hỏi lại "sao Zone khác data tổng"** (cùng ngày, sau khi build xong Zone):
  verify sâu hơn phát hiện T8/2026 lệch bất thường — `data_usage_log` (nguồn bảng Zone, RAW không lọc gì)
  = 181,25 TB; `fact_data_usage` sau loại mã K (nguồn "data tổng" KPI/bảng SKU) = 153,50 TB — lệch 27,75
  TB (~15%), trong khi T1-T7 lệch <0,25% (nhiễu làm tròn bình thường). Đào tới gốc: mã K (khung SIM) tháng
  8 đột nhiên gánh **5.235 ICCID / 27,60 TB** usage thật (T4-T7 chỉ 0-8 ICCID, gần 0 TB) — khớp gần tuyệt
  đối phần lệch. **Kết luận: bảng Zone KHÔNG sai** (raw đầy đủ nhất, không có SKU để lọc) — lệch là do
  ~5.235 SIM tháng 8 bị GÁN NHẦM sang mã khung SIM ở phía nguồn/ETL, nên bị loại khỏi "data tổng" (đúng
  logic loại-K theo yêu cầu Hiếu s200+4). **Đây CHÍNH LÀ vấn đề đã ghi nhận nhưng CHƯA sửa từ audit s198**
  ("SKU K gánh usage bất thường — nghi dữ liệu nguồn 3HK gộp nhầm") — giờ xác định chính xác hơn: CHỈ xảy
  ra ở đợt nạp tháng 8 (17/09), không phải lỗi lặp lại mọi tháng. **Cần Hiếu quyết định hướng xử lý** (chưa
  làm gì thêm, chỉ mới định vị chính xác nguyên nhân) — xem mục checklist bên dưới.
| ✅ **s200+8 (2026-09-18) — Tự động báo group Lark khi có tính năng mới lên production — đã merge main**
  | Hiếu: muốn 1 group Lark tự nhận thông báo mỗi khi merge tính năng mới. 3 quyết định qua
  AskUserQuestion: (1) CHỈ báo khi merge `main` (không báo mỗi lần push staging, tránh spam lúc code dở);
  (2) nội dung do Gemini tóm tắt commit message (vốn viết chi tiết kỹ thuật) thành thông báo ngắn không
  thuật ngữ code; (3) group MỚI riêng, tách khỏi group đang nhận thông báo sync/SKU đổi giá hiện có.
  Luồng: `.github/workflows/notify-release.yml` (trigger `push:[main]`) gom `github.event.commits` →
  `POST /api/notify/release` (auth `Bearer $MCP_SECRET`) → `summarizeReleaseCommits()`
  (`lib/release-notify.ts`, Gemini `gemini-3.8-flash` `thinkingLevel:"low"`) → gửi group đọc từ
  `app_settings.lark_release_chat_id` (key MỚI, tách `lark_notify_chat_id`). Đặt group đích qua lệnh Lark
  mới `/set-release-channel` (chỉ admin/creator, mention bot trong group muốn nhận). tsc + lint (0 lỗi
  mới) + vitest (261/261) PASS. **Cần Hiếu**: add bot vào group muốn nhận → mention bot gõ
  `/set-release-channel` → bot xác nhận. ⚠️ Phụ thuộc CÙNG bug `MCP_SECRET` lệch ở mục s200+7 — sửa 1 chỗ
  hết lỗi cho cả 2 tính năng Lark notify.
| ✅ **s200+7 (2026-09-18) — Điều tra thông báo sync lỗi + thêm loại "success" — đã merge main** | Hiếu
  nhận thông báo lỗi sync (502 từ `api-pm.space.gohub.com`). Verify qua `gh run list`/`gh run view`: lỗi
  502 từ chính GoHub API (upstream, ngoài repo) — `urllib3.Retry` (fix s198+11) đã retry đúng nhưng hết
  lượt vì 502 kéo dài, không phải bug code. **Phát hiện thêm 1 bug thật**: step "Notify Lark" trong
  `sync.yml` (gọi `/api/notify/lark`, `Bearer $MCP_SECRET`) trả **401 mọi lần chạy gần đây** (cả lần
  KHÔNG lỗi) — `MCP_SECRET` GitHub Actions lệch `MCP_SECRET` Vercel, chặn âm thầm toàn bộ thông báo Lark
  nhóm về SKU/giá đổi (`visibility=all`) từ ít nhất vài ngày qua. **Cần Hiếu**: đối chiếu lại 2 giá trị
  secret. **Thêm theo yêu cầu Hiếu — thông báo sync THÀNH CÔNG**: trước chỉ có `type="error"` (s198+12),
  không có gì báo khi xong việc. `sync.py` giờ insert `type="success"` vào bảng `notifications` sau khi
  `main()` chạy xong không lỗi (kèm số dòng mỗi bảng products/skus/listings/items); chuông web thêm icon
  ✅ xanh lá. Không cần migration (cột `type` là text tự do). tsc + lint (0 lỗi mới) + vitest (261/261)
  PASS.
| ✅ **s200+6 (2026-09-17) — Vá kiến trúc cache "phải tự tay bấm Tải lại mới" — 2 phần theo yêu cầu Hiếu
  "làm luôn cả 2", tsc+lint+vitest (261/261) PASS, chờ Hiếu setup cron-job.org** | Hiếu hỏi hướng giải
  quyết triệt để hiện tượng cache đôi lúc trả số cũ dù có cơ chế clear, đôi lúc vẫn phải tự làm. Audit
  trực tiếp code (không đoán, đọc hết `analytics-helpers.ts` + tất cả route dùng `fetchQuarterlySettings`):
  xác nhận đúng 6 route (`b2b/kpis`, `b2c/kpis`, `b2c/performance`, `b2c/trend`, `b2b/strategic-performance`,
  `monthly-kpis`) fetch settings loại trừ KH (`excludedCustomers`) fresh mỗi request rồi bake vào SQL bên
  trong `cachedQuery`, nhưng KHÔNG hash vào cache key (khác `b2b/trend`/`b2b/performance`/Quarter Report —
  các route này vốn đã đúng từ trước, có `exclHash(...)` trong key) — đổi danh sách loại trừ ở Quarter
  Report Settings không tự làm mới các route trên tới khi hết TTL 60'. **Fix phần 1**: thêm
  `exclHash(excludedCustomers)` vào cache key cả 6 route (2 route — `b2b/strategic-performance`/
  `monthly-kpis` — phải dời lệnh fetch settings ra TRƯỚC dòng tính key, trước đó nằm trong callback
  `cachedQuery`) — tự invalidate qua đổi key, route ghi dữ liệu (`quarterly-settings`) không cần sửa gì
  (đúng tinh thần "backend tự lo" thay vì FE tự gọi flush sau save). `partner_tiers` (Vendors/Strategic
  list riêng, khác `quarterly_tier_keywords`) đã đúng từ s195+8 (gọi `flushAnalyticsCache()` khi lưu) —
  không có gap. **Fix phần 2 — ETL-completion-driven flush**: route mới `/api/cron/etl-cache-sync` theo
  dõi trực tiếp `jobs`/`job_logs` (gohub_dw, verify tên job thật qua SQL trên staging) cho 4 job ảnh hưởng
  số liệu BI nhiều nhất (`ETL_dim`/`ETL_vatdb_cogs`/`ETL_fact_fulfilment_revenue_from_ops_admin_v2`/
  `ETL_fact_sales_revenue_from_gohub_cloud`) — job nào vừa nạp xong data mới (so `end_time` mới nhất với
  lần check trước, lưu `app_settings.etl_cache_sync_last_seen`) → `flushAnalyticsCache()` ngay, không chờ
  TTL mù. KHÔNG đăng ký `vercel.json` (Hobby plan giới hạn 1 lần/ngày/job, không đủ tần suất theo kịp ETL
  chạy hàng giờ) — dùng cron-job.org ping 10-15'/lần (đã có sẵn cho browserless keep-alive, xem mục
  "s195"). Chi tiết đầy đủ: `docs/wiki/system/analytics-data-model.md` mục 8. **Cần Hiếu**: thêm 1 job
  cron-job.org mới gọi `GET https://<domain>/api/cron/etl-cache-sync` (header `Authorization: Bearer
  $CRON_SECRET`) mỗi 10-15 phút — có sẵn `POST` cùng route (đăng nhập admin/creator) để tự bấm test tay
  trước khi setup cron-job.org.
| ✅ **s200+5 (2026-09-17) — Quarter Report (Organization): tạm thời chỉ admin/creator xem được** | Hiếu
  yêu cầu giới hạn quyền. Bỏ `"quarterly-org"` khỏi `DEFAULT_ROLE_PERMISSIONS.bod` (trước tự động có qua
  `ALL_ANALYTICS_IDS`) và khỏi mảng `b2b` trong `lib/analytics-roles.ts` — admin/creator đã bypass hẳn ma
  trận quyền này (`analytics/layout.tsx` + `sidebar.tsx`) nên không cần sửa gì thêm. Giữ nguyên trong
  `ALL_ANALYTICS_IDS` để còn cấp riêng qua `allowed_analytics` per-user sau này nếu cần. tsc + lint (0
  lỗi mới) + vitest (261/261) PASS. Đã push staging, chưa merge main.
| ✅ **s200+4 (2026-09-17) — 3HK Data Usage: loại hẳn SKU khung SIM + đổi Unlimited breakdown/chart sang
  mã ký tự** | Tiếp ngay s200+3, Hiếu phản hồi 3 điểm: (1) SKU `1D0003DK00000` (mã K) xác nhận là "khung
  SIM", không phải gói data thật → loại HẲN khỏi mọi tính toán (trước chỉ tách bucket "Other") — verify
  sống: tổng bundles 36.977→31.742 (đúng -5.235). (2) Đổi chart "Mã SKU chiếm bao nhiêu SIM" (per-SKU,
  1366 mã quá chi tiết) sang gom theo KÝ TỰ PHÂN LOẠI — vị trí 8 (SKU 13 ký tự) / vị trí 10 (SKU 14 ký tự
  cũ, Hiếu chỉ định chính xác) — verify vị trí 10 cho ra P/F hợp lý trên data thật. (3) Đổi breakdown
  "Unlimited — Breakdown theo gói" (nhóm tốc độ 500MB·5mbps...) sang trực tiếp theo mã (A/B/C/.../X) —
  nhờ đó bỏ hẳn `/api/analytics/3hk-speed-map` (route đã XOÁ, chỉ nhận diện A/B, lỗi thời sau s200+3), 2
  chart phụ giờ tự phủ mọi mã Unlimited. tsc + lint (0 lỗi mới) + vitest (261/261) PASS. Đã tự verify
  sống trên staging cả trước và sau khi code (A=416, B=2.387, X=26 SIM — khớp tuyệt đối). Wiki
  `docs/wiki/system/tabs/analytics-3hk-usage.md` viết lại đủ §3.1/§7 + 2 bảng data-source. Đã push
  staging, chưa merge main.
| ✅ **s200+3 (2026-09-17) — 3HK Data Usage: fix phân loại Daily/Fixed/Unlimited sai + chart mới "Mã SKU
  chiếm bao nhiêu SIM"** | Hiếu báo mã X (và tương tự) là Unlimited nhưng bị xếp Daily, kèm ảnh bảng
  mapping cấu trúc SKU chuẩn 13 ký tự. Verify trực tiếp SQL trên staging: field quyết định loại gói là 1
  ký tự ở VỊ TRÍ 8 của SKU CODE 13 ký tự — code cũ chỉ nhận Unlimited qua substring `%UNL%`, đúng cho A/B
  (amount field cũng ghi "UNL") nhưng SAI cho C/D/E/G/H/L/X (không có "UNL" trong chuỗi, vd
  "EAANZ3DX00303") → rơi về `sku_type` nguồn 3HK vốn gán nhầm theo tên phụ. Đổi CASE theo vị trí ký tự 8
  (bảng mapping đầy đủ trong wiki) — K (placeholder eSIM profile/SIM frame) tách riêng bucket "Other"
  thay vì gộp nhầm Fixed. Verify sống: Fixed -5235 SIM = Other +5235 (đúng số SKU K), Daily -26 =
  Unlimited +26 (đúng số SKU X) — khớp tuyệt đối. Kèm fix `daysOfSku()` (cột GB/ngày/SIM tab Unlimited,
  trước luôn "—" cho C/D/E/G/H/L/X). Thêm chart mới "Mã SKU chiếm bao nhiêu SIM" (bar ngang top 15 + gộp
  "Khác", dùng lại data đã fetch, không thêm query). tsc + lint (0 lỗi mới) + vitest (261/261) PASS. Đã
  tự verify sống trên staging (số liệu khớp verify SQL tuyệt đối). Wiki
  `docs/wiki/system/tabs/analytics-3hk-usage.md` cập nhật đủ (§3.1 viết lại hẳn + Gotchas).
  **2 phát hiện thêm, CHƯA sửa — cần Hiếu quyết định**: (1) SKU `1D0003DK00000` (mã K) gánh 28k GB actual
  dù plan=0, nghi dữ liệu nguồn 3HK gộp nhầm; (2) `/api/analytics/3hk-speed-map` (2 chart nhóm tốc độ
  Unlimited) chỉ nhận mã A/B, chưa có bucket cho C(20mbps)/D(100mbps)/L(50mbps) — cần thiết kế thêm bucket
  nếu Hiếu muốn 2 chart đó phủ đủ mã mới. Đã push staging, chưa merge main.
| ✅ **s200+2 (2026-09-17) — 3HK Data Usage: pipeline đã tự chạy lại, thêm badge freshness** | Hiếu yêu
  cầu xử lý tiếp tab 3HK Data Usage (sau audit s199). Verify lại trực tiếp SQL trên staging: pipeline ĐÃ
  tự chạy — `fact_data_usage` có data tới 31/08/2026, `loaded_at` mới nhất = HÔM NAY. Đào sâu phát hiện
  quy luật: pipeline nạp theo **3 đợt lớn rời rạc** (15/07 nạp T1-T3, 20/07 nạp T4-T6, 17/09 nạp T7-T8) —
  KHÔNG phải ETL hàng ngày, nên tháng đang chạy (T9) luôn "thiếu" cho tới đợt kế — đúng đặc tính bình
  thường của pipeline ngoài repo, không phải lỗi lặp lại. Thêm badge freshness dưới tiêu đề tab (ngày data
  mới nhất + giải thích rõ "không phải bug web") để cắt vòng lặp hỏi→audit→giải thích đã lặp 2 lần trong
  tháng. tsc + lint (0 lỗi mới) + vitest (261/261) PASS. Đã tự verify sống trên staging. Wiki
  `docs/wiki/system/tabs/analytics-3hk-usage.md` cập nhật. Đã push staging, chưa merge main. Không cần
  Hiếu làm gì thêm — pipeline vẫn nằm ngoài phạm vi repo, tháng 9 sẽ tự có khi vendor 3HK chạy đợt kế tiếp.
| ⏳ **s200 (2026-09-17) — Quarter Report: New/Recurring/Inactive B2B Customers + trang mới Organization
  (đã fix 1 bug thật ngay đợt đầu, đã verify sống) — đã push staging, chờ Hiếu QA** | Hiếu yêu cầu (1)
  duplicate Quarter Report group theo Organization, (2) thêm 3 chỉ số vòng đời KH B2B (New/Recurring/
  Inactive) vào Tổng quan + Squad Progress. Lên plan qua EnterPlanMode (đã duyệt) trước khi code.
  **Lifecycle**: module dùng chung mới `lib/analytics-engine/b2b-lifecycle.ts` — `fetchB2BLifecycleRows()`
  quét MIN(ngày mua) toàn bộ lịch sử `fact_fulfillment_revenue` cho mỗi KH B2B (1 query GROUP BY, cache
  riêng 6h tách khỏi `QUERY_TTL_MIN` chung — tránh lặp lại lớp bug full-scan từng gây timeout B2C s195+15).
  `classifyB2BLifecycle()` (hàm thuần, 8 unit test) so `first_order_date` với quý đang xem — "trước đây" =
  TOÀN BỘ lịch sử (Hiếu chốt qua AskUserQuestion). Gắn vào `quarterly-report` (field `customerLifecycle`,
  3 StatTile mới ở Tổng quan) và `squad-progress` (field `lifecycle` per-squad + `totals`, kèm top 10 KH
  inactive theo doanh thu quý trước để leader gọi lại — badge 🆕/🔁/😴 cạnh risk-chip mỗi squad card).
  **Trang Organization**: `/analytics/quarterly-org` (nav.ts + sidebar.tsx + analytics-roles.ts, quyền
  bod/b2b/admin/creator) — route mới `quarterly-org-customers`. 🔴 **Bug thật phát hiện NGAY khi Hiếu xem
  lần đầu** ("hơi không phù hợp"): đợt code đầu chọn nhầm `dim_customer.organization_code` làm khoá gộp —
  verify trực tiếp qua Dev Tools SQL Query xác nhận cột này **100% RỖNG trên toàn bộ 355.389 dòng** (dead
  column), trong khi field THẬT có data là **`organization`** (text, 909 giá trị, 1050 KH gắn, vd
  "VN_Org Vietravel" gộp 26 mã KH chi nhánh) — route cũ vì vậy KHÔNG BAO GIỜ gộp được gì. Đã fix đổi khoá
  sang `organization` + thêm khối drill-down Organization → Khách hàng (đúng hệ phân cấp Hiếu mô tả: Tier
  → Organization → Customer, chỉ hiện tổ chức ≥2 mã KH — verify có 26/909 tổ chức như vậy, một số còn trải
  nhiều tier khác nhau giữa các chi nhánh). **Đã tự verify sống trên staging sau deploy** (gọi thẳng API
  qua Dev Tools, không chỉ tin code sạch): Shopeepay gộp đúng 4 mã, Apec Travel 3 mã, nhiều tổ chức VN 2
  mã — số liệu gộp đúng thật. Tái dùng nguyên `quarterly-report` API cho số tổng B2B đầu trang + component
  `<PivotTable>` có sẵn cho bảng tier (không viết bảng mới). KHÔNG có CH.Cost per-customer/Squad Progress
  ở trang Organization (v1, ghi rõ trong `LogicNote` đầu trang).
  tsc + lint (0 lỗi mới) + vitest (261/261, +8 test mới) PASS toàn bộ 6 commit. Wiki
  `docs/wiki/system/tabs/analytics-quarterly.md` cập nhật đủ (mục 7 Gotchas + bảng Đường dẫn).
  **⚠️ Lưu ý quy trình phát hiện lúc làm session này**: 7 commit đầu chỉ nằm local, quên `git push` —
  Hiếu báo "chưa thấy deploy" mới phát hiện ra, đã push bù (`git push origin staging`) và xác nhận Vercel
  build xong. **Đã push staging, CHƯA merge main.** Cần Hiếu QA trên staging — xem checklist bên dưới.
| ✅ **s199+5 (2026-09-16) — MERGE MAIN (Hiếu yêu cầu rõ ràng "merge main đi")** | Gộp TOÀN BỘ staging vào
  main (28 commit từ s198 Product Catalogue → s199+4 %MoM), merge sạch không conflict (`git merge ort`).
  tsc + vitest (253/253) PASS trên main trước khi push. Production đang tự deploy qua Vercel.
  **⚠️ Quan trọng nhất trong đợt này**: fix cron sync product/sku/listing/item (s198+11, chết 57 ngày do
  429 rate-limit) **GIỜ MỚI CÓ HIỆU LỰC THẬT** — GitHub Actions cron luôn chạy theo `main`, push staging
  trước đó KHÔNG đủ. Cũng gồm: fix chuông thông báo kẹt sidebar (s198+12), fix CS Troubleshoot sync
  timeout (s198+10), tab Product Catalogue đủ 9 đợt (s198), tab Data Health mới (s199+1), fix bug bảng KH
  B2B bỏ qua chọn tháng (s199+2), hạ cache TTL 12h→60' toàn hệ thống BI (s199+3), cột %MoM Quarter Report
  (s199+4). **Gợi ý Hiếu**: vào GitHub Actions tự trigger thử 1 lần workflow "Sync GoHub Data to Supabase"
  (Run workflow thủ công) thay vì chờ tới 01:00 UTC mai, xác nhận hết 429/timeout.
| 🟡 **s199 (2026-09-16) — Audit: tab 3HK Data Usage tháng 8 không có dữ liệu — KHÔNG phải bug web, đã xác
  nhận qua SQL thật** | Hiếu báo không thấy số tháng 8. Query trực tiếp staging (Dev Tools SQL Query,
  không đoán): `fact_data_usage` mới nhất chỉ tới **2026-06-30**, ETL `loaded_at` MAX = **2026-07-20**
  (đứng yên từ đó); `data_usage_log` (sub-report Country×Month) tới **2026-07-31**, cũng thiếu tháng 8.
  Tra bảng `jobs`/`job_logs` (registry ETL thật, 8 job đang active: dim/vatdb_cogs/fulfillment/sales/
  ops_sync×2/recon_telco/inventory) — **không job nào ghi vào 2 bảng này** → pipeline nạp usage 3HK nằm
  NGOÀI phạm vi repo (không phải cron `sync.yml` GitHub Actions của web, không có script nào trong
  `backend/`/`web/` ghi 2 bảng). Code tab đúng, không sửa gì bên web. **Cần Hiếu**: hỏi bên vận
  hành/vendor 3HK xem pipeline nạp `fact_data_usage`/`data_usage_log` vào gohub_dw còn chạy không (đã
  đứng yên >2 tháng tính đến hôm nay).
| ✅ **s199+4 (2026-09-16) — Thêm cột %MoM cho bảng "B2B — Chi tiết theo Nhóm × Tháng" (Quarter Report) —
  đã verify sống, đã push staging** | Hiếu yêu cầu thêm cột %MoM, chỉ ra ngay 1 điểm cần sửa: "T7 thì so
  với tháng 6 chứ nhỉ" — ban đầu làm T7 luôn "—" vì tháng 6 nằm ngoài `months` (quý hiện tại). Fix: route
  `quarterly-b2b-customers` thêm 1 query riêng fetch tháng liền trước tháng đầu quý (T6 cho Q3), aggregate
  theo tier×region, trả `tier.prevMonthRevenue`. Cột chỉ hiện ở view theo tháng (T7/T8/T9), "Cả Quý" giữ
  "—" (đã có %QoQ riêng). Cache key `qb2b_raw_v8`→`v9`. Verify sống staging: T7 Strategic %MoM=-8,6%
  (khớp tính tay). tsc + lint (0 lỗi mới) + vitest (253/253) PASS. Wiki cập nhật. **Đã merge main (s199+5).**
| ✅ **s199+3 (2026-09-16) — Fix root cause thật: cache 20 route BI hạ 12h→60 phút, khớp chu kỳ ETL thật
  — đã push staging** | Sau khi fix bug bảng KH (s199+2), Hiếu vẫn thấy card đầu B2B Performance lệch
  Quarter Report — cả Actual lẫn PR đều lệch (không phải so nhầm dòng). Verify từng số 1: lệch chỉ
  0,005-0,01% khi tự làm mới cả 2 route cùng lúc (không phải bug công thức) — nhưng khi KHÔNG chủ động
  refresh, `QUERY_TTL_MIN` (hằng số cache dùng chung cho 20 route BOD/B2B/B2C/Channels/Quarterly) đang
  set **12 tiếng**, dựa comment cũ "data gohub_dw đổi 1 lần/ngày". Verify trực tiếp bảng `jobs`/`job_logs`
  (gohub_dw): `fact_fulfillment_revenue`/`fact_sales_revenue` thật ra được ETL nạp **HÀNG GIỜ**
  (`50 * * * *`/`55 * * * *`) — comment cũ sai/lỗi thời. 2 tab cache ĐỘC LẬP nhau tới 12h → nếu không
  cùng bấm "Tải lại mới", có thể lệch nhau tới nửa ngày doanh thu thật — đúng cảm giác "cả actual lẫn PR
  đều lệch" (PR tính từ actual gốc, actual gốc cũ thì PR cũng lệch theo tỉ lệ). Hỏi Hiếu phạm vi fix
  (AskUserQuestion) — chọn hạ TTL CHUNG (1 hằng số, tự áp cho cả 20 route). Đổi `QUERY_TTL_MIN` 12×60→60
  phút (`analytics-helpers.ts`) — khớp chu kỳ ETL thật, còn dư biên an toàn. tsc + lint (0 lỗi mới) +
  vitest (253/253) PASS. Wiki `_analytics-data-model.md`/`analytics-b2b.md`/`analytics-b2c.md` cập nhật.
  **Đã merge main (s199+5).**
| ✅ **s199+2 (2026-09-16) — Fix bug thật: B2B Performance khác Quarter Report — đã verify sống trên
  staging, đã push** | Hiếu báo lệch số, verify API live (nocache) thấy TỔNG khớp tuyệt đối → tưởng chỉ
  so nhầm cột PR-vs-Actual, nhưng Hiếu khẳng định vẫn lệch thật → đào sâu bằng cách bấm trực tiếp nút T9
  trên UI Quarter Report: dòng NHÓM (Strategic/VIP/...) đổi đúng số theo tháng, dòng KHÁCH HÀNG bên dưới
  (Momo/VN Ecom Shopee...) đứng yên y hệt "Cả Quý" dù đã bấm T9 — bug thật `b2b-tier-section.tsx`: dòng
  KH luôn gọi `custPr(c)` (pro-rata CẢ QUÝ), biến chọn tháng không hề được đọc ở khối render này. Fix:
  `custMonthView()` mới lấy đúng 1 tháng từ `c.monthSummary`, ẩn badge %Tgt khi xem theo tháng (target
  chỉ có ở mức quý, so nhầm sẽ ra % sai), thêm badge kỳ đang xem. Verify sống staging: Momo T9 đổi từ
  3.513.919.900đ (sai, luôn=cả quý) → 513.013.388đ Act, khớp tuyệt đối B2B Performance. tsc + lint (0
  lỗi mới) + vitest (253/253) PASS. Wiki `analytics-quarterly.md` cập nhật. **Đã merge main (s199+5).**
| ✅ **s199+1 (2026-09-16) — Tab mới "Giám sát Dữ liệu" (Data Health, creator-only) — 3 khối, tsc+lint+
  vitest PASS, chờ Hiếu QA staging** | Hiếu: nhìn report/số thô khó tự phát hiện sai, mỗi lần nghi ngờ
  phải nhờ Claude vào DB check — cần 1 nơi quan sát/kiểm tra dữ liệu bằng mắt, không phải bằng câu SQL.
  Đề xuất trước qua chat + AskUserQuestion — Hiếu chốt làm cả 3 khối, chỉ Creator xem, note kế hoạch vào
  `PLAN_TMT.MD` (đã xoá sau khi làm xong, đúng yêu cầu). Trang mới `/analytics/creator/data-health`
  (nhóm Creator, gate cứng `role==="creator"`, KHÔNG qua role_permissions, KHÔNG cho admin bypass).
  **Khối 1 Độ tươi**: mở rộng ý tưởng có sẵn ở `db-status` (trước ẩn trong nút "Kiểm tra database" ở
  Settings, 12 bảng) — lưới card cho 6 nguồn (`data-health-config.ts`), mỗi card ngày mới nhất + badge
  🟢🟡🔴 theo ngưỡng riêng từng nguồn. **Khối 2 Bất thường**: sparkline doanh thu 30 ngày (Tổng/B2B/B2C),
  `detectAnomalies()` (`data-health-anomaly.ts`) rule-based (median 7 ngày liền trước, lệch ≥35% → chấm
  đỏ) — có unit test riêng. **Khối 3 Đối chiếu**: đổi thiết kế lúc code (bản nháp "so BOD vs Quarterly vs
  Dashboard" bỏ vì 3 tab có khác biệt THIẾT KẾ đã biết, dễ báo đỏ oan) — thay bằng so số **LIVE** (export
  thêm `computeMonthlyKpis()` từ cron `refresh-monthly-kpis`, không viết lại công thức) vs **SNAPSHOT**
  Supabase `analytics_monthly_kpis` (bảng Bé Gấu/chatbot đọc trả lời câu hỏi CM1/doanh thu) — lệch >5% =
  cron chưa chạy/lỗi, đúng lớp bug đã xảy ra nhiều lần (s198+10/+11). tsc + lint (0 lỗi mới) + vitest
  (253/253, +10 test mới cho `classifyFreshness`/`median`/`detectAnomalies`) PASS. Wiki
  `analytics-data-health.md` mới + thêm entry `HOME.md`. **Chưa push staging, chưa QA** — xem checklist
  bên dưới.
| ✅ **s198 (2026-09-14/15) — Tab mới "Product Catalogue" — 9 đợt, đã QA live mỗi đợt, đã fix 1 bug P0** | Hiếu:
  muốn 1 trang giới thiệu sản phẩm theo destination cho internal (sau đổi ý external→internal-only qua
  AskUserQuestion), tự đề xuất ý tưởng + lên plan (EnterPlanMode) + làm. Route mới
  `GET /api/analytics/product-catalogue` (1 query tổng hợp DUY NHẤT, đúng rule N+1 mới thêm) + trang
  `/analytics/catalogue`, đăng ký nav "Analytics & Planning" + quyền cho `bod`/`b2b`/`b2c`/`saleb2c`/
  `product` (`lib/analytics-roles.ts`).
  **Đợt 1**: kiến trúc 2 tầng Destination → dòng SP (vendor×SIM/eSIM), top 8 nước theo doanh thu 90 ngày,
  badge Best Seller/Fastest Growing/Best Value tính từ số liệu thật.
  **Đợt 2**: Hiếu yêu cầu sâu hơn — nâng lên **3 tầng: Destination → Loại sản phẩm → Sản phẩm cụ thể**.
  Loại SP quyết định bởi ProductType (ký tự 2 mã SKU, đọc đúng `docs/wiki/business/ma-sku.md`) +
  `local_phone_number` thật (Supabase `products`) — 4 nhóm eSIM/SIM × Data-only/Có gọi nội địa.
  **Đợt 3**: Hiếu gửi ảnh bảng chính sách QR/đổi máy theo vendor, yêu cầu soát kỹ Supabase `products`
  (đọc full 36 cột qua Dev Tools `api/config/db/table`) — bổ sung `data_type` (Fixed/Daily Data, field
  THẬT thay hẳn việc tự decode ký tự 8 SKU từng phải né vì 2 wiki nguồn ghi ngược nhau A/B),
  `daily_reset_time`/`apn`/`operator_code`/`telco_perks`/`unsupported_apps`/`onsite_carrier`. Thêm panel
  "Chính sách QR/đổi máy" theo operator, trích từ ảnh Hiếu (chỉ giữ thông số thực tế, bỏ quy trình CS
  nội bộ — không hợp catalogue giới thiệu).
  **Đợt 4**: Hiếu chốt trang chỉ để xem THÔNG TIN, không cần số liệu doanh thu — redesign FE bỏ hẳn $/%.
  Hero đổi sang Loại SP/Tổng SP/Nhà mạng hỗ trợ/Loại phổ biến nhất; sản phẩm đổi từ hàng ngang có cột $
  sang lưới card spec-sheet (data policy/network/APN/operator/perks), badge giữ dạng emoji góc card.
  `route.ts` KHÔNG đổi ở đợt 4 — badge vẫn tính từ revenue/growth thật backend, FE chỉ chọn không render.
  tsc + lint (0 lỗi mới) + vitest (243/243) PASS xuyên suốt cả 4 đợt, wiki `analytics-catalogue.md` cập
  nhật đủ. **Đã tự QA qua Chrome trên staging sau MỖI đợt** — trang USA (ví dụ Hiếu nêu) verify đủ 5
  loại SP, panel chính sách 3HK/BillionConnect đúng nội dung ảnh, card spec hiển thị đúng data_type/APN/
  operator/local carrier thật.
  **Đợt 5 (2026-09-15) — redesign kiến trúc thông tin theo phản hồi "hơi chưa rõ nhìn"**: bỏ giới hạn
  top-8 destination (trả toàn bộ), sidebar tìm-kiếm thay pill-row; thêm tầng thứ 4 **Nhà mạng**
  (`onsite_carrier` thật, không phải vendor GoHub) với tag so sánh (tốc độ/số lượng/ưu đãi) tính từ số
  thật; throttle thật qua field Supabase (sau phát hiện SAI ở đợt 9, xem dưới); sản phẩm gom dạng chip,
  bấm mới xổ chi tiết.
  **Đợt 6**: fix 3 phản hồi tiếp — fallback thêm vendor khi thiếu carrier (đỡ hẳn "chưa rõ nhà mạng"
  nhưng CHƯA hết, xem đợt 7); rút gọn category chỉ còn **eSIM/SIM** (bỏ tách 4 nhóm theo gọi/không gọi
  nội địa của đợt 2, "có SDT nội địa" chuyển thành toggle/badge); sản phẩm drill 2 tầng Ngày→Dung lượng.
  **Đợt 7** — verify TRỰC TIẾP Supabase `products` qua REST API (Hiếu đưa key trong `tmp.txt`, không
  đoán): phát hiện `onsite_carrier` với gói pool đa quốc gia là ĐOẠN VĂN nhiều dòng "Nước: Carrier" (có
  case liệt kê ~40 nước) — dùng thẳng làm tên tab ra cả đoạn văn, đúng nguyên nhân thật "mất thông tin"
  Hiếu báo lần đó. Fix: chỉ dùng `onsite_carrier` làm tên tab khi ngắn/sạch (≤40 ký tự, không xuống
  dòng), còn lại group theo `operator_code` rồi vendor — đoạn văn giữ lại làm `coverageNotes` hiển thị
  phụ. Thêm bảng tổng hợp TOÀN HỆ THỐNG "Gói có SDT nội địa" (chỉ ~50 product_code có field này thật,
  build 100% ở FE từ data đã fetch, `DataTable` dùng chung).
  **Đợt 8** — 4 việc theo yêu cầu tiếp (hỏi lại AskUserQuestion 1 điểm mơ hồ về "giá" trước khi làm — Hiếu
  chọn giữ nguyên quyết định đợt 4, không thêm số $): AI (Gemini, 1 batch call) đặt tên khu vực tiếng Việt
  cho destination mã thô (EU1/APA/GZ1...) từ `supported_countries` thật; loại bỏ hẳn destination `"000"`
  (SIM frame/eSIM profile, lọc ở SQL); sắp lại panel nhà mạng đúng thứ tự onsite_carrier→đặc điểm→ưu
  đãi→ghi chú/kích hoạt (field `note`/`activation_time`/`kyc_links` có sẵn nhưng chưa từng hiện)→phủ
  sóng/QR; nâng "Gói có SDT nội địa" thành banner nổi bật đầu trang.
  **Đợt 9 — 🔴 P0, Hiếu báo "không thấy bất kỳ dòng thông tin nào"**: verify trực tiếp qua Supabase REST
  API phát hiện `data_policy_code` **KHÔNG PHẢI cột thật** (`42703 column does not exist`) — đợt 5 tin
  nhầm theo 1 comment trong `agents.ts` chưa ai verify (nghi vấn `be-gau.ts`/`bi-analyst.ts`/
  `creator/tools/supabase.ts` cùng select field này cũng đang lỗi, NGOÀI SCOPE task, chưa kiểm tra riêng).
  Supabase trả lỗi 400 → code cũ không check `error` → `data` null → fallback `[]` → `metaBySku` TRỐNG
  HOÀN TOÀN → mọi field metadata null cho MỌI sản phẩm — khớp đúng triệu chứng. Fix: xoá hẳn field/logic
  dựa cột ảo; throttle chuyển sang field thật `skus.throttle_speed` (bảng khác, verify 11.088/12.892 SKU
  có giá trị), fetch theo chunk 150 sku_code (phát hiện thêm: Supabase project này cap mặc định 1000
  dòng/response, unpaged select bảng `skus` 12.892 dòng sẽ âm thầm cắt cụt); thêm check `error` thật cho
  mọi Supabase select (trước nuốt im lặng). **Bài học**: comment mô tả field trong code không phải bằng
  chứng field tồn tại thật — luôn verify qua REST API/schema thật trước khi dùng.
  Đổi shape response nhiều lần trong 9 đợt → cache key cuối cùng `v8`. tsc + lint (0 lỗi mới) + vitest
  (243/243) PASS mọi đợt. **Đã tự QA qua Chrome trên staging sau MỖI đợt kể cả đợt 9** (bypass CDN cache
  5 phút bằng cache-bust param để xác nhận response mới trước khi tin UI) — panel nhà mạng đầy đủ
  network/throttle thật/KYC/Hotspot/note/activation/QR, drill Ngày→Dung lượng→chi tiết hoạt động đúng.
  **Đã merge main (s199+5).**
| ✅ **s198+10 (2026-09-15) — Fix CS Troubleshoot "không cập nhật realtime" — đã QA live, đã push staging** |
  Hiếu báo tab CS Troubleshoot không cập nhật realtime. Verify qua Vercel Runtime Logs (không đoán):
  `Vercel Runtime Timeout Error: Task timed out after 60 seconds` trên **MỌI lần** chạy
  `/api/admin/sync-lark-tickets` (cả cron 1 lần/ngày lẫn bấm tay "Sync Lark") — bảng `lark_cs_tickets` đã
  lên ~30.000 ticket, phân trang Lark Base API (~60 trang) vượt quá `maxDuration=60` cũ → Vercel giết
  function giữa chừng → sync CHƯA TỪNG hoàn thành kể từ khi bảng đủ lớn → data đứng yên đúng từ
  **2026-08-31 suốt 15 ngày** (không phải "trễ 1 ngày" theo kiến trúc batch bình thường — mà đứng hẳn).
  Cùng lớp bug đã fix ở Bé Gấu (s195+14). Fix: nâng `maxDuration` 60→300 ở CẢ `route.ts` lẫn
  `vercel.json` (thiếu 1 chỗ không đủ) + thêm log tiến độ mỗi trang (trước không log gì, phải mò qua
  Runtime Logs mới ra). **Đã tự QA live trên staging**: bấm Sync Lark sau deploy → chạy xong thật (không
  còn 504), tăng dần 29.748→31.248→33.032 ticket qua vài lần test. Hiếu hỏi tiếp sao TBS Volume/
  Replacement&Refund vẫn 0 — kiểm tra lại xác nhận đó là **khoảnh khắc dữ liệu tháng 9 chưa kịp đồng bộ
  hết** (đúng lúc đang test bấm sync liên tục), KHÔNG phải bug thứ 2 — load lại trang sau khi sync ổn
  định: TBS Tickets 487, TBS Rate 2.44%, Refund 575, chart theo ca đủ 4 cột, bảng SKU/Vendor/Source đều
  có số liệu thật. tsc + lint (0 lỗi mới) + vitest (243/243) PASS. Wiki `analytics-cs-troubleshoot.md`
  cập nhật đủ. **Đã merge main (s199+5).**
| ✅ **s198+11 (2026-09-15) — Fix cron "Sync GoHub Data to Supabase" (products/skus/listings/items) chết
  57 ngày — ⚠️ CẦN MERGE MAIN mới có hiệu lực (khác mọi fix khác session này)** | Hiếu hỏi cron sync sản
  phẩm còn chạy không, không thấy cập nhật. Kiểm tra qua `gh run list` (GitHub Actions, không đoán):
  cron `sync.yml` (01:00 UTC hàng ngày) **thành công lần cuối 2026-07-20**, sau đó **100% run thất bại**
  (mix "failure"/"cancelled") liên tục tới hôm nay = **57 ngày liền** — nặng hơn hẳn bug CS Troubleshoot
  (15 ngày) vừa fix. Root cause qua log run: `requests.exceptions.HTTPError: 429 Too Many Requests` tại
  `/skus` — `sync.py` fetch 4 resource (products/skus/listings/items, items riêng đã ~227.375 dòng/228
  trang) SONG SONG qua `ThreadPoolExecutor(max_workers=4)`, cộng dồn request rate vượt giới hạn GoHub API
  bắt đầu áp dụng từ ~21/7 (không phải do code repo đổi — git log xác nhận `sync.py`/`gohub_api_clients.py`
  không đổi quanh mốc đó). Exception không bắt → script crash toàn bộ. Fix: mount `urllib3.Retry`
  (tôn trọng header `Retry-After`, backoff luỹ thừa, retry cả 429/5xx) vào `GohubClient.session` — 1 chỗ
  duy nhất, không cần sửa 8 call site get/post riêng lẻ. Kèm fix phụ: `timeout-minutes` 20 (thêm
  2026-08-09, defensive chung cho 4 workflow, không tính riêng cho sync nặng) quá ngắn so với lịch sử lúc
  còn thành công (từng mất tới 59 phút) → nâng lên 90 (repo public = Actions minutes miễn phí không giới
  hạn). Đã verify local: `GohubClient()` construct được, urllib3 2.7.0 hỗ trợ đủ `allowed_methods`/
  `respect_retry_after_header` (máy dev không chạy được full sync thật — thiếu `API_KEY`/
  `SUPABASE_SERVICE_KEY`). Wiki `kien-truc-he-thong.md` cập nhật. **Đã merge main (s199+5) — cron GIỜ CÓ
  HIỆU LỰC THẬT** (trước đó push staging không đủ, GitHub Actions luôn chạy theo main).
  ⚠️ **Khác mọi fix khác trong session này**: GitHub Actions scheduled cron LUÔN chạy theo branch `main`
  (thiết kế của GitHub, không cấu hình được), KHÔNG theo staging như Vercel — fix này sẽ KHÔNG có hiệu
  lực cho tới khi merge vào main, dù QA/qui trình khác vẫn giữ nguyên staging-first.
| ✅ **s198+12 (2026-09-15) — Fix chuông "Thông báo" kẹt trong sidebar + thêm log lỗi cron trên Intel —
  đã QA live PASS** | Hiếu: "sửa luôn cái thông báo trên Intel (đang có vấn đề), cần cập nhật log... để
  tôi kiểm tra dễ biết nó có lỗi hay không". Verify qua Chrome trên staging (bấm chuông thật, không
  đoán): panel `fixed right-0 w-[380px]` bị hiện lệch hẳn sang trái, chữ cắt cụt không đọc được — root
  cause: panel nằm lồng trong `<nav>` sidebar có class Tailwind `translate-x-0`/`-translate-x-full`
  (collapse/expand) — theo chuẩn CSS, `transform` trên ancestor (kể cả identity `translate-x-0`) biến nó
  thành **containing block** cho `position: fixed` bên trong, nên "fixed right-0" bị tính theo khung
  sidebar hẹp (~170px) thay vì viewport. Fix: `createPortal(..., document.body)` — panel thoát khỏi DOM
  subtree bị transform, tính đúng theo viewport. **Đã tự QA live sau deploy — panel hiện đúng bên phải,
  đọc rõ hoàn toàn** (nhân tiện thấy luôn bằng chứng phụ: sync sản phẩm cuối cùng có thay đổi là
  **13/07/2026**, khớp đúng mốc cron s198+11 chết).
  Thêm loại thông báo mới `"error"` (icon đỏ AlertTriangle, bell + `lib/notifications.ts`) + insert
  notification lỗi thật ở 2 nơi: `sync.py` (cron sản phẩm, bất kỳ exception nào trong `main()`) và
  `sync-lark-tickets` route (cron CS Troubleshoot) — cả 2 trước đây fail chỉ có log Vercel/GitHub Actions,
  không ai xem hàng ngày; giờ Hiếu tự thấy ngay trên chuông Intel, đúng yêu cầu "1 chỗ để kiểm tra dễ".
  tsc + lint (0 lỗi mới) + vitest (243/243) PASS. Wiki `kien-truc-he-thong.md` cập nhật. **Đã merge main
  (s199+5)** — cả phần bell/panel lẫn error-notification cho `sync.py` giờ đều có hiệu lực thật.
| ✅ **s197 (2026-09-14) — Audit LOGIC DỮ LIỆU toàn hệ thống 26 tab (khác đợt UI/performance s196+20) +
  fix hết 16/17 phát hiện** | Hiếu: "check lại toàn bộ tab analytics xem đã logic lấy dữ liệu, áp dụng
  dữ liệu đúng chưa, sai ở đâu" → sau đó "fix theo thứ tự hết đi". 4 fork song song đọc trực tiếp SQL
  route + FE apply logic (không đoán), publish Artifact báo cáo cho Hiếu trước khi fix. **17 phát hiện —
  16 fix + 1 false positive** (Inventory threshold validation hoá ra ĐÃ có ở route wrapper, fork chỉ đọc
  lib thiếu route). Mỗi fix 1 commit riêng, tsc + lint (0 lỗi mới) + vitest (243/243) PASS xuyên suốt,
  wiki cập nhật đủ từng tab.
  **6 Cao** (số liệu sai thật/lệch giữa các khối cùng trang): (1) BOD Channel Performance + Daily Report
  không đọc toggle Phí ship/Đơn nội bộ (`20c68fd9`); (2) CS Troubleshoot "Units Sold by Source" thiếu
  filter channelGroup → TBS Rate lệch (`17a6f5b8`); (3) Products mã nước SKU vẫn dùng logic CŨ (ký tự
  đầu) chưa đồng bộ fix s195+19 (`2410e16c`); (4) Channels toàn trang (Revenue/Trend/Top Products/
  Breakdown) thiếu filter ship/nội bộ, lệch CM1 card (`e4ea918f`); (5) Vendors toàn tab 0 filter chuẩn
  nào (`d2383a83`); (6) B2B `strategic-performance` (dùng chung 5 trang) không đọc toggle (`0ee48f58`).
  **7 Trung bình**: Dashboard/Targets Actual thiếu filter (`f1d630c2`); BOD+All-Time thiếu loại KH
  INACTIVE (`6f34cbb1`); My Metrics conversations thiếu ngưỡng MIN_TASK_RESPONSE_LEN (`1d140aa5`);
  Customers CM1 sai khi range nhiều tháng doanh thu không đều (`7fb1aefe`); B2C Performance mặc định
  ngược chuẩn hệ thống (`91a66c2b`); B2C trend thiếu filter (`c7622fe8`); B2B tier-performance (Dashboard)
  thiếu 2/4 filter (`e3d88d8d`).
  **3 Thấp**: Inventory `daysUntil()` không timezone-safe (`d9a01251`); Website chú thích biến đặt tên
  sai (không đổi số, `388483bb`); Staff filter case-sensitive (`261e9b8d`).
  **Đã xác nhận SẠCH** (không sửa): Quarter Report, All-Time (trừ INACTIVE), BOD Group Margin, Website
  (trừ naming), Staff (trừ case), B2B kpis/performance/trend, B2C kpis/performance/monthly, mã nước SKU
  helper chung, Vendors (3 fix lịch sử s195+8/9/10 không hồi quy), 3HK Usage, My Metrics hierarchy/prorata.
  **Kết luận luôn mục mở cũ s195+7** (Orders thiếu SIM vật lý): xác nhận qua code KHÔNG phải bug — 0
  filter cứng theo `type_of_sim`, nguyên nhân đúng là `fulfiled_date` NULL phía ops/ETL nguồn.
  **Đã QA live trên staging** (xem s197+1) — Vendors "VN Ecom Shopee" số đúng sau fix, Channels CM1
  khớp Revenue/GP card cùng trang, BOD toggle hoạt động đúng.
| ✅ **s197+1 (2026-09-14) — Incident: Hiếu báo "kênh ecom T9 sai" (Quarter Report + B2B Performance) —
  root cause CACHE CŨ, đã fix kèm 1 bug thật + merge main** | Verify qua SQL trực tiếp trên staging:
  "VN Ecom Shopee" T9 (1-13/9) thật có doanh thu 229.667.051đ, site đang hiện 137.802.046đ (thiếu 40% —
  cache TTL_L1 5'/TTL_L2 10' phục vụ snapshot cũ trong lúc dữ liệu giữa tháng tiếp tục đổ về). Toàn bộ
  công thức GP/CH.Cost/CM1/Actual-vs-Projected verify đúng 100% khi bypass cache (không phải bug tính
  toán — khớp giữa Quarter Report và B2B Performance, xác nhận cả 2 đọc chung 1 nguồn dữ liệu đúng).
  **Bug thật phát hiện kèm theo**: trang B2B Performance KHÔNG có nút "Tải lại mới" nào (khác Quarter
  Report — vốn có sẵn) → Hiếu không có cách tự ép cache tính lại tươi, phải chờ TTL tự hết hạn. Đã thêm
  nút (`fetchData(true)` → `nocache=1`, tự áp cho `b2b/kpis`/`performance`/`strategic-performance`/
  `trend`/`channels-with-platform-fee`, không sót route nào) — **đã tự QA live: bấm nút ra đúng số ngay**
  (229.667.051đ). Đã tự ép cache Quarter Report + B2B Performance tính lại tươi ngay lúc xử lý incident.
  Hiếu yêu cầu thêm rule cố định "luôn check N+1 query ảnh hưởng DB" — đã thêm vào mục Coding rules.
  **Đã merge staging→main** (`68d861c7`, theo yêu cầu Hiếu "merge main hết đi") — gộp cả 16 fix s197 lẫn
  fix incident này, clean không conflict, tsc+vitest(243/243) PASS. Production đang tự deploy.
| ✅ **s196+20/+21 (2026-09-14) — Audit performance + UI/UX toàn hệ thống (32 tab) + P0/P1/P2 fix, đã tự
  QA staging qua Chrome** | Theo yêu cầu Hiếu "đánh giá toàn bộ tab UI/UX + giúp load nhanh hơn, chạy mượt
  hơn" — 2 fork song song (Performance + UI/UX) đọc trực tiếp code + Grep định lượng (không suy đoán) toàn
  bộ 32 tab, gộp 1 report publish Artifact cho Hiếu (không lưu file trong repo). Sau đó làm lần lượt theo
  yêu cầu "làm P1 rồi đến P2" — **10 commit riêng đã push staging**, mỗi commit 1 việc, tsc + lint (0 lỗi
  mới) + vitest (243/243) PASS xuyên suốt.
  **P0** (`462594d2`/`6b318bce`/`6dae02f1`): cache 4 route BI thiếu TTL 15-60' (cùng lớp bug timeout B2C
  s195+15) + `maxDuration=60` tường minh; fix clip bảng lồng 4 vị trí (`overflow-hidden`→`overflow-x-
  auto`); fix sót màu `b2c/page.tsx` tab-switcher (`bg-blue-600`→`bg-brand-600`).
  **P1** (`41a039bb`/`f2255c85`/`db0a965a`/`616a89ec`): code-split recharts 6 tab lớn (channels/vendors/
  3hk-usage/staff/website/products, mỗi tab 1 file `<tab>-charts.tsx` `React.memo`+`next/dynamic`, cùng
  pattern `bod-charts.tsx`); giãn polling Tổ Gấu (chat 12s→30s, docs/notes/questions 20s→45s — Realtime
  đã phủ cả 4 bảng, poll chỉ còn lưới an toàn); `Skeleton`/`StatTileSkeleton`/`TableRowsSkeleton` dùng
  chung (`dashboard-kit.tsx`) áp cho website/staff (KPI card) + customers (fix bug thật: 3 bảng hiện nhầm
  empty-state trong lúc đang tải) + orders/fulfillment (bảng); aria-label cho 5 nút refresh icon-only.
  **P2** (`4df75ed4`/`461c0a19`/`8de2683f`/`ba9ee3ed`): gộp 27 chỗ `.toLocaleString()` trần (lệch locale
  mặc định trình duyệt người xem) → `formatNumber()` (`vi-VN` cố định) ở 6 tab; `DataTable` thêm sort/
  search opt-in (`sortValue`/`searchBy`, không đổi hành vi chỗ dùng cũ) + component `EmptyState` dùng
  chung; `AbortController` huỷ request cũ khi filter đổi nhanh cho `quarterly` (`fetchReport`/
  `fetchSquadProgress`/`fetchB2BTiers` — trước có nguy cơ race condition, response cũ ghi đè nhầm response
  mới); gộp `SubChannelTable` dùng chung cho 2 bảng con sub_channels b2b (theme indigo/slate giữ nguyên
  màu cũ, chỉ hết trùng code — đề xuất G). Vendors KHÔNG áp AbortController (fetch nhiều query song song
  qua helper `q()`/`qOpt()`, threading phức tạp hơn lợi ích — trigger không rapid-fire).
  **Đã tự QA qua Chrome trên staging (đúng theo yêu cầu Hiếu "QA đi rồi làm típ")** — xác nhận qua DOM/
  network/console, không chỉ tin code sạch: B2B bảng con `overflow-x-auto` đúng + `SubChannelTable` render
  y hệt trước (CM1 `rgb(15,76,129)`=brand-600 đúng theme slate); B2C 3 nút tab-switcher `rgb(15,76,129)`
  đúng brand-600, Metric cache 200/110ms; 6 tab recharts split render đúng chart, 0 lỗi console; Website/
  Staff thấy rõ StatTileSkeleton lúc tải, aria-label "Làm mới dữ liệu" có; Customers cache 3365ms→928ms,
  empty-state chỉ hiện khi thật sự rỗng; Quarterly bấm Q1→Q2→Q4 dồn dập → kết quả cuối đúng Q4 (Abort-
  Controller chặn race condition thành công); Tổ Gấu load room bình thường, 0 lỗi console.
  **Vòng 2 — "làm hết những cái chưa làm"**: Hiếu chốt 2 quyết định UI Strict Lock qua AskUserQuestion —
  dark mode tab BI → **"Khoá lại, chỉ light mode"**; tách admin/page.tsx → **"Làm luôn"**. 4 commit thêm:
  **(1) Khoá dark mode tab BI** (`lib/theme-lock.ts` `isDarkModeLocked(pathname)` dùng chung ở
  `theme-toggle.tsx` + inline script `layout.tsx`) — ẩn nút toggle + tự gỡ class `dark` trên `/analytics/*`
  trừ `/analytics/creator` (Gấu Pro, có dark support), tự bật lại đúng theme đã lưu khi rời khỏi. **(2)
  Tách admin/page.tsx 2120 dòng → 7 file** (6 tab vốn đã tự thân là component riêng, chỉ tách file + nạp
  `next/dynamic` — page.tsx còn 116 dòng). **(3) Chuẩn hoá Export** — gộp wrapper `exportToCSV` trùng lặp
  (b2b+products) thành `exportWithDateRange` dùng chung; thêm nút Export còn thiếu ở website ("eSIM
  Destinations") + cs-troubleshoot ("SKU & Telco Performance"). **(4) Rà 29 file `<table>` viết tay —
  KẾT LUẬN: KHÔNG cần migrate file nào sang `DataTable`.** Phân loại toàn bộ: 2 file là markdown-renderer
  (creator/ai, chatbot — không phải data table thật); còn lại ĐỀU có lý do chính đáng giữ nguyên — group-
  header/expand-row (b2b/channels/quarterly/customers/...), pagination SERVER-SIDE không tương thích
  `DataTable` (client-side only — orders, skus), matrix/grid tương tác (creator: Ma trận ẩn Tab), hoặc
  inline-edit UI (promotions). Không phải nợ kỹ thuật bị bỏ sót — kiến trúc hiện tại đã đúng.
  **Đã tự QA qua Chrome cả 4 việc trên staging sau deploy** — dark mode: bật ở chatbot→vào B2B tự tắt+ẩn
  nút→quay lại chatbot tự bật lại đúng theme đã lưu; admin: cả 6 tab load đúng data thật (kể cả tính COGS
  3HK combo preview); export: nút Export hiện đúng, disable đúng lúc data rỗng thật (không phải bug).
  tsc + lint (0 lỗi mới) + vitest (243/243) PASS toàn bộ. **Không còn việc mở nào** — cả roadmap audit
  performance/UI-UX s196+20 (P0/P1/P2) lẫn 2 quyết định UI Strict Lock đều đã xong.
| ✅ **s196–s196+4 (2026-09-13) — Tổ Gấu: audit toàn diện + fix Realtime/AI-question/ảnh/history-role + self-learning — Hiếu đã QA OK** |
  Audit toàn diện tab Tổ Gấu theo yêu cầu Hiếu + chuỗi fix liên tiếp, **Hiếu đã tự test xác nhận OK**.
  **s196**: fix bug tin nhắn NGƯỜI KHÁC không tự hiện, phải F5 mới thấy — root cause `chat_messages` chưa
  từng thêm vào publication `supabase_realtime` (migration v34 thiếu bước này) → `subscribe()` không báo
  lỗi gì, chỉ đơn giản không bao giờ nhận event (tin CHÍNH MÌNH luôn thấy ngay vì optimistic-append cục
  bộ, không qua Realtime). Fix: `v55_to_gau_realtime.sql` (`ALTER PUBLICATION ... ADD TABLE
  chat_messages`, Hiếu đã chạy) + lưới an toàn `reconcileMessages()` poll REST merge 12s (độc lập trạng
  thái publication/WebSocket).
  **s196+1**: fix 4 nhược điểm phát hiện qua audit + 1 bug Hiếu báo (câu hỏi hỏi AI không hiện trong
  chat — trước chỉ dùng làm prompt, không bao giờ insert `chat_messages`). Đổi `ai/route.ts` lưu câu hỏi
  THẬT trước khi gọi Gemini (hiện dù Gemini lỗi), response đổi shape `{question,answer}`. Kèm:
  `notifyLarkMembers()` await thay vì fire-and-forget; Docs/Notes/Câu hỏi thêm poll silent 20s (trước
  không Realtime lẫn poll); rate-limit `/messages` (30/phút) + `/ai` (10/phút).
  **s196+2**: paste ảnh (Ctrl+V, mirror Bé Gấu) + "Hỏi AI" giờ nhận ảnh/PDF đính kèm — upload Storage
  trước, backend fetch lại + base64 thành `inlineData` cho Gemini multimodal (trước nút AI bị disable khi
  không gõ chữ, hoàn toàn bỏ qua file dù có đính kèm).
  **s196+3**: fix bug thật hỏi AI kèm ảnh luôn báo "Hiếu đang fix" — xác nhận qua Vercel Runtime Errors
  (`get_runtime_errors`, không đoán): `GoogleGenerativeAI Error: First content should be with role
  'user', got model`. History 20 tin gần nhất gửi Gemini không đảm bảo turn đầu là `user` cũng không
  alternate user/model (group chat nhiều người nói liên tiếp) — merge turn liên tiếp cùng role + cắt turn
  `model` đứng đầu trước `startChat()`. Thêm badge "🤖 Hỏi AI" (cột `is_ai_question`, migration v56, Hiếu
  đã chạy) phân biệt tin gửi bot với chat thường. Kèm fix nhỏ: `GET /messages` thiếu `is_recalled`/
  `edited_at` trong select (cosmetic, không lộ dữ liệu).
  **s196+4**: Hiếu hỏi Gấu Tổ có self-learning như Bé Gấu không — KHÔNG, đã thêm. Tách
  `detectAndLogLearning()` từ `be-gau.ts` sang module dùng chung `lib/agents/learning.ts` (tránh chép
  logic), `ai/route.ts` gọi sau mỗi câu "Hỏi AI" — cùng gate Bé Gấu (bỏ qua creator/câu hỏi/tin ngắn/
  cooldown 5 phút dùng CHUNG rate map), DM Lark ghi rõ nguồn `"Tổ Gấu (<tên nhóm>)"`, duyệt vẫn qua Gấu
  Pro ("review pending learning", nay trả thêm `session_id` phân biệt nguồn). Chỉ áp dụng nội dung gửi
  qua "Hỏi AI", không quét chat thường (đúng phép so sánh — mọi tin gửi Bé Gấu = đang nói chuyện với bot).
  tsc + lint (0 lỗi mới) + vitest (220/220 mọi lần, bao gồm bộ test learning cũ của Bé Gấu vẫn PASS
  nguyên sau khi tách module) PASS suốt cả chuỗi. 5 commit đã push staging (`9b4cca00`, `3ec7409b`,
  `b4645d83`, `447342e2`, `704276e6`). **Hiếu đã tự QA xác nhận OK** — không còn việc mở nào chặn.
| ✅ **s195+19 (2026-09-11) — Mã nước SKU sai (fix rộng) + redesign UI My Metrics + audit B2C Performance: 4 bug thật, 1 UI theo yêu cầu** |
  Tiếp sau s195+18-C, 2 việc theo yêu cầu Hiếu cùng ngày.
  **(1) Fix mã nước SKU** (`decodeSkuDestinationCode`/`getDestinationSQL`, `analytics-helpers.ts`) —
  branch theo ký tự đầu SKU (digit/'E'/khác) thay vì ĐỘ DÀI → sai vị trí cho MỌI SKU 13 ký tự pháp nhân
  dạng chữ (US: A-E), lệch 1-2 ký tự (vd `ECJPN3DBUNL01` ra "CJP" thay vì "JPN", có ca lẫn hẳn sang nước
  thật khác vd ANZ→"CAN"=Canada). Verify SQL trực tiếp TOÀN BỘ lịch sử `fact_fulfillment_revenue`
  (không đoán): ~25% SKU 13 ký tự (nhóm E/A/D) sai nước. Đổi sang branch theo độ dài (13→ký tự 3-5,
  14/15→legacy, mỗi công thức verify riêng bằng data thật). Bug nằm ở helper DÙNG CHUNG nên tự động sửa
  luôn cho My Metrics + Products + Region Chart + B2B/B2C performance, không chỉ 1 tab. Dọn kèm 1 bản
  duplicate CASE lệch ở `products/report/route.ts` (tự chép SQL thay vì gọi hàm chung).
  **(2) Redesign UI My Metrics** — Hiếu duyệt qua mockup Artifact trước khi code: 3 khối "1/2/3" xếp
  chồng (numbered badge sai ngữ nghĩa — không phải sequence) đổi thành `CategoryNav` tab phân đoạn, chỉ
  hiện 1 nhóm/lần (đỡ trang dài ~2/3), hero score + 5 chip KPI luôn hiện + bấm nhảy tab. Ẩn/hiện qua
  `display:none` — không mất data đã fetch khi chuyển tab.
  **(3) Audit sâu tab B2C Performance theo yêu cầu Hiếu — 4 bug thật, đã fix hết**:
  - 🔴 **"Tổng cộng"/CSV câm lặng thiếu doanh thu khi groupBy=SKU** — `b2c/performance/route.ts` cắt
    cứng top 50 dòng THEO DOANH THU trước khi tính tổng. Verify SQL: tháng 8/2026 B2C có 1.047 SKU, top-50
    chỉ chiếm 743,8tr/1.872tr tổng thật → **thiếu 60,27% doanh thu**, không cảnh báo gì. Fix: đổi response
    sang `{rows,total,totalGroups}` — `total` tính từ TOÀN BỘ nhóm trước khi cap còn 1000 dòng hiển thị;
    FE thêm cảnh báo khi bị cắt. Bump cache `v3`→`v4` (đổi shape).
  - 🟡 **CM1 card đầu trang lệch cách khớp cost với bảng breakdown** (latent, chưa có số sai thật) —
    `b2c/kpis/route.ts` so chuỗi CHÍNH XÁC thay vì `matchChannelCost()` dùng chung (sub-channel/
    source_code/case-insensitive) như `b2c/performance` cùng trang. Đã đổi nhất quán.
  - 🔴 **KPI Target B2C/Marketing Budget 403 câm lặng cho MỌI role không phải admin/creator** (Hiếu báo
    "role BOD lưu không được") — `canWrite(session, "b2c", ...)` sai tabKey, FE tính quyền edit từ
    `"targets"` (giống route anh em `/api/planning/targets`). Verify qua `GET /api/config/writable-tabs`
    thật: 10 user có quyền ghi thêm, **0 người có "b2c"** → xác nhận chắc chắn bug ảnh hưởng MỌI user
    ngoài admin/creator, không riêng Hiếu. Đổi cả 2 route sang đòi đúng `"targets"`.
  - 🔴 **Card "Tiến độ doanh thu B2C so với mục tiêu tháng" báo "chưa nhập" dù đã lưu target** (Hiếu báo
    ngay sau khi tự QA bug 403 ở trên) — `api/analytics/b2c/monthly` nhánh live (FE Advance LUÔN gửi
    `nocache=1`) vẫn gắn `CACHE_HEADERS` (`s-maxage=300, stale-while-revalidate=600`) → Vercel Edge CDN
    cache nguyên response 5-15 phút, ĐỘC LẬP với `flushAnalyticsCache()` (khác tầng cache — app cache vs
    CDN cache theo response header). Fix: `Cache-Control: no-store` khi forceRefresh. **Verify trực tiếp
    trên staging**: đổi target qua API → reload ngay → card cập nhật tức thì, không cần chờ.
  **(4) Bỏ dải 6 KPI card "Users/ROAS/Customers/CAC/Leads/CPL"** đầu subtab Advance theo yêu cầu Hiếu —
  số liệu tương đương vẫn còn ở section CAC&Leads/Spend&ROAS bên dưới. Dọn kèm code chết (`KpiCard`,
  6 biến tính toán, import `Zap`/`Percent`/`cn` không còn dùng).
  tsc + lint (0 lỗi mới) + vitest (220/220, +1 test) PASS mọi fix. 6 commit đã push thẳng staging
  (`df329ff3` mã nước, `4c2a8ea7` redesign UI, `f8b271d0` Tổng cộng+CM1, `1bec0b59` 403 targets,
  `c9239d21` bỏ KPI card, `54bee462` CDN cache). **Không còn việc mở nào chặn** — mọi fix đã tự verify
  bằng data/API thật trên staging (không chỉ tin code sạch). Wiki cập nhật đủ: `analytics-data-model.md`
  mục 9, `analytics-my-metrics.md`, `analytics-b2c.md`.
| ✅ **s195+18-C (2026-09-11) — QA My Metrics nhóm A+B trên staging: 4 bug thật phát hiện + fix, 1 là P0** |
  Tự QA (browser + gọi API trực tiếp) sau khi Hiếu chạy migration v53/v54. **4 bug thật, đã fix + deploy +
  verify lại đều PASS**:
  1. **Trang My Metrics crash trắng ngay sau deploy** — cache 12h cũ (`okr_sku_scan`/`okr_datapool_detail`)
     phục vụ response SHAPE CŨ (thiếu `monthly`/`country`/`product_code`) cho FE MỚI đọc `data.monthly` →
     `TypeError`. Fix: bump cache key sang `v2`.
  2. **Prorata hierarchy SKU GM/%Datapool không hoạt động** (luôn factor=1) — gọi
     `getProjectionFactor(start, hết-tháng/hết-quý)` sai tham số (hàm này tính elapsed=(end-start), cần
     `(hôm nay-start)`). Fix: thêm `getRangeProjectionFactor()` mới (`analytics-engine/projection.ts`),
     không đổi hàm gốc (nhiều route khác phụ thuộc đúng hành vi cross-month=1 của nó).
  3. 🔴 **P0 — Bé Gấu + Gấu Pro KHÔNG gọi được tool nào** (mọi câu hỏi BI/executeSQL lỗi 400 "Function
     call is missing a thought_signature") kể từ lúc đổi sang streaming (s195+18, không liên quan gì My
     Metrics — chỉ tình cờ phát hiện qua QA). Root cause đọc thẳng source SDK
     `@google/generative-ai@0.21.0`: hàm gộp chunk stream `aggregateResponses()` chỉ copy 4 field cố định
     mỗi part, làm rớt `thoughtSignature` (field mới, SDK ra đời trước) — Gemini bắt buộc echo lại đúng
     field này ở lượt sau khi replay functionCall, thiếu thì reject thẳng. Fix: `gemini-stream.ts` tự gom
     `parts` từ raw chunk (giữ nguyên mọi field) ghi đè vào response đã aggregate.
  4. **Task Bé Gấu chưa bao giờ được log** (fire-and-forget `logChat()`/insert `app_usage_events` không
     await → Vercel có thể đóng execution context trước khi Supabase insert kịp gửi đi) — verify được 2
     lần liên tiếp mất hẳn dù trả lời đúng. Fix: await cả 3 chỗ (`api/chat` 2 nhánh + `api/lark/events` 2
     nhánh) — cùng bài học wiki đã ghi cho Lark nhưng chưa áp cho các chỗ này.
  **Đã verify lại toàn bộ sau fix (không chỉ tin code sạch)**: gọi `/api/chat` trực tiếp 2 lần → cả 2 lần
  trả lời đúng SỐ THẬT (executeSQL) + `app_usage_events` có dòng mới `tools_used:["executeSQL"]`,
  `used_db_tool=true` → card "Tasks Completed via Bé Gấu" lên đúng 1/450. Hierarchy SKU GM: drill đủ 4 cấp
  Vendor→Nước→Product Code→SKU đúng số, toggle Tháng/Quý đổi đúng nhãn "(PRORATA)", nút "Giải thích bằng
  AI" trả câu suy luận hợp lý (luôn "có thể do"). Nút "Phân loại chủ đề bằng AI" Bé Gấu Insights trả đúng
  nhóm. Panel SLA/Vendor Speed: case tự đăng cũ (trước deploy) vẫn còn trong hàng chờ duyệt bình thường
  (đúng thiết kế — filter chỉ áp cho thread MỚI phát hiện từ nay); quét lại 1 lần ra đúng 1 case "tự đăng
  — không tính" mới + nút "Vẫn tính case này" test qua API hoạt động đúng (dọn lại sau test).
  tsc + lint (0 lỗi mới) + vitest (219/219) PASS mọi lần. **Không còn việc mở nào chặn** — 5 commit đã
  push thẳng staging trong lúc QA (`d3560c1a` crash fix, `7ef39026` prorata fix, `768a6294` thought_
  signature P0, `8f09ae7c` logChat await). Production (`main`) VẪN đang chạy code CŨ (trước s195+18) nên
  KHÔNG bị ảnh hưởng bởi bug P0 #3 — chỉ staging dính, không cần rollback khẩn production.
| ⏳ **s195+18-B (2026-09-11) — My Metrics nhóm B: SKU GM/%Datapool hierarchy+prorata+AI, Bé Gấu chỉ tính task query DB, chờ Hiếu QA** |
  Nhóm B (sau nhóm A). **SKU Gross Margin + %Datapool Rev**: component dùng chung mới
  `GmHierarchySection` — hierarchy Vendor→Nước→Product Code→SKU (rollup client-side), toggle Tháng/Quý
  (tháng = MoM 2 tháng gần nhất có data), prorata kỳ hiện tại qua `getProjectionFactor()` có sẵn, chart
  Rev kỳ trước vs kỳ này + biến động GM%, bảng "Giải thích bằng AI" on-demand (nút bấm, cache 12h, luôn
  ghi "có thể do"). `datapool-detail` route trước chỉ có quý hiện tại (không so sánh được) — thêm quý
  trước + GM%. **Tasks via Bé Gấu**: đổi định nghĩa "task tính KPI" — phải THẬT SỰ gọi tool đọc DB
  (executeSQL/querySupabase/queryProduct/listSupabaseTables), không còn chỉ dựa độ dài response.
  `be-gau.ts` track tool gọi mỗi vòng (`toolsUsed`), migration `v54` thêm cột `app_usage_events.
  tools_used`/`used_db_tool`. **Fix phát hiện khi sửa**: route Lark log `app_usage_events` TRƯỚC KHI
  gọi `runBeGau()` → `ai_response` LUÔN NULL cho MỌI chat Lark → task Lark chưa BAO GIỜ được tính vào
  KPI dù wiki cũ mô tả có breakdown Web/Lark — đã sửa log SAU khi có response thật. 3 route (my-metrics
  chính/begau-insights/conversations) đồng bộ filter `used_db_tool=true`; conversations + insights trả
  thêm `tools_used` → FE hiện badge tool per case. Thêm phân loại chủ đề bằng AI on-demand (giống Usage
  Analytics `usage-stats/classify`, scope đúng tập task đã lọc). tsc + lint (0 lỗi mới) + vitest
  (219/219) PASS. ⚠️ **Gotcha quan trọng**: số "Tasks via Bé Gấu" quý Q3-2026 hiện tại sẽ TỤT MẠNH về
  gần 0 ngay sau deploy — task CŨ (trước lúc deploy) không có `used_db_tool` (không backfill được, dữ
  liệu tool nào gọi chưa từng ghi lại trước đây) → bị loại hết theo định nghĩa mới. Đây là đánh đổi 1
  lần bắt buộc, KHÔNG phải bug. **Cần Hiếu**: chạy migration v54, QA staging theo checklist trong wiki
  mục "s195+18-B" (analytics-my-metrics.md), theo dõi vài ngày để số Bé Gấu tích luỹ lại từ 0.
| ⏳ **s195+18-A (2026-09-11) — My Metrics nhóm A: SLA/Vendor Speed chỉ tính request người khác + note + chart tháng, chờ Hiếu QA** |
  Hiếu yêu cầu rebuild lớn "My Metrics v2" (5 mục), chia 2 nhóm theo yêu cầu Hiếu — nhóm A xong trước.
  (1) Chỉ tính SLA/Vendor Selection Speed cho thread NGƯỜI KHÁC đăng rồi mention Hiếu — thread Hiếu tự
  đăng (dù có ai mention lại) bị loại TRƯỚC khi gọi Gemini (`lark-scan-runner.ts`, cả real-time lẫn quét
  lịch sử), ghi marker `is_self_initiated=true` (không tốn phí Gemini), có nút "Vẫn tính case này"
  (route mới `/lark-events/[id]/override`) cho ngoại lệ thật. (2) Ghi chú tự do mọi trạng thái, không bị
  quarter-lock (cột `hieu_note`, route PATCH gộp vào `[id]/route.ts`). (3) Chart TB theo tháng trong quý
  + so quý trước (`EvidenceTrendChart`, route `/evidence` thêm `monthly`+`prev_quarter`). (4) Link thẳng
  tới thread — ĐÃ RESEARCH kỹ, Lark không có API server-side sinh link đó, **giữ nguyên link mở group**
  (tự đoán token sẽ ra link lỗi, tệ hơn không làm). Migration `v53_okr_lark_events_selfpost_note.sql`
  (2 cột `is_self_initiated`, `hieu_note`). tsc + lint (0 lỗi mới) + vitest (216/216) PASS. **Cần Hiếu**:
  chạy migration v53, QA staging (self-post rơi đúng khối riêng + override work, note lưu được, chart
  hiện khi ≥2 tháng data). Nhóm B (SKU Gross Margin/%Datapool/Bé Gấu tasks — hierarchy vendor→country→
  product→SKU, prorata, AI giải thích on-demand) **chưa làm**, làm sau khi nhóm A qua QA.
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
| 📌 **Ghi nhớ: `web/.env.local` trên máy dev (cập nhật 2026-09-20)** | Máy này CÓ `web/.env.local` (gitignored; đã thêm `VERCEL_TOKEN` + `SUPABASE_URL/PUBLISHABLE_KEY/SECRET_KEY/JWKS_URL` kiểu key mới từ `tmp.txt` đã xoá). Vẫn lấy tsc + vitest làm lưới an toàn tại chỗ; UI/DB thật luôn QA trên staging (Chrome). ⚠️ Vercel token đã lộ vào hội thoại → phải rotate. Test cron/route cần `CRON_SECRET` thì đọc từ file này, không in ra. |

---

## Việc Hiếu cần làm (còn mở)

- [ ] **s203 — Scheduled Daily/Weekly không tới Lark ~1 tuần (đã sửa trên staging, CHƯA merge main)**: gốc = 2026-09-10 đổi `bi-analyst` sang `gemini-3.8-flash` (mặc định thinking=medium) → báo cáo ~32s > timeout 30s của cron-job.org. Fix: `thinkingLevel:"low"` (đo trọn đường cron 32s→12s; ⚠️ KHÔNG dùng "minimal" khi có functionDeclarations) + cron route trả lời ngay, chạy báo cáo trong `waitUntil` + kiểm body webhook Lark (`code!=0`). **Cần Hiếu**: (1) kiểm cron-job.org đang gọi URL nào — log cho thấy lần gọi gần nhất rơi vào deployment **staging**, không phải production; (2) merge main để production có fix; (3) Daily/Weekly hôm nay đang "đến hạn" (last_run_at cũ) → tick kế sẽ tự gửi bù. Chi tiết: wiki `analytics-scheduled.md` §E.
- [ ] **s202 — Bảo mật**: **rotate Vercel token** (đã lộ vào hội thoại Claude; `tmp.txt` đã xoá, secret giờ nằm ở `web/.env.local`). Vercel → Account Settings → Tokens: xoá token cũ, tạo mới rồi cập nhật `VERCEL_TOKEN` trong `web/.env.local`.
- [ ] **s202 — Bridge**: báo mọi người đã pair reload extension lên 1.1.0 (`chrome://extensions`) — production cũng từ chối bản cũ (thiếu Device ID). Hiếu đã reload + xác nhận máy mình ghi nhận đúng.
- [ ] **s202 — Xác nhận cron `refresh-monthly-kpis`** (sáng 21/09): Vercel Cron lần đầu chạy GET thật lúc 01:30 UTC; vào `/analytics/creator/devtools` → Giám sát → Đối chiếu, "Snapshot cập nhật lúc" phải là 21/09 và tất cả "Khớp".
- [ ] **s201 — Theo dõi**: (a) Chủ nhật 21/09 02:00 UTC là lần đầu job `items` chạy theo lịch tuần (xem chuông "Thông báo" ✅); (b) tin Lark release có dòng `📍 Tab: …` đúng không (bước `jq` trong `notify-release.yml` chưa thử được ở máy dev); (c) Catalogue chưa đổi → bấm "Tải lại" (cache 30').
- [x] s201: cron sync `core` đã thành công, `ref_vendors` (kể cả GB) ổn, v52 đã chạy, secret `tmp.txt` chuyển vào `web/.env.local`, cron-job.org ping `etl-cache-sync` đã tạo, `VACUUM (ANALYZE) items` đã chạy.
- [x] **s202 — `refresh-monthly-kpis`**: đã sửa + merge main (chi tiết ở bảng trạng thái) — chỉ còn mục xác nhận ngày mai ở trên.
- [ ] **s201 — (tuỳ chọn) Bỏ hẳn việc sao chép items**: Bé Gấu + tab Item gọi thẳng API GoHub theo SKU khi cần (`post_items(sku_codes=…)`) — cần thêm `API_KEY` vào env Vercel + sửa tool Bé Gấu.
  Hoặc hỏi bên API có tham số lọc theo `last_modified_date` để sync items tăng dần.

- [x] **s200+7/+8/+11 — MCP_SECRET đã đối chiếu lại + group Lark đã setup — XONG, verify sống bằng curl**
  — Hiếu tạo secret mới, cập nhật khớp Vercel + GitHub, redeploy; đã chạy `/set-release-channel` trong
  group đích. Test trực tiếp `/api/notify/lark` + `/api/notify/release` bằng curl (cả staging lẫn
  production): auth 200 (hết 401), gửi tin thật thành công, Gemini tóm tắt đúng nội dung. Không cần làm
  gì thêm cho 2 mục này.
- [x] **s200+11/+12 — Thông báo Lark Staging/Production + backlog + lọc docs/nhỏ nhặt — XONG, đã verify
  sống bằng curl thật** — gọi trực tiếp `/api/notify/release` production với dữ liệu mô phỏng, nhận đúng
  format `🚀 [Production] Vừa lên production...` + `🧪 Còn trên staging, CHƯA lên production...`, gửi tin
  thật vào group Lark thành công. Vẫn còn 1 việc nhỏ: **quan sát 1-2 lần merge THẬT sắp tới** để xác nhận
  workflow tự tính `pendingCommits` đúng khi staging thật sự có commit vượt main tại đúng lúc push main
  (mới verify bằng mô phỏng qua curl, chưa qua tình huống git-diff thật) — không chặn gì, chỉ nên để ý.
- [ ] **s200+9 — Quyết định hướng xử lý: ~5.235 SIM tháng 8/2026 bị gán nhầm sang mã khung SIM (K)** —
  phát hiện khi Hiếu hỏi lại "sao Zone khác data tổng": tháng 8 riêng lẻ có 5.235 ICCID / 27,60 TB usage
  thật bị tính vào mã `K` (khung SIM/eSIM profile, vốn phải luôn ~0 vì không phải gói data thật — T4-T7
  chỉ 0-8 ICCID). Đây là dữ liệu THẬT bị lệch ở nguồn/ETL, không phải bug ở tab 3HK Data Usage. Cùng vấn
  đề đã ghi nhận nhưng CHƯA sửa từ audit s198 ("SKU K gánh usage bất thường — nghi dữ liệu nguồn 3HK gộp
  nhầm"), giờ định vị chính xác hơn: chỉ xảy ra đúng đợt nạp tháng 8 (17/09). Cần Hiếu chọn hướng: (a) hỏi
  bên vận hành/3HK xem SIM nào bị gán nhầm SKU khung ở tháng 8, sửa lại SKU đúng ở nguồn; (b) chấp nhận
  hiện trạng, chỉ ghi chú rõ trong UI khi thấy Zone lệch nhiều so với KPI card; (c) khác — báo lại hướng
  muốn làm, chưa code gì thêm cho việc này.
- [x] **s200+6 — cron-job.org ping `/api/cron/etl-cache-sync`** — Hiếu đã tạo job (2026-09-20, GET + Bearer `CRON_SECRET`, mỗi 10-15 phút). Xong.
- [x] **s200 (toàn bộ chuỗi s200 → s200+5) — đã merge main (các đợt s200+6..s201+5); còn lại chỉ là QA thị giác Tổng quan Quarter Report (3 StatTile KH Mới/Quay Lại/Rời Bỏ) + Squad Progress (badge 🆕/🔁/😴) — Hiếu xem khi rảnh** — mọi việc dưới đây đã tự
  verify sống trên staging trong lúc làm (SQL trực tiếp + UI thật), Hiếu đã tự xem/phản hồi trực tiếp phần
  3HK (mã X, khung SIM, chart) và phần quyền Organization ngay trong phiên — chỉ còn 1 việc thật sự cần
  Hiếu tự xem lại: **Tổng quan Quarter Report** (3 StatTile "KH Mới/Quay Lại/Rời Bỏ") + **Squad Progress**
  (badge 🆕/🔁/😴, "Xem N KH rời bỏ") — 2 phần này CHƯA có phản hồi trực tiếp từ Hiếu trong phiên, khác
  phần Organization/3HK đã được Hiếu tự kiểm tra và góp ý ngay. Danh sách việc đã xong trong chuỗi này:
  - Lifecycle KH B2B (New/Recurring/Inactive) + trang `/analytics/quarterly-org` — xem chi tiết.
  - Fix `organization_code` (cột chết) → `organization` (cột thật) + drill-down Tier→Organization→Customer.
  - 3HK Data Usage: badge freshness dữ liệu, fix phân loại Daily/Fixed/Unlimited (ký tự vị trí 8/10), loại
    SKU khung SIM, đổi chart/breakdown sang mã ký tự — Hiếu đã tự xem và góp ý từng đợt, không cần QA thêm.
  - Quarter Report (Organization): giới hạn quyền chỉ admin/creator xem được (Hiếu yêu cầu).
  Nếu ổn hết, báo lại để merge main.
- [x] **s199+4 — %MoM Quarter Report — XONG, đã tự verify sống + đã merge main (s199+5)**. T7 so đúng
  tháng 6 (BE fetch riêng), T8/T9 so trong quý — không cần Hiếu làm gì thêm.
- [x] **s199+3 — Cache TTL 12h→60' — đã merge main (s199+5)** — theo dõi vài giờ đầu: B2B Performance/
  Quarter Report giờ tự làm mới trong ≤60 phút, mở 2 tab cùng lúc số sẽ khớp sát hơn hẳn. Nếu vẫn thấy
  lệch rõ sau khi cả 2 route đã tự refresh trong giờ gần nhất, báo lại kèm 2 số cụ thể.
- [x] **s199+2 — Fix "B2B khác Quarter Report" (bug bảng KH bỏ qua chọn tháng) — đã merge main (s199+5)**
  — đã tự verify sống (Momo/VN Ecom Shopee khớp tuyệt đối B2B Performance). Hiếu tự xem lại trên production
  sau khi Vercel deploy xong nếu muốn yên tâm thêm, không bắt buộc.
- [x] **s199+1 — Tab "Giám sát Dữ liệu" — đã merge main (s199+5)**, chỉ Creator thấy (nhóm "Creator" trong
  sidebar/nav), tại `/analytics/creator/data-health`. Checklist QA gợi ý trên production: (a) sub-tab Độ
  tươi — card `fact_data_usage`/`data_usage_log` phải đỏ (đúng thật, xem s199 audit), card
  `fact_fulfillment_revenue`/`fact_inventory` phải xanh; (b) sub-tab Bất thường — 3 sparkline Tổng/B2B/B2C
  render; (c) sub-tab Đối chiếu — bảng hiện đúng 4 dòng/tháng (Doanh thu/CM1/CM1%/3HK%). Báo lại nếu muốn
  mở rộng thêm (VD: cảnh báo chủ động qua Lark, tách VN/US ở Đối chiếu...).
- [ ] **s199 — Hỏi bên vận hành/vendor 3HK: pipeline nạp `fact_data_usage`/`data_usage_log` (gohub_dw)
  đã đứng yên từ 2026-07-20** — tab 3HK Data Usage không thiếu riêng tháng 8, thiếu LUÔN từ tháng 7. Đã
  xác nhận qua SQL trực tiếp + tra registry ETL (`jobs`/`job_logs`) không có job nào phụ trách 2 bảng
  này — ngoài phạm vi code sửa được ở repo `gohub-intel`. Không cần Claude làm gì thêm cho tới khi biết
  pipeline đó do ai/ở đâu vận hành.
- [x] **s198 — Tab "Product Catalogue" — đã merge main (s199+5)** — `/analytics/catalogue`, 9 đợt
  (2026-09-14/15), đã tự QA live sau MỖI đợt kể cả đợt 9 (fix bug P0 "trang trống trơn" — root cause
  `data_policy_code` không phải cột Supabase thật). 2 điểm Hiếu có thể quyết định thêm nếu muốn (không
  gấp): (1) bảng "Chính sách QR/đổi máy" đang HARDCODE trong `route.ts` — muốn tự sửa qua UI sau này cần
  thêm 1 bảng Supabase riêng, báo để làm; (2) tên khu vực AI cho destination mã thô (EU1/GZ1...) — QA đợt
  9 thấy vẫn hiện mã thô, chưa xác nhận do Gemini lỗi hay bug logic, không chặn gì, báo lại nếu vẫn thấy.
- [x] **s198+10 — Fix CS Troubleshoot sync timeout — đã merge main (s199+5)** — sync Lark chạy xong thật
  (33.032 ticket), TBS Volume/Replacement&Refund/SKU-Vendor-Source Performance đều có số liệu đúng. Không
  cần làm gì thêm.
- [x] **s198+11 — Fix cron sync product/sku/listing/item — đã merge main (s199+5), GIỜ MỚI CÓ HIỆU LỰC
  THẬT** (GitHub Actions cron luôn chạy theo `main`, push staging trước đó không đủ) — cron `sync.yml`
  từng chết 57 ngày do 429 rate-limit, đã fix retry/backoff + nâng timeout 20'→90'. **Gợi ý Hiếu**: vào
  GitHub Actions tự trigger thử 1 lần ("Run workflow" thủ công, workflow "Sync GoHub Data to Supabase")
  để xác nhận chạy xong không còn 429/timeout, thay vì chờ tới 01:00 UTC hôm sau.
- [x] **s198+12 — Fix chuông Thông báo kẹt sidebar — đã merge main (s199+5)** — panel kẹt trong sidebar đã
  fix (portal), đã tự QA live xác nhận hiện đúng/đọc rõ. Phần error-notify cho `sync.py` (cron s198+11)
  giờ cũng có hiệu lực thật cùng đợt merge này.
- [x] **s197/s197+1 — Audit logic dữ liệu 16 fix + incident ecom T9 — XONG (2026-09-14), đã tự QA live +
  đã merge main** — B2B Performance "VN Ecom Shopee" xác nhận số đúng (229.667.051đ) sau khi thêm nút
  "Tải lại mới" + ép cache tươi. Channels CM1 khớp Revenue/GP card cùng trang. BOD toggle Phí ship/Đơn
  nội bộ hoạt động đúng cho Channel Performance + Daily Report. Đã merge staging→main (`68d861c7`),
  production đang tự deploy. **Hiếu vẫn nên tự đối chiếu thêm vài số quen thuộc khi rảnh** (không gấp):
  Dashboard "Overall Progress vs Target" % có thể tăng nhẹ (Actual hết bị kê cao); Customers CM1 có thể
  đổi nhẹ nếu có KH chọn range nhiều tháng + cost `percent`. Không cần làm gì nếu số liệu hợp lý.
- [x] **s196+20/+21 — Audit performance/UI/UX toàn hệ thống (P0+P1+P2) + 2 quyết định UI Strict Lock —
  XONG HẾT (2026-09-14), đã tự QA qua Chrome trên staging, không cần Hiếu làm gì thêm** — Hiếu đã chốt 2
  quyết định (dark mode tab BI → khoá lại; tách admin/page.tsx → làm luôn), cả 2 đã làm + QA xong. Export
  chuẩn hoá xong (gộp wrapper trùng + vá 2 tab thiếu). Rà 29 file `<table>` xong — **kết luận: không cần
  migrate file nào**, kiến trúc hiện tại đúng (group-header/expand-row/server-pagination/matrix/inline-edit
  đều có lý do chính đáng). Còn duy nhất **tooltip/onboarding cho tab phức tạp** (thiết kế chủ quan, chưa
  làm — không có risk/quyết định chặn, chỉ chưa tới lượt). Đọc report Artifact đầy đủ trong chat nếu muốn
  xem lại chi tiết từng phát hiện.
- [x] **s196–s196+4 — Tổ Gấu: Realtime/AI-question/ảnh/history-role/self-learning — XONG (2026-09-13),
  Hiếu đã tự test xác nhận OK** — migration v55 (`ALTER PUBLICATION` Realtime) + v56 (`is_ai_question`)
  đã chạy. Không còn việc mở nào ở luồng này.
- [ ] **s195+19 — Test lại toàn bộ B2C Performance + My Metrics (Hiếu hẹn "mai tôi test")** — mọi fix đã
  tự verify bằng data/API thật trên staging, nhưng chưa ai xem lại bằng mắt qua UI thật 1 lượt đầy đủ.
  Checklist gợi ý: (a) tab B2C sub-tab Performance — đổi groupBy=SKU, kiểm tra "Tổng cộng" + xuất CSV có
  dòng cảnh báo "Đang hiện N/M dòng" khi >1000 SKU; (b) Manage Costs → nhập lại KPI Target B2C/Marketing
  Budget bằng 1 acc KHÔNG phải admin/creator (vd acc Lark liên kết role BOD) → xác nhận lưu được; (c)
  ngay sau khi lưu, mở tab B2C Advance → card "Tiến độ doanh thu B2C so với mục tiêu tháng" phải cập
  nhật NGAY, không cần chờ; (d) xác nhận dải 6 KPI card Users/ROAS/Customers/CAC/Leads/CPL đã biến mất
  khỏi đầu subtab Advance; (e) My Metrics — tab phân đoạn 3 nhóm chuyển mượt, hierarchy SKU GM/%Datapool
  hiện đúng tên nước (không còn mã lạ như "CJP"/"CAN" sai).
- [x] **s195+18-A/B/C — My Metrics nhóm A+B + QA — XONG (2026-09-11), tự QA qua browser + API trực
  tiếp trên staging, đã fix 4 bug (1 P0)** — migration v53+v54 Hiếu đã chạy. Hierarchy SKU GM/%Datapool
  drill 4 cấp + prorata + AI giải thích + AI phân loại chủ đề: đều xác nhận hoạt động đúng sau fix.
  **Không cần Hiếu QA lại** — đã tự verify kỹ (xem s195+18-C ở bảng trạng thái để biết chi tiết 4 bug đã
  fix). Duy nhất còn: theo dõi vài ngày để số "Tasks via Bé Gấu" tích luỹ lại từ 0 (đúng thiết kế, task
  cũ trước deploy không backfill được `used_db_tool`).
- [ ] **s195+18 — QA stream token thật Bé Gấu + Gấu Pro trên staging** — mở cả 2 chat, hỏi 1 câu cần vài
  giây (BI/phân tích), xác nhận: (a) chữ CHẠY DẦN theo thời gian thực thay vì im lặng rồi bung nguyên cục
  như trước; (b) nội dung không lặp/không thiếu đoạn nào so với trước; (c) Gấu Pro: status "đang tìm
  kiếm/đang query..." vẫn hiện đúng lúc tool đang chạy, biến mất đúng lúc câu trả lời bắt đầu chảy chữ; (d)
  nguồn tham khảo (Bé Gấu) + nút export/followup (Gấu Pro) vẫn hiện đúng ở cuối như trước.
  ⚠️ **Cập nhật s195+18-C**: câu hỏi cần tool (executeSQL...) trước đó LUÔN LỖI 400 thought_signature —
  bug đã fix (xem bảng trạng thái), đã tự verify `/api/chat` trả lời đúng qua tool. Vẫn cần Hiếu tự thử
  qua UI web/Lark thật 1 lần cho chắc (đặc biệt Gấu Pro — session này chỉ verify được Bé Gấu qua API).
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
Supabase sau khi chạy) · **v53** `okr_lark_events` thêm `is_self_initiated`/`hieu_note` · **v54**
`app_usage_events.tools_used`/`used_db_tool` — v53-v54 Hiếu đã chạy, đã QA xong 2026-09-11 · **v55**
`ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages` (fix tin nhắn Tổ Gấu không tự hiện) · **v56**
`chat_messages.is_ai_question` (badge phân biệt câu hỏi AI) — v55-v56 Hiếu đã chạy, đã QA xong 2026-09-13. · **v57** `gp_action_log` · **v58** `app_usage_events` cost · **v59** `chat_feedback` · **v60** To-Gau docs/notes/questions Realtime · **v61** `browser_bridge_devices` + `browser_bridge_commands.device_id/claimed_ip` (Hiếu đã chạy 2026-09-20, đã QA sống).

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
- **KHÔNG bọc `TRIM()` lên cột phía `dim_customer` trong JOIN/EXISTS** (`TRIM(f.customer_code) = c.code`, KHÔNG `= TRIM(c.code)`): join 355k dòng chậm ~10× (s203, đã đo). Mỗi query quét bảng fact ~0,5-1s và gohub_dw chạy gần như tuần tự → gộp query cùng bộ lọc, đừng thêm scan mới; đừng cache khối >2MB không nén. Chi tiết: wiki `analytics-data-model.md` §10.
- **Luôn check lỗi query N+1 ảnh hưởng tới database** khi viết/sửa code chạm DB — vòng lặp gọi query
  riêng lẻ cho từng dòng/từng item (thay vì gộp 1 câu JOIN/IN/batch) làm nổ số round-trip tới gohub_dw
  khi data lớn, dễ gây chậm/timeout (đúng lớp bug đã gặp nhiều lần — B2C Advanced s195+15, Daily Report
  s157, Customer Report s196+20). Yêu cầu cố định của Hiếu (2026-09-14).

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
