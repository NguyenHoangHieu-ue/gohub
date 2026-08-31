---
title: "My Metrics — OKR Tracking (Hiếu)"
page_type: tab_guide
department: tech
audience: system
visibility: admin-only
is_hidden: true
tags: [my-metrics, okr, analytics, sla, sku, gm, begau, lark-bot]
created: 2026-08-27
updated: 2026-08-27
status: active
---

# My Metrics — OKR Tracking

> Route `/analytics/my-metrics` (id `"my-metrics"`), gate qua `my_metrics_enabled` (`/api/user/me`) + `access_audit_log`.
> Đối tượng: cá nhân Hiếu, dùng để báo cáo OKR Q3/Q4 2026 cho manager (Bảo). Nguồn KPI chính thức: offer letter
> "Product Operations Executive (AI & Data Focus)" — 5 KPI, trọng số time-allocation 70% Operational Excellence +
> Product Performance / 30% BI & AI Automation. Trang PDF gốc (`Hieu/Offer Letter...pdf`) bị lỗi export — bảng KPI
> trong file bị cắt cứng ở cột "Target Q3" (cột Target Q4 nằm ngoài khổ trang gốc) → **Target Q4 KHÔNG có trong
> tài liệu gốc**, `DEFAULT_TARGETS.Q4` trong `page.tsx` là ước lượng, sửa khi Bảo chốt số thật.

## Rebuild s167 (2026-08-27) — vì đâu

Sau s164 (rebuild lần 1), Hiếu chỉ ra 2 khoảng trống còn lại, cả hai đều feed trực tiếp vào số báo cáo hiệu suất
thật nên xử lý cẩn trọng (không tự đoán, đã hỏi Hiếu chốt hướng qua AskUserQuestion trước khi code):

1. **SKU Gross Margin trước chỉ đếm SKU Hiếu tag tay** (nhập mã SKU + ngày áp dụng từng cái) — không đại diện
   "Product Performance" trên cả hệ thống như offer letter yêu cầu.
2. **SLA Handling Time / Vendor Selection Speed 100% nhập tay** (2 ảnh mỗi case) — không tự động, dễ quên, Bảo
   khó tin số tự khai.

Quyết định Hiếu chốt (không tự đoán):
- SKU GM: **tự quét TOÀN BỘ SKU có phát sinh trong quý**, xếp hạng theo doanh thu tích luỹ (Pareto 80% = "trọng
  điểm") + SKU mới trong quý, weighted theo revenue. Bỏ hẳn yêu cầu tag tay effective_date.
- SLA/Vendor Speed: bot Lark (Gemini) tự đề xuất cặp request/completion từ 1 group Lark có sẵn → **Hiếu duyệt
  1-click (Xác nhận/Từ chối/Sửa giờ)** trước khi tính vào KPI — không tự động tính luôn, tránh AI đoán sai làm
  lệch số báo cáo hiệu suất.
- Mọi số lấy từ DB đều hiển thị kèm bảng dữ liệu gốc trên UI (không chỉ hiện con số).

## Cấu trúc dữ liệu

| Nguồn | Bảng/API | Ghi chú |
|---|---|---|
| Auto — %3HK, GM blended (context), Bé Gấu tasks | `GET /api/analytics/my-metrics` | gohub_dw + Supabase `app_usage_events`, cutoff `CURRENT_DATE-1` |
| **Auto — SKU GM quét toàn hệ thống (KPI chính)** | `GET /api/analytics/my-metrics/sku-scan` | Quét MỌI SKU có đơn trong quý (không cần tag tay) — CTE quý này vs quý trước trên `fact_fulfillment_revenue`, join `dim_sku`. Xem §"SKU auto-scan" |
| SKU annotation (tuỳ chọn, không quyết KPI) | `GET/POST/DELETE /api/analytics/my-metrics/sku-tags` | Supabase `okr_sku_tags` — chỉ còn là ghi chú gắn vào 1 dòng trong bảng scan (vd "renegotiate rate"), KHÔNG bắt buộc effective_date nữa (v45) |
| Manual — SLA/Vendor Speed evidence (ảnh) | `GET/POST/DELETE /api/analytics/my-metrics/evidence` | Supabase `okr_evidence_records`, bắt buộc đủ 2 ảnh (request+completion) mới tính vào TB, khoá sau khi quý đóng (`isQuarterLocked`). GET nay MERGE thêm case Lark đã duyệt (xem dưới) |
| **Auto — Lark bot đề xuất SLA/Vendor Speed** | Cron `GET /api/cron/my-metrics-lark-scan` | (s173) Đọc thread từ capture log real-time (MỌI group bot có mặt, không giới hạn 1 group) → hydrate đầy đủ + Gemini phân loại → ghi `okr_lark_events` (status=pending_review) |
| **Auto — capture real-time** | `api/lark/events` (tap, xem `lib/okr-lark-capture.ts`) | (s173, MỚI) Ghi mọi tin Hiếu tự gửi/được @mention vào `okr_lark_message_log` ngay khi Lark bắn event — nguồn phát hiện thread cho dòng trên |
| Review queue Lark | `GET /api/analytics/my-metrics/lark-events` · `POST /api/analytics/my-metrics/lark-events/[id]/review` | Hiếu duyệt Xác nhận/Từ chối/Sửa giờ — chỉ case `confirmed` mới gộp vào TB evidence |
| Config bot Lark | `GET/PUT /api/analytics/my-metrics/lark-config` | admin/creator only — `app_settings` key `my_metrics_lark_scan_config` (`{enabled, days_back}` — bỏ `chat_id` từ s173) |
| Target theo quý | `GET/PATCH /api/analytics/my-metrics/manual` | `app_settings` key `okr.<Q>-<year>` |
| Conversation drill-down | `GET /api/analytics/my-metrics/conversations` | Xem lại từng cuộc hội thoại được tính vào task count |
| Migration | `v44_okr_tracking.sql` + `v45_okr_lark_events.sql` + `v46_okr_lark_message_log.sql` | v44: schema gốc. v45: `okr_lark_events` (review queue). v46 (s173, Hiếu đã chạy): `okr_lark_message_log` (capture real-time) |
| Shared helpers | `web/src/lib/okr-helpers.ts` | `quarterRange`, `parseQuarterLabel`, `prevQuarterLabel`, `currentQuarterLabel`, `isQuarterLocked`, `OKR_GM_BASELINE=36.7`, `OKR_HK3_BASELINE=67.5` |
| **Auto — Bé Gấu Insights (s175, MỚI)** | `GET /api/analytics/my-metrics/begau-insights` | Top người dùng, chủ đề hay hỏi (tần suất từ khoá, không AI), chấm điểm heuristic câu trả lời. Logic: `lib/begau-insights.ts` |
| Lark thread fetch (dùng chung) | `web/src/lib/lark-thread-scan.ts` | `fetchRecentThreads(chatId, daysBack, maxThreads)` — tách ra từ Cà Thread (`api/creator/ca-thread`) để My Metrics dùng lại, không chép logic |
| Gemini classifier | `web/src/lib/okr-lark-classify.ts` | `classifyLarkThread(thread)` — JSON-mode, cùng convention `lib/agents/classifier.ts` (temperature 0, fallback an toàn) |

## 5 KPI (Q3 target theo offer letter, Q4 hardcode `DEFAULT_TARGETS` trong `page.tsx`)

| # | KPI | Target Q3 | Cách tính chính thức |
|---|---|---|---|
| 1 | SLA Handling Time | ≤5h, 80% requests | Manual (2 ảnh) **hoặc** Lark bot đã duyệt → TB hợp nhất 2 nguồn |
| 1 | Vendor Selection Speed | ≤15 phút/query | Tương tự SLA |
| 2 | SKU Gross Margin | +2.5% GM SKU trọng điểm/mới | **Auto-scan toàn hệ thống** (sku-scan) — weighted theo revenue, không cần tag tay |
| 2 | %3HK + Datapool Vendor | 74% revenue | `SUM(rev WHERE vendor IN (3HKDATAPOOL, BCDATAPOOL))/SUM(rev)` toàn công ty — auto |
| 3 (w=30%) | Tasks via Bé Gấu | 450/quý | `app_usage_events` chat có `ai_response` dài ≥15 ký tự, company-wide, breakdown theo `user_role` |

**Weighted OKR Score** = Σ(đạt-%ᵢ × trọng-sốᵢ)/100, `WEIGHTS` trong `page.tsx`: SLA/VendorSpeed/SKU-GM/%3HK mỗi
17.5% + Bé Gấu 30%.

## § SKU auto-scan (`/sku-scan`, s167)

Thay hoàn toàn cơ chế tag tay cũ. Với MỌI SKU có `fulfilled_revenue_amount_vnd > 0` trong quý hiện tại HOẶC quý
trước:
1. Query 2 CTE (`cur`/`prev`) trên `fact_fulfillment_revenue`, `GROUP BY TRIM(sku)`, loại `SHIPPINGFEE0`, cutoff
   `<=CURRENT_DATE-1`. `FULL OUTER JOIN` 2 CTE, join `dim_sku` (dedupe `DISTINCT ON (TRIM(sku))`, cùng pattern
   `products/report/route.ts`) lấy category/vendor.
2. Tính `gm_pct_cur`/`gm_pct_prev`/`delta` per SKU — SKU không có revenue quý trước = "mới" (so baseline công ty
   36.7%), có cả 2 quý = so trực tiếp GM% trước/sau.
3. Xếp hạng theo `rev_cur` DESC, đánh dấu `is_key=true` cho SKU nằm trong nhóm đóng góp **80% doanh thu tích
   luỹ** (Pareto, hằng số `KEY_SKU_CUM_PCT` trong route — sửa được nếu Bảo muốn ngưỡng khác).
4. `weighted_delta` = Σ(delta × rev_cur) / Σ(rev_cur) trên các SKU `is_key || is_new` — **đây là số KPI "SKU
   Gross Margin" chính thức**, hiển thị ở card đầu Section 2 + bảng đầy đủ (mọi cột, sortable, search, phân
   trang 50/trang) ngay dưới.
