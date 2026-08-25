---
title: "Scheduled Messages (Lịch Gửi Báo Cáo Tự Động)"
page_type: tab_guide
is_hidden: true
department: tech
tags: [tab, admin, scheduled]
created: 2026-06-28
updated: 2026-08-03
status: active
---

# Scheduled Messages (Lịch Gửi Báo Cáo Tự Động)

Hệ thống đặt lịch hẹn giờ gửi tóm tắt báo cáo doanh số, tiến độ chạy mục tiêu tự động đến các kênh hoặc nhóm thảo luận của bộ phận CS, Sales trên ứng dụng Lark.

> **Mục đích & vai trò**: tự động đẩy báo cáo định kỳ vào nhóm Lark (không cần ai mở web) → team luôn nắm số liệu mới. **Tại sao tách quyền XEM vs SỬA (S81)**: ai được cấp tab cũng cần thấy lịch đang chạy (minh bạch, tránh trùng lịch), nhưng chỉ admin/creator được sửa để tránh phá lịch của người khác.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/scheduled` (`web/src/app/(dashboard)/analytics/scheduled/page.tsx`)
- **API Scheduled**: `/api/admin/scheduled-messages` (`web/src/app/api/admin/scheduled-messages/route.ts`)
- **API Cron Job**: `/api/cron/scheduled-messages` (`web/src/app/api/cron/scheduled-messages/route.ts`)
- **Runner (chạy 1 báo cáo)**: `web/src/lib/scheduled-runner.ts` — dùng chung cho nút Test (POST) và cron.
- **Số liệu tính sẵn**: `web/src/lib/scheduled-report-data.ts` — SQL cố định đúng định nghĩa Dashboard.

---

## 2. Thiết Kế Hạ Tầng & Quy Trình Gửi Tự Động

### A. Thiết Kế Cơ Sở Dữ Liệu
Dữ liệu lịch hẹn giờ lưu tại bảng `lark_scheduled_messages` trong Supabase (Migration `v15`):
- `id`: Định danh khóa chính.
- `name`: Tên lịch (freeform). Loại báo cáo suy từ `cron_expression` qua `inferPeriod()` (KHÔNG lưu report_type riêng).
- `prompt`: Hướng dẫn cho AI (bố cục báo cáo mong muốn).
- `cron_expression`: Chu kỳ lặp — **5 trường theo GIỜ VIỆT NAM (ICT/UTC+7)**, vd `0 8 * * *` = 08:00 hằng ngày.
- `lark_webhook_url`: Webhook đích (để trống → gửi qua bot Lark mặc định `lark_notify_chat_id`).
- `lark_keyword`: Keyword prefix tuỳ chọn cho bot bảo mật.
- `is_active`: Trạng thái hoạt động của lịch gửi. `last_run_at`: slot đã chạy gần nhất (dedup).

### B. Quy Trình Vận Hành (Cron Pipeline)
1. **Đặt lịch**: Người quản trị thiết lập khung giờ, loại báo cáo và chọn nhóm chat đích trên giao diện cài đặt.
2. **Kích hoạt tự động (GitHub Actions)**:
   - Một tiến trình tự động chạy ngầm (GitHub Actions Cron) được kích hoạt định kỳ.
   - Tiến trình này gửi yêu cầu HTTP POST bảo mật đến đầu cuối `/api/cron/scheduled-messages`.
3. **Biên soạn báo cáo (kiến trúc precompute — S85)**:
   - Máy chủ API kiểm tra các lịch hẹn giờ đến hạn gửi.
   - `scheduled-report-data.ts` TÍNH SẴN toàn bộ số liệu bằng SQL cố định (đúng định nghĩa Dashboard, dùng chung
     helper `getDateFilter` / `fetchBODGroupMarginData`) — tách thị trường **VN / US / Tổng** theo `company_code`,
     kèm so sánh kỳ trước (MoM/WoW), pro-rata target, 3HK Contribution %; bản Daily thêm ma trận 3 ngày + top khách
     B2B + kênh B2C. Kỳ (daily/weekly/monthly) suy từ `inferPeriod()`.
   - **`inferPeriod()` — CRON-FIRST (fix s131)**: xét `cron_expression` TRƯỚC (đây mới là lịch thực chạy): `dom` là 1 số cố định → monthly; `dow` là 1 số cố định → weekly; còn lại (`* * *`, hoặc `dow` dạng range/list như `1-5` = ngày làm việc) → daily. Tên lịch CHỈ dùng fallback khi cron không chuẩn 5 trường. *Trước đây xét TÊN trước → lịch monthly đặt tên có chữ "ngày"/"tuần" bị tính nhầm kỳ số liệu.*
   - **Mục 【3】 Pro-rata & Target (fix s131)**: **DAILY/WEEKLY** (đang trong tháng) = MTD + dự phóng pro-rata cả tháng + `% tiến độ (MTD/Target)` + `% đạt target theo pro-rata (dự phóng/Target)`. **MONTHLY** (tháng đã đóng) = **số THỰC TẾ** cả tháng + `% đạt target (Thực tế/Target)`, KHÔNG pro-rata (đủ ngày → pro-rata vô nghĩa). Thiếu target → ghi "Chưa nhập target tháng này" (không bỏ mục).
   - **Mục 【4】 CM1**: thêm **Target CM1%** (`target_gpm2`) cạnh CM1% thực tế cho B2B & B2C (khi đã nhập ở tab Targets). Target lấy từ Supabase `analytics_target_planning` (channel = "B2B"/"B2C", month = `YYYY-MM`).
   - Khối số liệu này được nhồi vào prompt → **Gemini (BI Analyst) chỉ FORMAT, KHÔNG tự chạy SQL/tool** (1 vòng gọi).
     **Tại sao đổi**: trước đây để Gemini tự sinh SQL nhiều vòng → báo cáo Daily dễ timeout và số có thể lệch Dashboard.
   - **Directive (fix s131)**: nếu prompt nhắc tới pro-rata/dự phóng/target/kế hoạch/KPI/tiến độ → **BẮT BUỘC** render đủ mục 【3】 + Target CM1%(【4】) + Target 3HK%(【5】), cấm bỏ qua/rút gọn. Cấm gọi mọi tool (số đã precompute). *Trước đây directive để Gemini tự chọn bố cục → hay bỏ mục pro-rata/target dù report yêu cầu.*
4. **Gửi tin nhắn qua Lark Bot**:
   - Sử dụng helper kết nối Lark API `lib/lark.ts` để bắn thông điệp trực tiếp vào nhóm chat của công ty.

> **Timeout**: cron route cấu hình `maxDuration: 180` trong `web/vercel.json`; nút "Test ngay" (`[id]/route.ts`)
> set `export const maxDuration = 180` inline (route này không nằm trong vercel.json). Nâng từ 60→180 (s160,
> 2026-08-25) — xem mục D bên dưới.

### D. ⚠️ Sự cố "không tự chạy mấy ngày" — Daily report timeout im lặng (s160, 2026-08-25)

**Triệu chứng**: cron-job.org (scheduler ngoài, gọi endpoint mỗi phút — xem workflow GitHub Actions đã tắt từ
2026-08-10) báo lỗi timeout ~30s; group Lark hoàn toàn không nhận được báo cáo nào nhiều ngày liền.

**Nguyên nhân**: Daily report (nặng nhất) phải chạy TUẦN TỰ ~6 batch query `gohub_dw` (revenue theo thị
trường, 3HK, MTD, `fetchBODGroupMarginData` "nặng", QTD ~90 ngày, + 3 query ma trận 3-ngày/top-KH/kênh B2C)
rồi mới gọi Gemini format + gửi Lark — tổng thời gian vượt `maxDuration=60s` cũ trên Vercel → **Vercel kill
function giữa chừng**. Vì ATOMIC CLAIM (ghi `last_run_at = slot`) chạy **TRƯỚC** khi gọi `runScheduledMessage`,
slot đã bị đánh dấu "đã chạy" trong DB dù tin **chưa từng được gửi tới Lark** — lỗi này không throw exception
nên nhánh catch/alert cũ (chỉ bắt lỗi ở bước đọc danh sách đầu route) không phát hiện được → thất bại HOÀN
TOÀN ÂM THẦM, lặp lại mỗi ngày (slot mới lại bị đánh dấu xong rồi lại chết).

**Fix**:
- `maxDuration` 60→180 (cron route + nút Test ngay `[id]/route.ts`) — dự án đã dùng plan hỗ trợ ≥300s
  (Gấu Pro `creator-ai/chat` đã set 300s) nên nâng an toàn.
- Soft-timeout guard (`withSoftTimeout`, `Promise.race`) bailout chủ động ở 160s (còn buffer trước 180s cứng)
  → LUÔN đi qua nhánh catch (release claim + alert) thay vì bị platform kill câm lặng.
- Ngân sách tổng cả request (`REQUEST_BUDGET_MS=165s`) chia đều khi NHIỀU message đến hạn cùng lúc (vd
  catch-up sau downtime) — hết ngân sách thì bỏ qua message còn lại (không claim), để lần chạy kế tiếp xử lý
  tiếp, tránh message sau bị kill câm lặng vì message trước ăn hết giờ.
- **Alert Lark khi 1 message thất bại** (`alertCronFailure`) — trước chỉ alert khi lỗi đọc danh sách active
  messages ở đầu route, lỗi per-message (kể cả timeout) hoàn toàn im lặng. Nay mọi thất bại đều có Lark alert.

### C. Chống gửi TRÙNG & đúng slot (`scheduled-cron.ts` + `scheduled-runner.ts`)
Có **2 scheduler** cùng hit `/api/cron/scheduled-messages`: GitHub Actions `*/15 * * * *` + Vercel Cron `0 0 * * *` (backstop 1 lần/ngày).
- **Đến hạn**: `getMatchedSlotMs(cron, last_run_at, nowIct)` quét từng phút trong cửa sổ catch-up (24h kể từ `last_run_at`, hoặc 130' nếu chưa chạy lần nào) → trả **slot time muộn nhất** khớp cron. Catch-up 24h để phủ trường hợp scheduler bỏ trống khung sáng / Vercel chỉ chạy 1 lần/ngày.
- **`last_run_at` ghi theo SLOT time (không phải execution time)** → lần quét sau `floor = slot + 1'` nên KHÔNG bắt lại slot cũ.
- ⚠️ **Fix 2026-07-21 — báo cáo chạy 3-4 lần/ngày giờ ngẫu nhiên**: gốc là GitHub Actions hay fire dồn/muộn thành cụm; nhiều lần gọi ĐỒNG THỜI cùng đọc `last_run_at` cũ → đều thấy đến hạn → cùng gửi. Sửa bằng **ATOMIC CLAIM** trong cron route: trước khi gửi, `UPDATE last_run_at = slot WHERE id = ? AND last_run_at = <giá trị cũ>` (null-safe qua `.is`); Postgres khoá dòng nên **chỉ 1 lần gọi chiếm được slot**, các lần còn lại update 0 dòng → `skipped`, không gửi. Runner chạy với `noUpdateLastRun: true` (route đã tự ghi khi claim). Gửi **lỗi thật** → release (trả `last_run_at` về cũ) để tick sau thử lại. "Giờ ngẫu nhiên" = độ trễ vốn có của GitHub Actions free tier (gửi trong ~1h sau slot), nay chỉ còn **1 lần/slot**.
- Nút "Test ngay" gọi runner với `noUpdateLastRun: true` → KHÔNG đụng lịch tự động.

