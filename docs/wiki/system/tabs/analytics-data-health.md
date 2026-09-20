---
title: "Giám sát Dữ liệu (Data Health)"
page_type: tab_guide
is_hidden: true
department: tech
tags: [tab, data-health, observability, creator-only]
created: 2026-09-16
updated: 2026-09-20
status: active
---

# Giám sát Dữ liệu (Data Health)

> **s202 (2026-09-20)** — Hiếu: gộp 3 mục (Độ tươi / Bất thường / Đối chiếu) thành **1 trang liền** (xếp dọc, có
> thanh anchor + "Làm mới tất cả") và **gộp cả tab này vào "Dữ liệu & API"** (`/analytics/creator/devtools`, tab con
> **Giám sát**, mặc định cho creator). `/analytics/creator/data-health` chỉ còn là redirect. Code: `devtools/data-health-view.tsx`
> (`DataHealthView`) + `devtools/data-health-charts.tsx`. Tab con "Giám sát" **chỉ creator thấy**; admin (được bật Tab Visibility)
> vẫn dùng các tab API/DB/SQL nhưng không thấy Giám sát, và mọi API `data-health/*` vẫn `requireCreator()`. Các mục 1–4 dưới đây
> mô tả logic từng khối vẫn đúng; chỉ đổi phần "3 tab con" → "3 khối trên cùng 1 trang" và đường dẫn file.

> **s199 (2026-09-16)** — Hiếu: nhìn report/số thô khó tự phát hiện sai, mỗi lần nghi ngờ phải nhờ Claude
> vào DB check — mất thời gian. Cần 1 nơi quan sát/kiểm tra dữ liệu bằng mắt, không phải bằng câu SQL.
> **Chỉ Creator xem được** (quyết định Hiếu qua AskUserQuestion).

---

## 1. Đường dẫn & File

| | |
|---|---|
| Web | `/analytics/creator/data-health` — `web/src/app/(dashboard)/analytics/creator/data-health/page.tsx` |
| Chart | `data-health-charts.tsx` (cùng thư mục, `RevenueSparkline`, code-split `next/dynamic`) |
| API độ tươi | `GET /api/analytics/data-health/freshness` |
| API bất thường | `GET /api/analytics/data-health/anomalies?days=30` |
| API đối chiếu | `GET /api/analytics/data-health/cross-check` |
| Config nguồn giám sát | `web/src/lib/data-health-config.ts` (`DATA_HEALTH_ENTRIES`, `classifyFreshness`) |
| Logic bất thường | `web/src/lib/data-health-anomaly.ts` (`median`, `detectAnomalies`) — có unit test |
| Nav | `CREATOR_GROUP` trong `lib/nav.ts` **VÀ** `components/sidebar.tsx` (2 nơi, phải sync tay) |
| Phân quyền | Gate cứng `role === "creator"` (client + mọi API `requireCreator()` local, dùng `getDbRole()`) — KHÔNG qua `role_permissions`/`allowed_analytics`, KHÔNG cho admin bypass (khác Dev Tools) |

## 2. 3 khối

### 2a. Độ tươi dữ liệu (Freshness)
Mở rộng ý tưởng có sẵn ở `api/analytics/db-status/route.ts` (trước ẩn trong nút "Kiểm tra database" ở
Settings, chỉ 12 bảng) — lưới card cho từng nguồn trong `DATA_HEALTH_ENTRIES`, mỗi entry khai
`dateCol`/`loadCol?`/ngưỡng vàng-đỏ (giờ) riêng. API tính `delayHours = now - MAX(dateCol hoặc loadCol)`,
so ngưỡng → badge 🟢🟡🔴. Cache 10 phút (`cachedQuery`, key `data-health:freshness:v1`).

Danh sách nguồn ban đầu: `fact_fulfillment_revenue`, `fact_sales_revenue`, `fact_data_usage` +
`data_usage_log` (3HK, cố ý ngưỡng cao vì biết pipeline chậm — xem gotcha s199 dưới), `fact_inventory`,
Supabase `sku_catalog`. Thêm nguồn mới → sửa `DATA_HEALTH_ENTRIES`, không cần route/UI mới.