5. Cache 12h qua `cachedQuery` (data gohub_dw chỉ đổi 1 lần/ngày, cùng convention mọi route analytics khác).

`okr_sku_tags` (bảng cũ) giờ **chỉ là ghi chú tuỳ chọn** gắn vào 1 dòng SKU trong bảng scan (vd giải thích lý do
margin đổi) — click ô "Ghi chú" trong bảng → nhập → lưu `POST /sku-tags {quarter, sku_code, note}`. Không còn
bắt buộc `effective_date`/before-after tính tay.

## § Lark bot tự động phát hiện SLA/Vendor Speed (s167)

**Không tự động tính KPI ngay** — luôn qua hàng chờ duyệt (`pending_review` → Hiếu Xác nhận/Từ chối), vì AI đoán
sai thread sẽ làm lệch số báo cáo hiệu suất thật.

1. **Config** (`/lark-config`, admin/creator only, nút "⚙️ Lark Bot" ở header trang): `{enabled, chat_id,
   days_back}` — Hiếu tự nhập `chat_id` group Lark (Sales/PIC hỏi sản phẩm/giá NCC) sau khi deploy, giống hệt
   cơ chế `ca_thread_config` (không hardcode group nào).
2. **Cron** `GET /api/cron/my-metrics-lark-scan` (vercel.json `0 10 * * *`, 1x/ngày 17:00 ICT, `maxDuration:90` —
   **CHỈ 1x/ngày vì project trên Vercel Hobby plan, giới hạn cron tối đa 1 lần/ngày** — plan cũ `0 */3 * * *`
   (3 giờ/lần) từng bị Vercel REJECT thẳng deployment, khiến staging/main không deploy được gì suốt 2 tiếng
   cho tới khi phát hiện qua GitHub commit status "Vercel: Deployment failed" trỏ tới
   `vercel.com/docs/cron-jobs/usage-and-pricing`. Nếu Hiếu nâng lên Pro plan, có thể tăng tần suất lại):
   - `fetchRecentThreads()` (helper dùng chung) lấy thread root + replies + reaction trong `days_back` ngày.
   - Bỏ qua thread đã có trong `okr_lark_events` (dedupe theo `message_id`) và thread chưa có reply.
   - Với thread mới (tối đa 20/lần chạy): gọi `classifyLarkThread()` (Gemini `gemini-3.6-flash`, JSON-mode,
     temperature 0) → phân loại `sla` | `vendor_speed` | không match, xác định tin nào là "hoàn thành".
   - Match → insert `okr_lark_events` (`status='pending_review'`, `request_time`=tin gốc, `completion_time`=tin
     được AI chỉ ra nếu có, `duration_value` tự tính, `ai_reason` lưu lại để Hiếu đọc khi duyệt).
   - Có case mới → DM Lark cho Hiếu (`sendLarkDM` + `getLarkUserOpenId()`, tái dùng OAuth creator đã kết nối).
   - Lỗi → `alertCronFailure("my-metrics-lark-scan", err)`.