---

## 3. Phân Quyền
- **XEM (GET)**: mọi role được cấp tab `scheduled` (qua `role_permissions`/`allowed_analytics`, layout enforce) đều thấy **TẤT CẢ** lịch hiện có + cột **Người tạo** (`created_by`). API GET dùng `VIEW_ROLES` (toàn bộ role analytics), không lọc theo người tạo.
- **SỬA/XÓA/BẬT-TẮT/TEST (POST/PUT/DELETE)**: chỉ **Admin & Creator**. Người chỉ-xem không thấy nút thao tác (read-only).
- `created_by` lưu khi tạo (POST). Trang `/analytics/scheduled` (cột Người tạo) + admin ScheduledTab (badge người tạo) đều hiển thị.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Scheduled messages list | Supabase `lark_scheduled_messages` | Migration v15; id, name, prompt, cron_expression (giờ VN), lark_webhook_url, is_active, created_by |
| Kỳ báo cáo (daily/weekly/monthly) | `inferPeriod(cron_expression, name)` | Cron-first: dom số cố định→monthly · dow số cố định→weekly · còn lại→daily |
| Target revenue / CM1% / 3HK% | Supabase `analytics_target_planning` | channel="B2B"/"B2C", month=YYYY-MM; target_revenue, target_gpm2 (CM1%), target_3hk_contribution |
| Last run time | `lark_scheduled_messages.last_run_at` | Ghi theo slot time (không phải execution time); atomic claim UPDATE |
| Report data (số liệu) | `fact_fulfillment_revenue` (qua `scheduled-report-data.ts`) | SQL cố định: Revenue/GP/CM1/3HK per company_code (VN/US/Tổng), MoM/WoW, top B2B KH, top kênh B2C |
| Operation Cost | Supabase `analytics_channel_group_costs` | Dùng cho CM1 trong precomputed report |
| Message delivery | Lark Bot API (`lib/lark.ts`) | Push formatted message vào `chat_id` Lark group |
