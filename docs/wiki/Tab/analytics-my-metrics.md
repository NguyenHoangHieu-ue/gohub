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
| **Auto — Lark bot đề xuất SLA/Vendor Speed** | Cron `GET /api/cron/my-metrics-lark-scan` | Quét 1 group Lark, Gemini phân loại request/completion → ghi `okr_lark_events` (status=pending_review) |
| Review queue Lark | `GET /api/analytics/my-metrics/lark-events` · `POST /api/analytics/my-metrics/lark-events/[id]/review` | Hiếu duyệt Xác nhận/Từ chối/Sửa giờ — chỉ case `confirmed` mới gộp vào TB evidence |
| Config bot Lark | `GET/PUT /api/analytics/my-metrics/lark-config` | admin/creator only — `app_settings` key `my_metrics_lark_scan_config` (`{enabled, chat_id, days_back}`) |
| Target theo quý | `GET/PATCH /api/analytics/my-metrics/manual` | `app_settings` key `okr.<Q>-<year>` |
| Conversation drill-down | `GET /api/analytics/my-metrics/conversations` | Xem lại từng cuộc hội thoại được tính vào task count |
| Migration | `web/db/migrations/v44_okr_tracking.sql` + `v45_okr_lark_events.sql` | v44: schema gốc. v45: bảng `okr_lark_events` (review queue) + `okr_sku_tags.effective_date` nullable |
| Shared helpers | `web/src/lib/okr-helpers.ts` | `quarterRange`, `parseQuarterLabel`, `prevQuarterLabel`, `currentQuarterLabel`, `isQuarterLocked`, `OKR_GM_BASELINE=36.7`, `OKR_HK3_BASELINE=67.5` |
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

## § UI/màu (2026-08-27, sau feedback "màu chưa ổn")

Dùng skill thiết kế [Hallmark](https://github.com/Nutlope/hallmark) (cài `~/.claude/skills/hallmark/`) để audit +
sửa — bug thật: trước có **5 màu badge cạnh tranh nhau** (blue=Auto, purple=Manual, amber=pending,
emerald=confirmed, slate=context) không mang ý nghĩa trạng thái thật, chỉ là color-code tuỳ hứng — đúng kiểu
"AI slop" (xem `references/color.md`: *"One accent. Maximum two. Everything else is neutral."*).

**Hệ màu mới:**
- **1 accent duy nhất** = navy thương hiệu GoHub `#003B95` (đã dùng sẵn toàn app — giữ nguyên, không bịa màu
  mới) — chỉ dùng cho: nút hành động chính, link/hover, focus ring, badge "Key" (SKU trọng điểm).
- **Neutral (slate)** cho MỌI tag chỉ mang tính phân loại/nguồn (Auto, Manual, Context, Lark/Web, Khoá) — không
  còn tô màu theo loại, phân biệt bằng chữ.
- **2 màu semantic thật** (chỉ dùng khi đúng nghĩa trạng thái): emerald = verified/đạt target/SKU mới; amber =
  chờ duyệt/thiếu ảnh/dưới target. Không dùng amber cho khối thông tin không phải cảnh báo (trước đây banner
  "Baseline" tô nền amber dù không phải warning — đã đổi neutral).
- `SourceBox`: bỏ nested box-trong-box (card-in-card), chuyển sang hairline rule bên trái.
- Thanh "Weighted OKR Score": 5 ô trọng số trước đều nhau (`grid-cols-5`) — đổi sang `flex` tỉ lệ theo trọng số
  (`flexGrow: w`) để Bé Gấu (30%) rộng hơn 4 ô còn lại (17.5% mỗi ô), phá vỡ đơn điệu có chủ đích.
- Thêm `tabular-nums` cho mọi số headline lớn (căn cột đẹp khi số đổi).

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
- **Lark bot chưa hoạt động cho tới khi Hiếu nhập `chat_id`** qua modal "⚙️ Lark Bot" — cron tự skip nếu
  `enabled=false` hoặc thiếu `chat_id`, không lỗi, chỉ trả `{skipped: "..."}`.
- **Chất lượng AI phân loại chưa verify với dữ liệu thật** — đây chính là lý do có hàng chờ duyệt thay vì tự
  động tính luôn; Hiếu nên soát kỹ đợt case đầu tiên trước khi tin tưởng số.
- **Bé Gấu task ≠ "thành công" theo nghĩa nghiêm ngặt** — chỉ lọc được độ dài response (không có structured
  success flag từ `be-gau.ts`). Nếu muốn phân loại chuẩn hơn cần thêm cột đánh giá thủ công hoặc structured
  output ở `be-gau.ts` (chưa làm, out of scope).
- Máy dev không có `ANALYTICS_DB_*` → chưa chạy được SQL sku-scan live để verify số thật; cũng không test được
  cron/Gemini call với dữ liệu Lark thật. Hiếu cần: (1) chạy migration v45, (2) nhập `chat_id` thật, (3) theo
  dõi vài ngày đầu xem bot phân loại đúng không trước khi tin số báo cáo.
- **%3HK + Other Datapool Vendor (2026-08-27)**: đúng tên KPI offer letter, gộp CẢ 3HK Datapool VÀ **BC Datapool**
  (`dim_sku.vendor = 'BC Datapool'`, Hiếu xác nhận qua SQL Explorer) — filter
  `REPLACE(UPPER(TRIM(vendor)),' ','') IN ('3HKDATAPOOL','BCDATAPOOL')`. **Chỉ áp trong My Metrics** — KPI
  "3HK Contribution %" ở BOD/Dashboard/Quarterly/Channels là chỉ số RIÊNG (chỉ 3HK, không có BC), cố ý KHÔNG
  đổi theo vì đó là số đã báo cáo lâu dài cho leadership, đổi định nghĩa ở đó cần Hiếu chốt riêng.