### 2b. Bất thường số liệu (Anomaly Watch)
1 query GROUP BY ngày × nhóm (B2B/B2C/Tổng) trên `fact_fulfillment_revenue` (30 ngày mặc định, filter
chuẩn ship/internal-ops OFF), rồi `detectAnomalies()` (rule-based: baseline = median 7 ngày liền trước,
lệch ≥35% → đánh dấu). Sparkline mỗi nhóm, chấm đỏ ở ngày bất thường. Cache 15 phút.

### 2c. Đối chiếu chéo (Cross-Check)
**Thiết kế khác bản nháp ban đầu** ("so BOD vs Quarterly vs Dashboard trực tiếp" — bỏ vì 3 tab đó có
nhiều khác biệt THEO THIẾT KẾ đã biết, dễ báo đỏ oan). Thay bằng: so số **LIVE** (gọi lại
`computeMonthlyKpis()` — export thêm từ `api/cron/refresh-monthly-kpis/route.ts`, KHÔNG viết lại công
thức) vs **SNAPSHOT** đang lưu Supabase `analytics_monthly_kpis` (bảng Bé Gấu/chatbot đọc để trả lời câu
hỏi CM1/doanh thu theo tháng). Lệch >1% = `warn`, >5% = `bad` → nghĩa là cron `refresh-monthly-kpis`
chưa chạy/lỗi, snapshot cũ — đúng lớp bug đã xảy ra nhiều lần (s198+10/+11: cron chết âm thầm nhiều
ngày/tuần không ai biết). So cho tháng hiện tại + tháng trước, company=ALL, 4 field (Doanh thu/CM1/CM1%/
3HK%).

## 3. Gotchas

- **fact_data_usage/data_usage_log ngưỡng cảnh báo CỐ Ý cao** (168h/240h) — pipeline 3HK usage vốn sync
  trễ theo thiết kế (xem `analytics-3hk-usage.md` mục 4.3) VÀ hiện đang đứng yên thật từ 2026-07-20 (xem
  gotcha s199 file đó) — card này sẽ hiện 🔴 liên tục cho tới khi pipeline ngoài repo được khắc phục,
  không phải bug trang Data Health.
- **`computeMonthlyKpis` import từ 1 file `route.ts` khác** (`api/cross-check` import từ
  `api/cron/refresh-monthly-kpis/route.ts`) — hợp lệ về mặt Next.js (chỉ `GET`/`POST`... được framework
  coi là route handler đặc biệt, export khác chỉ là named export bình thường) nhưng hơi khác thường về
  style — nếu sau này sửa `computeMonthlyKpis`, nhớ Cross-Check cũng dùng chung, tự động ăn theo thay đổi
  (không lệch công thức, nhưng cũng có nghĩa sửa 1 nơi ảnh hưởng 2 chỗ).
- **Freshness loop qua danh sách bảng CỐ ĐỊNH nhỏ (~6 bảng)** — không phải vòng lặp theo hàng dữ liệu,
  không phạm rule N+1 (giống cách `db-status` cũ đã làm từ trước).
- Anomaly/Cross-Check KHÔNG chủ động báo (Lark DM) khi phát hiện bất thường — chỉ hiển thị passive khi mở
  tab. Có thể thêm cron cảnh báo chủ động sau nếu Hiếu muốn.
- Chỉ 4 field ở Cross-Check (Doanh thu/CM1/CM1%/3HK%), company=ALL — chưa tách VN/US, chưa có B2C riêng.

## 4. Phân quyền
Chỉ `creator`. Không thêm vào `analytics-roles.ts`/`role_permissions` — admin/BOD/manager KHÔNG thấy tab
này kể cả được cấp quyền riêng qua Settings (khác cơ chế thường của mọi tab analytics khác).