3. **Review queue** (panel "🤖 Bé Gấu phát hiện N case mới" trong mỗi `EvidenceCard`, SLA + Vendor Speed riêng):
   mỗi case hiện snippet request/completion + lý do AI + 3 nút: **Xác nhận** / **Sửa giờ & xác nhận** (chỉnh
   datetime trước khi chốt, phòng AI đoán sai completion message) / **Từ chối** (giữ lại trong list "đã từ chối
   (audit)" để theo dõi chất lượng AI theo thời gian, không xoá âm thầm).
4. **Merge vào TB evidence** (`GET /evidence`): trung bình verified nay hợp nhất 2 nguồn — record thủ công đủ 2
   ảnh (như cũ) **và** `okr_lark_events` `status='confirmed'`. Response thêm `sources:{manual, lark_auto}` cho
   badge UI. Bảng records trong UI hiện cả 2 nguồn (cột "Nguồn" 🤳 Ảnh / 🤖 Lark), chỉ record `manual` có nút
   sửa/xoá (case Lark sửa qua luồng duyệt, không sửa trực tiếp bản ghi evidence).

**Refactor liên quan**: `web/src/lib/lark-thread-scan.ts` (mới) tách phần "lấy thread + replies + reactions +
mentions từ 1 group Lark" ra khỏi `api/creator/ca-thread/route.ts` (Cà Thread) thành hàm dùng chung
`fetchRecentThreads()` — Cà Thread giờ gọi hàm này rồi tự áp lọc reaction-YES/participant riêng, tránh 2 nơi
chép cùng ~100 dòng logic Lark API dễ lệch nhau theo thời gian.

## § Sửa bot Lark — 2 bug khiến "set 30 ngày mà quét được 0 case" (2026-08-27)

Hiếu báo set `days_back=30` cho group có "rất nhiều request" nhưng bot không phát hiện được gì. Audit ra
**2 bug thật** trong `lib/lark-thread-scan.ts` + `api/cron/my-metrics-lark-scan`:

1. **Trần cứng 5 trang fetch (250 tin)** — không scale theo `daysBack`. Group nhiều tin/ngày → 250 tin đầu tiên
   (mới nhất) chỉ phủ được vài ngày thay vì đủ 30 ngày yêu cầu; phần còn lại của cửa sổ KHÔNG BAO GIỜ được
   Lark API trả về. Fix: `maxPages = Math.min(80, Math.max(10, daysBack * 3))` — trần chỉ là valve an toàn,
   điều kiện dừng THẬT vẫn là "đã ra ngoài cửa sổ ngày" (giữ nguyên logic cũ).
2. **Không nhớ thread ĐÃ XEM nhưng KHÔNG khớp** — trước chỉ insert case AI đồng ý (`is_match=true`) vào
   `okr_lark_events`; case bị từ chối không lưu gì → mỗi lần cron chạy lại chọn đúng N thread MỚI NHẤT (đã
   sort newest-first) để phân loại lại, và nếu N thread đó toàn bị từ chối (chat xã giao...) thì cron
   **KHÔNG BAO GIỜ tiến sâu hơn vào backlog cũ** dù request thật nằm ngay phía sau — giẫm chân tại chỗ vô hạn.
   Fix: ghi cả case không khớp vào `okr_lark_events` với `status='not_matched'`, `metric='none'` (không tính
   KPI, không hiện trong hàng chờ duyệt) — dedupe (`seen` set) giờ tự nhiên đẩy cron tiến qua backlog mỗi lần
   chạy thay vì lặp lại y hệt.

**Refactor liên quan:**
- `lib/lark-thread-scan.ts`: hydrate chi tiết từng thread (2 call Lark) theo **batch 15** thay vì bắn hết
  cùng lúc — cần thiết vì `maxThreads` giờ có thể lên tới 200 (trước 50), bắn 400 request song song dễ bị
  Lark rate-limit.
- `lib/lark-scan-runner.ts` (mới): tách logic quét thật ra khỏi cron route, dùng chung cho cron VÀ nút
  **"Quét ngay để test"** (mới, trong modal ⚙️ Lark Bot) — Hiếu không cần đợi cron chạy 1x/ngày (17:00 ICT)
  mới biết fix có work hay không; nút trả về ngay `scanned/classified/inserted/not_matched/backlog_remaining`.
- `api/analytics/my-metrics/lark-config/scan-now` (mới, POST, admin/creator): endpoint cho nút trên,
  `ignoreEnabled=true` để test được dù chưa tick "Bật quét tự động".
- **Panel review** (`LarkReviewPanel`) thêm mục **"Xem N thread Bé Gấu ĐÃ XEM nhưng không khớp (audit AI)"**
  — Hiếu tự soát bot có bỏ sót request thật hay không, và header giờ luôn hiện "đã quét N thread" (kể cả khi
  0 case chờ duyệt) để biết chắc bot có hoạt động không, tránh nhầm "im lặng" với "không có gì để quét".

**Chưa giải quyết được (cần Hiếu xác nhận thêm)**: chất lượng phân loại của Gemini (`okr-lark-classify.ts`)
vẫn chưa verify với data thật — 2 bug trên là root cause CHẮC CHẮN (logic sai rõ ràng), nhưng nếu sau khi fix
vẫn còn sót request thật, cần xem cụ thể qua mục "không khớp" ở trên để tinh chỉnh prompt.

## § Bảng chi tiết + filter (2026-08-27, feedback tiếp theo)

- **Datapool Rev — chi tiết theo SKU** (mới, `GET /api/analytics/my-metrics/datapool-detail`): Hiếu yêu cầu xem
  đơn/rev/SKU thay vì chỉ số tổng theo tháng — bảng mới ngay dưới card %Datapool Rev, group theo `(sku, vendor,
  category)` trong quý, cột SKU/Vendor/Category/Đơn/Units/Revenue, có filter vendor (3HK/BC/Mọi) + search SKU.
  Cache 12h như các route khác.
- **SKU Gross Margin — quét toàn hệ thống**: thêm 3 filter cạnh ô search (trước chỉ có search): **Loại**
  (Mọi loại/Chỉ Trọng điểm/Chỉ Mới), **Category**, **Vendor** — options tự sinh từ dữ liệu trả về (không
  hardcode danh sách). Dòng "đang lọc còn N SKU" hiện khi có filter đang áp.
- **Bỏ cột "Category" khỏi cả 2 bảng** (theo yêu cầu Hiếu) — filter Category vẫn giữ (lọc được, chỉ không
  hiện cột). Bảng SKU scan giờ cột "Vendor" đứng riêng (trước gộp chung "Category / Vendor").

## § UI/màu (2026-08-27, sau feedback "màu chưa ổn")

Dùng skill thiết kế [Hallmark](https://github.com/Nutlope/hallmark) (cài `~/.claude/skills/hallmark/`) để audit +
sửa — bug thật: trước có **5 màu badge cạnh tranh nhau** (blue=Auto, purple=Manual, amber=pending,
emerald=confirmed, slate=context) không mang ý nghĩa trạng thái thật, chỉ là color-code tuỳ hứng — đúng kiểu
"AI slop" (xem `references/color.md`: *"One accent. Maximum two. Everything else is neutral."*).

**Hệ màu mới:**
- **1 accent duy nhất** = Tailwind token `brand-*` (định nghĩa thật trong `tailwind.config.ts`, `brand-600
  = #0f4c81`, dùng khắp app — sidebar/top-bar/login/admin...) — chỉ dùng cho: nút hành động chính, link/hover,
  focus ring, badge "Key" (SKU trọng điểm). **Sửa lần 2 (2026-08-27)**: bản đầu dùng raw hex `#003B95` tự đoán
  (không phải token thật của project) → không nhất quán với phần còn lại của app, đây chính là lý do "màu
  chưa ổn". Đổi toàn bộ sang class `brand-500/600/700/50` thay vì hex tuỳ hứng.
- **Neutral (slate)** cho MỌI tag chỉ mang tính phân loại/nguồn (Auto, Manual, Context, Lark/Web, Khoá) — không
  còn tô màu theo loại, phân biệt bằng chữ.
- **2 màu semantic thật** (chỉ dùng khi đúng nghĩa trạng thái): emerald = verified/đạt target/SKU mới; amber =
  chờ duyệt/thiếu ảnh/dưới target. Không dùng amber cho khối thông tin không phải cảnh báo (trước đây banner
  "Baseline" tô nền amber dù không phải warning — đã đổi neutral).
- `SourceBox`: bỏ nested box-trong-box (card-in-card), chuyển sang hairline rule bên trái.
- Thanh "Weighted OKR Score": 5 ô trọng số trước đều nhau (`grid-cols-5`) — đổi sang `flex` tỉ lệ theo trọng số
  (`flexGrow: w`) để Bé Gấu (30%) rộng hơn 4 ô còn lại (17.5% mỗi ô), phá vỡ đơn điệu có chủ đích.
- Thêm `tabular-nums` cho mọi số headline lớn (căn cột đẹp khi số đổi).

## s179 (2026-08-31) — quét lịch sử 1 lần cho group cũ

Sau s178, Hiếu báo: 1 group hầu như thread nào cũng được mention (rất nhiều), nhưng quét real-time chỉ ra
đúng 1 case. Điều tra Vercel log production 3 tiếng gần nhất: chỉ **1** request `/api/lark/events` thật
(tin test "."). Kết luận: mọi mention "rất nhiều" Hiếu thấy là tin **CŨ**, từ trước lúc webhook thật sự
sống (bug chữ ký chặn tới tận s176 mới fix) — capture real-time (s173) CHỈ thấy tin từ lúc deploy, không
tự backfill lịch sử (đúng hạn chế đã ghi từ s173, không phải bug mới). Hỏi Hiếu qua AskUserQuestion có
muốn thêm quét lịch sử 1 lần không — lúc đầu chọn "không cần", sau đổi ý muốn có.

**Thêm — "Quét lịch sử 1 lần"** (modal ⚙️ Lark Bot):
- `runLarkHistoryScan(chatId, daysBack)` (`lark-scan-runner.ts`) — dùng lại `fetchRecentThreads()` (REST
  scan toàn group, logic Cà Thread) thay vì capture log, áp CÙNG tiêu chí "chỉ tin liên quan Hiếu"
  (`threadInvolvesUser()` — isSelf/mentioned, cả tin gốc lẫn mọi reply) và CÙNG pipeline classify+insert
  với quét real-time — extract `classifyAndInsertThreads()` dùng chung 1 chỗ, không chép logic.
- `quarterLabelForDate()` (`okr-helpers.ts`, mới) — quét ngược nhiều tháng có thể rơi vào quý TRƯỚC quý
  hiện tại. Áp fix này cho CẢ quét real-time (đúng hơn, dù hiếm lộ ra vì real-time luôn "vừa xảy ra").
- `listBotChats()` (`lark-thread-scan.ts`) + route `lark-config/groups` — liệt kê group bot đang là
  thành viên, Hiếu CHỌN group qua dropdown thay vì tự tra `chat_id` tay (trước đây Cà Thread bắt nhập tay).
- Route `lark-config/scan-history` — POST `{chat_id, days_back}` (tối đa 120 ngày, valve an toàn).
- FE: `ScanResultBox` tách riêng (dùng chung cho cả "Quét ngay" và "Quét lịch sử", tránh trùng JSX).

tsc PASS. **Cần Hiếu**: mở modal ⚙️ Lark Bot, chọn group busy đó trong dropdown "Quét lịch sử", quét thử.

## s178 (2026-08-31) — hiện tên/link group + nội dung đầy đủ trong panel duyệt case

Sau khi s177 fix xong (case đã ra hàng chờ duyệt), Hiếu báo panel không đủ để duyệt: (1) snippet
request/completion bị CSS `truncate` cắt còn 1 dòng dù DB lưu tới 300 ký tự — không đọc được nội dung thật
để quyết định duyệt/từ chối; (2) không biết case đang ở group nào giữa 4 group đã add bot.

Fix: `lark-events` GET route resolve `chat_name` qua Lark API (`getChatName()`, cache theo request — nhiều
event thường trùng chat_id) trả kèm mỗi case. FE: badge group (tên + link
`applink.larksuite.com/client/chat/open?openChatId=...` mở thẳng group đó trong Lark app), bỏ `truncate`
cho 2 đoạn snippet (wrap đầy đủ, không giới hạn 1 dòng nữa), thêm tên người gửi từng tin. tsc PASS.

## s177 (2026-08-31) — fix lỗi phân loại Lark bị nuốt im lặng + hiện danh sách group đã quét

Sau s176 (fix chữ ký webhook), Hiếu test lại "Quét ngay" — capture log đã ghi đúng thread test (root_id
thật, đủ reply, xác nhận qua query Supabase trực tiếp), nhưng `okr_lark_events` vẫn không có row mới nào
dù bấm scan nhiều lần (log Vercel xác nhận route chạy 200 OK, không lỗi).

**Root cause**: `classifyLarkThread()` (`okr-lark-classify.ts`) có `catch { return null }` — MỌI lỗi
Gemini (quota/JSON parse/timeout...) bị nuốt hoàn toàn im lặng, không log, không insert `not_matched`,
thread biến mất không dấu vết. Không có cách nào từ UI/DB biết được lý do "quét ra N mà 0 case" — phải
sửa code trước mới chẩn đoán tiếp được run kế tiếp mới thấy log thật.

**Fix**:
- Thêm `console.error("[Lark classify] lỗi phân loại thread ...")` trong catch — lần quét kế tiếp sẽ lộ
  lý do thật qua Vercel runtime log.
- Tăng `maxOutputTokens` 300→500 (giảm rủi ro JSON response bị cắt cụt giữa chừng — 1 nguyên nhân khả dĩ).
- `ScanRunResult` thêm field `classify_errors` — hiện ngay trong modal "⚙️ Lark Bot" (không cần vào Vercel
  log để biết CÓ lỗi, chỉ cần vào log khi cần biết lỗi CỤ THỂ gì).

**Thêm theo yêu cầu Hiếu — hiện danh sách group đã quét**: modal "Quét ngay" giờ hiện `Đã quét N group:
<tên group> (n thread), ...` — tính trên TOÀN BỘ thread capture log phát hiện được (kể cả bị loại bởi
filter "phải có reply" bên dưới, để Hiếu thấy đúng bot có chạm group nào, không chỉ nhóm lọt qua được).
Tên group lấy qua Lark API `/im/v1/chats/{chat_id}` (hàm mới `getChatName()`, `lib/lark-thread-scan.ts`,
cùng pattern Cà Thread `debug` mode đã dùng trước đó).

tsc PASS. **Cần Hiếu**: bấm "Quét ngay" lại — nếu vẫn 0 case, mở phần "N thread lỗi phân loại" mới hiện
trong modal + báo Claude tra `[Lark classify]` trong Vercel log để biết lỗi Gemini cụ thể.

**s177(b) — root cause thật của "Gemini không trả JSON" (cùng ngày, ngay sau khi log full text lộ ra):**
raw text log mới cho thấy JSON ĐÚNG cấu trúc nhưng đứt ngang giữa chừng field
(`{"is_match": true, "metric": "sla", "completion_reply` — thiếu hẳn phần còn lại) — không phải Gemini
trả sai định dạng, mà bị **cắt cụt do hết token**. `gemini-3.6-flash` mặc định bật "thinking" (chuỗi suy
luận ẩn) — token đó TÍNH CHUNG vào `maxOutputTokens` cùng ngân sách với phần JSON thấy được, ăn hết trước
khi tới JSON thật dù đã tăng 300→500.
- **Thử lần 1**: `thinkingConfig: { thinkingBudget: 0 }` tắt hẳn thinking (đúng pattern
  `api/config/schema/ai-suggest/route.ts`) → **model trả thẳng 400 "invalid argument"** — model này KHÔNG
  chấp nhận field đó (không phải model Gemini nào cũng cho tắt thinking bằng budget=0, dù cùng tên model
  vẫn có route khác dùng field này — chưa rõ route kia có thật sự chạy qua chưa hay cũng sẽ lỗi tương tự
  nếu gọi thật, KHÔNG sửa route đó vì ngoài phạm vi request). Đã revert.
- **Fix thật (lần 2)**: bump `maxOutputTokens` thẳng lên **4000** — khớp đúng con số
  `lib/weekly-report/narrative.ts` đã dùng ổn định với CÙNG model + CÙNG `responseMimeType` (Hiếu xác nhận
  chạy thật ở s170(c)), không tự đoán số mới. Đủ chứa cả phần thinking ẩn lẫn JSON thật. tsc PASS.

## s176 (2026-08-31) — fix KHẨN: Lark webhook production reject 100% request thật (root cause thật lần 2)

Hiếu báo lại sau khi test tay s175: (1) chart SKU movers vẫn lấn chữ dù đã "auto-size", (2) tạo group
Lark mới + đăng thread test + Quét ngay → vẫn 0 case dù s175 đã fix `open_id`.

**Điều tra bằng Vercel runtime log thật** (MCP `plugin_vercel_vercel__get_runtime_logs`):
- Check log `preview` (staging) đúng khung giờ Hiếu test (06:57-07:03 UTC, khớp timestamp API call
  `scan-now`/`lark-config` của Hiếu) → **ZERO** request `/api/lark/events`. Webhook Lark đăng ký trỏ về
  **production** (`main`), không phải staging — đúng thiết kế (Bé Gấu phục vụ traffic thật liên tục,
  không thể trỏ về staging).
- Check log `production` cùng khung giờ → **CÓ** 12 request `/api/lark/events` thật, nhưng **100% bị
  reject**: `[Lark] signature mismatch — request rejected`.

**Root cause thật**: `verifyLarkSignature()` (`api/lark/events/route.ts`) ký HMAC-SHA256 bằng
`LARK_VERIFICATION_TOKEN` làm key. Sai so với spec Lark Event Subscription khi app có bật Encrypt Key
(app này CÓ bật — AES decrypt payload dùng `LARK_ENCRYPT_KEY` ngay cùng file) — công thức đúng là
`sha256(timestamp + nonce + ENCRYPT_KEY + rawBody)`, **SHA256 thường** (không phải HMAC) và dùng
**Encrypt Key** (không phải Verification Token). Sai cả key lẫn thuật toán → `expected` không bao giờ
khớp `X-Lark-Signature` thật Lark gửi, reject 100% request bất kể `LARK_VERIFICATION_TOKEN` giá trị gì.

Bug có từ s159 (2026-08-24, lúc thêm chữ ký làm security hardening) — không liên quan gì s171-175, chỉ
tình cờ lộ ra vì My Metrics giờ phụ thuộc `/api/lark/events` nhận request thật.

🔴 **Hệ quả rộng hơn phạm vi My Metrics**: bug này chặn MỌI request Lark thật tới production kể từ
2026-08-24 — **Bé Gấu (chatbot chính) trên Lark không trả lời ai suốt từ đó tới lúc fix**, không chỉ
My Metrics capture. Đây mới là lý do thật "0 case" (open_id ở s175 vẫn là bug thật, cần fix, nhưng chỉ
fix 1 trong 2 lớp chặn — phải fix cả 2 mới thông).

**Fix**: `verifyLarkSignature` đổi sang dùng `LARK_ENCRYPT_KEY` + `createHash("sha256")` (bỏ `createHmac`,
xoá import không dùng nữa). tsc PASS.

**Chart SKU movers lấn chữ (lần 2)**: fix trước (auto-width theo ước lượng `~6.5px/ký tự`) vẫn sai vì SVG
text KHÔNG tự wrap/clip theo width layout Recharts YAxis — chỉ là gợi ý bố cục, chữ dài hơn ước lượng vẫn
vẽ tràn thật vào vùng bar. Đổi cách tiếp cận: width CỐ ĐỊNH (92px) + cắt chuỗi hiển thị bằng `tickFormatter`
(ellipsis sau 11 ký tự) → không bao giờ tràn dù SKU dài cỡ nào; tên đầy đủ vẫn xem qua Tooltip khi hover.
Chỉ sửa `SkuMoversChart` (chart Hiếu báo lỗi) — `TopUsersChart` dùng cùng pattern cũ, CHƯA sửa (chưa ai
báo lỗi).

**Cần Hiếu**: merge main GẤP (Bé Gấu Lark đang câm ở production) — sau merge gửi thử 1 tin Lark bất kỳ,
xác nhận bot trả lời lại bình thường trước khi test tiếp My Metrics "Quét ngay".

## s175 (2026-08-31) — fix ROOT CAUSE "0 case" thật + auto-size chart + Bé Gấu Insights

Hiếu báo: đã add bot vào 1 group hoạt động rất nhiều nhưng quét vẫn 0. Query trực tiếp Supabase (có
credential trên máy dev lần này) xác nhận `okr_lark_message_log` = **0 dòng** → xác nhận bug nằm ở
CAPTURE (webhook không ghi được gì), không phải ở bước phát hiện/hydrate thread.

**Root cause tìm được (bug thật, không phải giả thuyết):** `getLarkUserOpenId()` (dùng để biết "Hiếu là
ai" khi so `sender_open_id`/mentions) đọc field `open_id` từ `app_settings.lark_oauth_creator` — nhưng
record thật trong DB **KHÔNG CÓ field `open_id`** (`JSON.stringify` tự bỏ field `undefined`). Truy ngược:
`api/lark/oauth/callback/route.ts` gọi `saveLarkUserToken(tok, tok.open_id)` — giả định response đổi
`authorization_code → token` (Lark OAuth v2) có sẵn field `open_id`, nhưng **Lark KHÔNG trả `open_id`
trong response đó** (đúng như README mẫu `Hieu/lark-sla-bot` đã ghi: phải gọi RIÊNG
`GET /authen/v1/user_info` bằng access_token mới có open_id). `tok.open_id` luôn `undefined` từ lúc code
này viết (không phải bug s173 mới gây ra — pre-existing, chỉ không ai để ý vì trước đây
`getLarkUserOpenId()` chỉ dùng cho 1 tính năng phụ "gán task assignee", không critical).

**Fix:**
1. `lib/lark.ts` thêm `getLarkSelfOpenId(userAccessToken)` — gọi đúng
   `GET /authen/v1/user_info` với access_token vừa nhận để tự tra open_id thật.
2. `oauth/callback/route.ts` gọi hàm mới này thay vì đọc thẳng `tok.open_id`.
3. **Backfill NGAY cho kết nối hiện tại của Hiếu** (không cần re-OAuth): dùng access_token còn hạn trong
   record cũ gọi thẳng `user_info` → nhận đúng `open_id = ou_e5af3c7f447984052c1c5a5c2f594127` (khớp
   `LARK_CREATOR_USER_ID` đã biết) → UPDATE thẳng vào Supabase. `getLarkUserOpenId()` hoạt động đúng
   NGAY LẬP TỨC kể cả trước khi deploy code fix (vì hàm này chỉ đọc field tĩnh, không gọi Lark API).
4. Fix này sửa LUÔN mọi tính năng khác âm thầm bị ảnh hưởng bởi cùng bug (chưa ai báo): DM cảnh báo case
   mới của My Metrics (`sendLarkDM` trong `lark-scan-runner.ts`), gán task assignee Gấu Pro.

**Chưa xác nhận (cần Hiếu test lại):** sau fix + backfill, gửi 1 tin thật trong group đã add bot rồi bấm
"Quét ngay" — nếu VẪN 0, khả năng còn lại là Lark App event subscription scope quá hẹp (chỉ nhận tin
@mention bot, không nhận toàn bộ tin group — xem cảnh báo trong README mẫu Hiếu đưa, mục "Quan trọng").
Chưa xác nhận cần thiết vì code hiện tại (đoạn "auto-capture group chat_id") vốn đã giả định nhận được
MỌI tin group từ trước s173, nên nhiều khả năng scope đã đúng sẵn.

**Chart tự lấn chữ (SKU/tên) — fix auto-size:** `SkuMoversChart` (YAxis SKU) trước `width={110}` cố định
— SKU dài (13-18 ký tự) tràn ra ngoài, lấn vào vùng vẽ bar. Đổi sang tính `yAxisWidth` tự động theo độ
dài chuỗi dài nhất trong data (`Math.min(170, Math.max(70, longest*6.5+16))`), tăng margin phải (28→44)
cho label số. Áp dụng cùng cách cho `TopUsersChart` (mới, xem dưới). Container height cũng tăng
26px/dòng → 34px/dòng cho thoáng hơn.

**Bé Gấu Insights (mới, theo yêu cầu "lọc ai dùng nhiều/chủ đề hay hỏi/chấm điểm câu trả lời"):**
- Route mới `GET /api/analytics/my-metrics/begau-insights?quarter=Q3&year=2026` — cùng định nghĩa
  "task" với route chính (`event_type='chat'`, response ≥15 ký tự, trong quý).
- **Top người dùng**: group theo `user_name||user_email`, top 10 — chart `TopUsersChart` (bar ngang).
- **Chủ đề hay hỏi**: đếm tần suất từ khoá/cụm 2 từ trong `user_message` (bỏ stopword tiếng Việt phổ
  biến) — **heuristic thuần đếm tần suất, KHÔNG dùng AI** (rẻ, tức thời, không cache/async). Verify với
  data thật Q3-2026 (328 task): ra đúng các chủ đề nghiệp vụ thật ("doanh thu", "target", "cm1",
  "pro rata", "b2c") — có lẫn vài tên riêng (không phân biệt được danh từ riêng/chủ đề, hạn chế đã biết
  của phương pháp tần suất đơn giản). Hiển thị dạng "chip cloud" (badge màu brand, độ đậm theo tần suất).
- **Chấm điểm câu trả lời — HEURISTIC rõ ràng** (`lib/begau-insights.ts` `scoreResponseQuality()`):
  +điểm nếu có số liệu/có cấu trúc bảng-bullet/đủ dài, -điểm nếu quá ngắn hoặc chứa cụm "xin lỗi/chưa có
  thông tin/không rõ...". Verify data thật Q3-2026: điểm TB 93.0, 315 high / 12 medium / 1 low (328
  task) — hợp lý cho 1 agent BI đã qua nhiều vòng audit chất lượng (s106-s111). Bảng kết quả (DataTable
  20/dòng, điểm thấp lên đầu) để Hiếu soát nhanh case khả nghi — filter theo bucket (Tất cả/Tốt/Trung
  bình/Cần soát). **Ghi rõ trong NotesDrawer: đây KHÔNG phải AI chấm, không đo đúng/sai thật** — chỉ lọc
  nhanh case đáng xem lại, khớp tinh thần minh bạch đã có của cả tab.
- tsc + `next build` PASS. Đã **verify logic (keyword+scoring) chạy thật trên Supabase Q3-2026** (328
  task) qua script test độc lập trước khi tin — không chỉ tsc pass suông.

## s174 (2026-08-31) — mở rộng phân loại "sla" + bảng 20 dòng/trang

Hiếu (sau khi chạy migration v46) yêu cầu xem lại logic phân loại thread + đổi pageSize bảng.

- **Bảng: `pageSize` mặc định của `DataTable` (component dùng chung toàn trang) đổi 50 → 20** — 1 dòng
  sửa, áp cho MỌI bảng trong tab (SKU scan, evidence, Datapool detail, %Datapool theo tháng, Bé Gấu
  theo tháng) vì tất cả đều dùng chung component, không hardcode `pageSize` riêng lẻ.
- **Mở rộng định nghĩa "sla" trong prompt phân loại** (`lib/okr-lark-classify.ts`): trước chỉ nêu "yêu
  cầu tạo/onboard sản phẩm mới" + "hỏi có gói cho nước nào" — hẹp hơn thực tế công việc Product Ops.
  Nay liệt kê rõ 3 nhóm ví dụ (Gemini vẫn tự suy luận theo TINH THẦN, không so khớp từ khoá cứng —
  "nhiều trường hợp khác nữa" theo đúng ý Hiếu):
  1. **Tạo/thêm/add sản phẩm** — yêu cầu tạo/thêm/add/onboard SKU/gói mới.
  2. **Cung cấp/kiểm tra/xác nhận thông tin** — SKU đã có chưa, giá/COGS/APN/chính sách, khuyến mãi...
     bất kỳ câu hỏi nào cần Product Ops tra cứu rồi trả lời.
  3. **Báo lỗi/sự cố sản phẩm** — sai giá/thiếu SKU/sai APN cần Product Ops sửa.
  4. Các dạng khác cùng bản chất "nhờ Product Ops xử lý".
  `vendor_speed` (Vendor Rate Query) giữ nguyên định nghĩa, không đổi.
- **Fix nhân tiện phát hiện khi đọc lại logic**: prompt CŨ dặn Gemini trả `is_match=false` cho thread
  CHƯA có completion (còn đang hỏi qua lại) → thread đó bị ghi `status='not_matched'` vào
  `okr_lark_events`, biến mất vào mục "đã xem nhưng không khớp (audit AI)" — Hiếu KHÔNG thấy nó trong
  hàng chờ duyệt để tự điền completion time tay dù request là THẬT. Nay đổi: request thật nhưng chưa
  xong → `is_match=true`, `completion_reply_index=null` → ghi `status='pending_review'` với
  `completion_time=null` → HIỆN trong hàng chờ duyệt, Hiếu dùng nút "Sửa giờ & xác nhận" (đã có sẵn
  trong `LarkReviewPanel`, FE vốn đã handle `completion_time=null` hiện "chưa xong" từ trước — không
  cần sửa FE) để tự điền hoàn thành thay vì request bị bỏ sót hoàn toàn.
- **Hạn chế còn lại (chưa fix, ngoài scope lần này)**: dedupe theo `message_id` trong
  `lark-scan-runner.ts` khiến 1 thread ĐÃ ghi vào `okr_lark_events` (dù `pending_review` hay
  `not_matched`) KHÔNG bao giờ được quét lại — nếu Gemini lần đầu bỏ sót completion (vd completion nằm
  ở reply thứ N+1 xuất hiện SAU lần scan đó), Hiếu vẫn phải tự sửa tay qua "Sửa giờ", bot không tự cập
  nhật lại. Chấp nhận được vì Hiếu giờ ÍT NHẤT thấy được request trong hàng chờ (khác trước — biến mất
  hẳn); muốn tự động re-scan cần thêm logic riêng, chưa làm.
- tsc PASS. Chưa verify chất lượng phân loại với dữ liệu Lark thật.

## s173 (2026-08-31) — Lark bot chuyển sang real-time capture, bỏ giới hạn 1 group

Hiếu đưa mẫu `Hieu/lark-sla-bot` (bot riêng ghi tin nhắn Lark real-time vào Bitable để tính SLA) yêu cầu
"đọc và áp dụng vào My Metrics". Ý tưởng cốt lõi học được: bot chỉ cần biết **"tin này có liên quan
mình không"** (sender = mình HOẶC mình bị @mention) — **không quan tâm group nào**, thay vì quét REST 1
group cấu hình cứng như trước (s167, kết quả: 0 case cả Q3-2026 vì y giới hạn đúng 1 group trong khi
request/vendor-query thật xảy ra rải rác nhiều group khác nhau).

**KHÔNG deploy bot riêng** (mẫu Hiếu đưa là 1 project Express/Vercel độc lập) — tích hợp thẳng vào
webhook Lark **đã có sẵn** của GoHub Intel (`api/lark/events`, vốn phục vụ Bé Gấu) vì nó ĐÃ nhận được
mọi tin nhắn ở mọi group bot có mặt, chỉ thiếu bước "ghi lại tin liên quan Hiếu" — tránh vận hành 2 app
Lark riêng biệt (2 App ID, 2 webhook, dễ lệch/khó nhớ cái nào làm gì).

**Kiến trúc mới:**
1. **Capture real-time** (`lib/okr-lark-capture.ts`, gọi từ `api/lark/events/route.ts` ngay sau khi
   parse xong nội dung tin — TRƯỚC filter "group phải @mention BOT" vì đây là quan tâm khác nhau):
   fire-and-forget, kiểm `senderOpenId === myOpenId` (Hiếu tự gửi) HOẶC `myOpenId` nằm trong mentions
   (Hiếu được @mention) — `myOpenId` lấy qua `getLarkUserOpenId()` (open_id Lark cá nhân Hiếu đã kết
   nối ở Creator Settings, infra có sẵn từ s132, KHÔNG cần OAuth mới). Nếu đúng → upsert 1 dòng vào
   bảng mới `okr_lark_message_log` (migration `v46_okr_lark_message_log.sql`, **CHƯA CHẠY — cần
   Hiếu**): message_id, thread_id (=root_id hoặc chính nó), chat_id, sender, is_self_post,
   mentioned_open_ids, content preview, create_time_ms. Bảng này CHỈ để "biết thread nào đáng xem" —
   KHÔNG lưu toàn bộ nội dung thread (không thay thế REST hydrate).
2. **Phát hiện thread từ log** (`fetchThreadsFromCapturedLog()`, `lib/lark-thread-scan.ts`, hàm mới
   cạnh `fetchRecentThreads()` cũ — KHÔNG xoá hàm cũ, Cà Thread vẫn dùng): đọc `thread_id` distinct
   trong `daysBack` từ `okr_lark_message_log` (không giới hạn group), rồi **hydrate ĐẦY ĐỦ** từng
   thread (root + mọi reply + reaction) qua Lark REST — tái dùng đúng `hydrateThread()` đã có, chỉ khác
   NGUỒN phát hiện "thread nào cần xem" (log real-time thay vì list-toàn-group). `LarkThread` type thêm
   field `chat_id` (trước không có, giờ cần vì mỗi thread có thể ở group khác nhau — trước đây
   `okr_lark_events.chat_id` lấy thẳng từ `config.chat_id` 1 giá trị cố định).
3. **`lark-scan-runner.ts`**: đổi nguồn từ `fetchRecentThreads(config.chat_id, ...)` sang
   `fetchThreadsFromCapturedLog(config.days_back, ...)`; bỏ điều kiện chặn "chưa cấu hình chat_id".
   `chat_id` khi ghi `okr_lark_events` giờ lấy từ `t.chat_id` (per-thread) thay vì `config.chat_id` (1
   giá trị cố định) — đúng bản chất nhiều group.
4. **Config đơn giản hơn**: `lark-config` API (GET/PUT) bỏ field `chat_id` — chỉ còn `{enabled,
   days_back}`. Modal "⚙️ Lark Bot" (My Metrics) bỏ input Chat ID, thay bằng đoạn giải thích 2 điều
   kiện cần có: (1) đã Kết nối Lark cá nhân (Creator Settings), (2) bot đã được add vào các group liên
   quan — **Lark chỉ gửi event cho group mà bot LÀ THÀNH VIÊN, không có cách nào bỏ qua giới hạn này**
   (đúng README mẫu Hiếu đưa) → đây là việc Hiếu cần tự làm (Lark Admin Console hoặc add tay từng
   group), KHÔNG tự động hoá được từ code.

**Chưa làm / hạn chế biết trước:**
- Chỉ bắt được `message_type` = text/post (khớp giới hạn sẵn có của toàn bộ `api/lark/events` — Bé Gấu
  cũng chỉ xử lý 2 loại này). Ảnh/file Hiếu gửi làm bằng chứng KHÔNG được capture qua đường này (vẫn
  dùng evidence 2-ảnh nhập tay như cũ cho trường hợp đó).
- **Không có dữ liệu lịch sử** — capture chỉ có từ lúc migration chạy + code deploy trở đi, không hồi
  cứu được tin nhắn cũ trước đó (khác hẳn REST-scan cũ vốn CÓ THỂ nhìn lại quá khứ, dù bị giới hạn 1
  group). Đánh đổi chấp nhận được: đổi lấy độ phủ toàn diện + real-time cho TỪ NAY VỀ SAU.
- Nếu Hiếu CHƯA kết nối Lark cá nhân → `getLarkUserOpenId()` trả `null` → capture bỏ qua an toàn (không
  lỗi), nhưng cũng không bắt được gì — cần xác nhận đã kết nối trước khi kỳ vọng có dữ liệu.
- tsc + `next build` PASS. **CHƯA verify được với dữ liệu Lark thật** (máy dev không nhận webhook thật)
  — Hiếu cần: (1) chạy migration v46, (2) xác nhận đã Kết nối Lark cá nhân, (3) add bot vào các group
  Sales/PIC liên quan nếu chưa, (4) gửi thử 1 tin có liên quan rồi bấm "Quét ngay" xem có bắt được không.

## s172 (2026-08-31) — rebuild UI: trẻ trung/hiện đại hơn, thêm chart, gom ghi chú vào 1 nút

Theo yêu cầu Hiếu "nhìn thật trẻ trung, hiện đại, rõ ràng, thêm chart, note gom vào 1 button, bảng 50
dòng/trang". Chỉ đổi presentation (FE) — KHÔNG đổi bất kỳ logic tính số/API nào.

- **Bảng 50 dòng/trang**: đã đúng sẵn từ trước — `DataTable` (component dùng chung toàn trang) có
  `pageSize = 50` mặc định, không route nào override. Không cần sửa gì, chỉ xác nhận lại.
- **4 chart mới** (`my-metrics-charts.tsx`, file mới — cùng pattern `bod-charts.tsx`: recharts +
  `React.memo`, nạp qua `next/dynamic({ssr:false})` để code-split khỏi bundle đầu):
  1. `ScoreRadarChart` — radar 5 trục (SLA/Vendor Speed/SKU GM/%3HK/Bé Gấu) cho Weighted OKR Score,
     thay/đi kèm dãy ô số cũ — vòng nét đứt = mốc 100%, domain co giãn tới 120% để thấy rõ vượt target.
  2. `DatapoolTrendChart` — area chart %Datapool theo tháng, có đường target nét đứt.
  3. `BegauTrendChart` — stacked bar Web/Lark theo tháng (thay dòng chữ liệt kê).
  4. `SkuMoversChart` — bar chart ngang top 5 SKU tăng/giảm GM% mạnh nhất (trong nhóm trọng điểm/mới),
     màu diverging emerald/amber (đúng nghĩa đã dùng sẵn toàn trang — không thêm hue mới).
  Không gọi API mới — mọi chart dùng lại data đã fetch sẵn (`auto`, `data.items`), tính bằng
  `useMemo`/derive trực tiếp trong `page.tsx`.
- **Ghi chú/công thức gom vào `NotesDrawer`** (component mới, slide-over phải, dùng animation có sẵn
  `.animate-slide-in-right`/`.animate-overlay-in` trong `globals.css` — không thêm CSS/lib mới): nút
  "📖 Cách tính" ở header mở drawer chứa 5 mục accordion (Weighted Score formula, chú thích màu badge,
  SKU GM cách tính, %3HK+Datapool cách tính, Bé Gấu cách tính) — nội dung y hệt các đoạn text TRƯỚC ĐÂY
  luôn hiển thị inline (SkuScanSection description, box "blended toàn công ty", đoạn công thức dưới
  Weighted Score, legend màu ở thanh freshness) — chỉ dời chỗ, không đổi 1 chữ nội dung. `SourceBox`
  (nút "Nguồn dữ liệu" per-table, đã collapse sẵn từ trước) giữ nguyên riêng — phục vụ mục đích khác
  (audit SQL kỹ thuật per-bảng), không gộp vào NotesDrawer.
- **Polish hero**: nền gradient `slate-900→brand-800` (thay flat `slate-900`) + icon header đổi gradient
  `brand-500→brand-700` — dùng đúng scale `brand-*` có sẵn trong `tailwind.config.ts` (50-800), không tự
  đoán hex mới (đúng bài học đã rút ra ở mục "UI/màu" phía trên).
- tsc + `next build` PASS. **CHƯA test qua browser thật** (Chrome extension `claude-in-chrome` không kết
  nối lúc làm + máy dev thiếu `ANALYTICS_DB_*` nên trang chỉ redirect `/login` khi curl không session) —
  Hiếu QA trên staging: xem hero/radar/3 chart mới render đúng, nút "Cách tính" mở/đóng được, số liệu
  không đổi so với trước rebuild (chỉ UI đổi).

## s171 (2026-08-31) — audit + fix 3 bug thật (theo yêu cầu Hiếu "quét tab My Metrics")

1. **HIGH — `lark-config/route.ts` + `lark-config/scan-now/route.ts` check quyền bằng JWT role
   (`session.user.role`), không phải role tươi DB** — cùng lỗi s165 đã quét+fix hàng loạt route khác
   (34 route), nhưng 2 route này thêm SAU s165 (s167) nên bị bỏ sót. Hậu quả: user vừa được cấp
   admin/creator nhưng chưa re-login trong JWT maxAge 1 ngày → FE thấy nút "⚙️ Lark Bot" (role tươi
   qua `/api/user/me`) nhưng bấm vào bị 401 oan. Fix: đổi sang `canWriteTab(username, "my-metrics",
   ["admin","creator"])` (role tươi), khớp `evidence`/`sku-tags`/`lark-events/review`/`manual`.
2. **MEDIUM — `%3HK + BC Datapool` (`my-metrics/route.ts`) có thể đếm trùng doanh thu nếu `dim_sku`
   có dòng trùng SKU khác vendor** — công thức cũ dùng 2 `IN (SELECT DISTINCT ... WHERE vendor=X)`
   ĐỘC LẬP không loại trừ lẫn nhau, khác với `sku-scan`/`datapool-detail` (2 route cùng tab) vốn đã
   phải `DISTINCT ON (TRIM(sku))` để né đúng vấn đề này. Fix: đổi sang 1 JOIN với subquery đã dedupe
   (`DISTINCT ON`), 1 CASE duy nhất trên `vendor_norm` → loại trừ lẫn nhau by construction, nhất
   quán cách làm với 2 route kia.
3. **LOW — `conversations/route.ts` tự tính lại quarter range** thay vì dùng chung
   `parseQuarterLabel()` (`lib/okr-helpers.ts`, 4 route khác trong tab đều dùng). Cách cũ dựng
   `new Date(year, startMonth, 1).toISOString()` — nếu server chạy timezone khác UTC sẽ lệch ngày
   biên (Vercel chạy UTC nên chưa lộ, nhưng là bug tiềm ẩn). Fix: dùng `parseQuarterLabel` +
   `T00:00:00.000Z`/`T23:59:59.999Z` tường minh, tránh phụ thuộc timezone server.

**Đã kiểm, không thấy bug**: quarter lock áp đúng mọi route ghi; công thức `weighted_delta` SKU
Gross Margin không double-count SKU vừa `is_key` vừa `is_new`; check đủ 2 ảnh mới tính KPI đúng vị
trí; bot Lark dedupe qua `message_id` đúng; không có pattern filter-injection kiểu Supabase `.or()`
nội suy chuỗi (khác bug đã tìm ở Tổ Gấu cùng đợt audit) — mọi route My Metrics dùng `.eq()`/`.in()`
tham số hoá.

tsc PASS. **CHƯA verify được số `%3HK+Datapool` thật sau fix** (máy dev thiếu `ANALYTICS_DB_*`) — Hiếu
tự so số trước/sau fix trên staging, số CHỈ đổi nếu `dim_sku` thật sự có SKU trùng dòng khác vendor
(nếu dữ liệu sạch, số giữ nguyên — fix chỉ để phòng ngừa/nhất quán code, không chắc có bug số thật).

## Gotchas

- **Quarter lock**: `isQuarterLocked(label)` = `true` khi hôm nay > ngày cuối quý → evidence + SKU note + duyệt
  Lark event của quý đó đều khoá (API 403), chỉ đọc.
- **Verified vs total**: evidence thiếu 1 trong 2 ảnh vẫn lưu (minh bạch là có ghi nhận) nhưng KHÔNG cộng vào TB
  KPI — badge riêng "Thiếu ảnh". Case Lark luôn coi là verified một khi `status=confirmed` (bằng chứng = log
  chat + người duyệt, tương đương độ tin cậy với 2 ảnh).
- **SKU mới không có "trước"**: so với `OKR_GM_BASELINE` (36.7%) thay vì so chính nó — đổi baseline thì sửa
  hằng số trong `okr-helpers.ts`, đừng hardcode lại chỗ khác.
- **`KEY_SKU_CUM_PCT` (Pareto 80%)** nằm trong `sku-scan/route.ts` — công khai để dễ chỉnh nếu Bảo muốn ngưỡng
  "trọng điểm" khác.
- **(s173) Lark bot chưa hoạt động cho tới khi: (1) migration v46 đã chạy, (2) Hiếu đã Kết nối Lark cá nhân
  (Creator Settings), (3) bot đã được add vào group liên quan** — không còn cần nhập `chat_id` (bỏ từ s173,
  xem §"s173" phía trên). Cron/`runLarkScan` tự skip nếu `enabled=false`, không lỗi, chỉ trả `{skipped:
  "..."}`.
- **Chất lượng AI phân loại chưa verify với dữ liệu thật** — đây chính là lý do có hàng chờ duyệt thay vì tự
  động tính luôn; Hiếu nên soát kỹ đợt case đầu tiên trước khi tin tưởng số.
- **Cách kiểm tra nhanh "bot đã chạy lần nào chưa" khi debug** (2026-08-27, cập nhật s173): đọc `app_settings`
  key `my_metrics_lark_scan_config` (`enabled`/`days_back`) + đếm dòng `okr_lark_message_log` (capture có chạy
  không — 0 dòng nghĩa là chưa có tin nào được ghi, kiểm tra lại 3 điều kiện ở gotcha trên) + đếm
  `okr_lark_events` theo mọi `status` (kể cả `not_matched`) cho quarter hiện tại (classify có chạy không).
- **Bé Gấu task ≠ "thành công" theo nghĩa nghiêm ngặt** — chỉ lọc được độ dài response (không có structured
  success flag từ `be-gau.ts`). Nếu muốn phân loại chuẩn hơn cần thêm cột đánh giá thủ công hoặc structured
  output ở `be-gau.ts` (chưa làm, out of scope).
- Máy dev không có `ANALYTICS_DB_*` → chưa chạy được SQL sku-scan live để verify số thật; cũng không test được
  webhook capture/cron/Gemini với dữ liệu Lark thật. Hiếu cần: (1) chạy migration v46, (2) xác nhận đã Kết nối
  Lark cá nhân + bot đã ở đúng group, (3) theo dõi vài ngày đầu xem bot phân loại đúng không trước khi tin số
  báo cáo.
- **%3HK + Other Datapool Vendor (2026-08-27)**: đúng tên KPI offer letter, gộp CẢ 3HK Datapool VÀ **BC Datapool**
  (`dim_sku.vendor = 'BC Datapool'`, Hiếu xác nhận qua SQL Explorer) — % KPI vẫn tính trên TỔNG 2 vendor:
  `REPLACE(UPPER(TRIM(vendor)),' ','') IN ('3HKDATAPOOL','BCDATAPOOL')`. **UI tách rõ 2 subtotal** (Hiếu yêu
  cầu) — card hiện "Datapool Rev" (tổng) làm số chính, kèm 2 dòng phụ "↳ 3HK Rev" / "↳ BC Rev" riêng biệt;
  bảng theo tháng có cột riêng "3HK Rev" và "BC Rev". API `hk3` object trả thêm `hk3_only_rev`/`bc_only_rev`
  (aggregate) và mỗi dòng `monthly[]` có `hk3_rev`(=3HK riêng)/`bc_rev`(=BC riêng)/`total_rev`. **Chỉ áp trong
  My Metrics** — KPI "3HK Contribution %" ở BOD/Dashboard/Quarterly/Channels là chỉ số RIÊNG (chỉ 3HK, không
  có BC), cố ý KHÔNG đổi theo vì đó là số đã báo cáo lâu dài cho leadership, đổi định nghĩa ở đó cần Hiếu
  chốt riêng.
