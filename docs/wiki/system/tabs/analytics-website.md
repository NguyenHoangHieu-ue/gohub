---
title: "Website Analytics (Phân Tích Website GA4 & GSC)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, website, ga4, gsc]
created: 2026-06-28
updated: 2026-08-20
status: active
---

# Website Analytics (Phân Tích Website GA4 & GSC)

Số liệu từ **Google Analytics 4** (sessions, users, conversion, revenue) + **Search Console** (clicks, position). KHÔNG dùng gohub_dw.

**s156 (2026-08-20)**: thêm platform toggle **Web / App**. Khi App: filter GA4 bằng `platform=ios|android` thay vì `hostName`; ẩn GSC section (không áp dụng cho app). Cần GA4 property là cross-platform (Web+App) — nếu chỉ có web property thì App tab trả 0.

**s194 (2026-09-06)**: App KHÔNG chung property với web (property riêng `465150028`, Firebase) — trước đây
toggle App chỉ đổi FILTER (`platform=ios|android`) trên site đang chọn ở dropdown, không tự đổi SITE, nên
nếu người dùng để dropdown ở "gohub.com"/"gohub.vn" rồi bấm App → query nhầm property web (0 kết quả) trừ
khi tự tay đổi dropdown sang "GoHub App" nữa. Thêm field `kind?: "web"|"app"` vào `GA4Site`/config — toggle
App giờ TỰ ĐỘNG chọn đúng site có `kind:"app"` (dropdown cũng chỉ hiện site cùng kind với tab đang chọn).
Field cũ thiếu `kind` mặc định coi là `"web"` (backward-compat, không cần sửa 2 entry gohub.com/gohub.vn có
sẵn). `api/analytics/b2c/metric` (Traffic/Users by platform) cũng đổi tương tự: trước gọi `platform:"app"`
trên site web đầu tiên (`sites[0]`), nay tìm đúng site `kind==="app"`, không có thì bỏ qua phần app (graceful,
không throw).

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/website` — `web/src/app/(dashboard)/analytics/website/page.tsx` |
| API | `/api/analytics/website` (GA4), `/api/analytics/gsc` (Search Console), `/api/config/ga4` |
| Lib | `lib/ga4.ts` (Google Analytics Data API) |

## 2. Nguồn dữ liệu
- **GA4**: config lưu ở Supabase `app_settings.ga4_configs` (JSON array). Đọc metric `activeUsers`, `sessions`, `purchases`, `purchaseRevenue` theo `siteId` + `platform`.
- **GSC**: qua `googleapis` (service account). Chỉ áp cho platform=web.
- **Service account**: `ais-gemini-key-88b236e5f62d4cf@612144486106.iam.gserviceaccount.com` (GCP project 612144486106).

## 3. Platform toggle — Web vs App (s156)
- **Web** (mặc định): filter GA4 bằng `hostName` (lấy từ `siteUrl` trong config). GSC hiển thị bình thường.
- **App**: filter GA4 bằng `platform IN (ios, android)`. GSC ẩn (không áp dụng cho app).
- Cơ chế: `lib/ga4.ts` → `buildDimensionFilter(cfg, eventNameFilter, platform)`. API `?platform=app` → `runGA4Report({..., platform: "app"})`.

## 4. Cấu hình GA4 App (Firebase Analytics)
GoHub App dùng **Firebase Analytics** property ID `465150028`. Đã cấp quyền Viewer cho service account
(2026-09-06, Hiếu xác nhận) — còn thiếu bước thêm entry config.

**Để connect App data — Supabase SQL Editor**, append entry mới vào mảng, tự lấy lại `credentials` từ entry
web đầu tiên (không cần copy tay chuỗi JSON service account):
```sql
UPDATE app_settings
SET value = ((value::jsonb) || jsonb_build_array(jsonb_build_object(
  'id', 'gohub-app', 'name', 'GoHub App', 'propertyId', '465150028',
  'siteUrl', '', 'currency', 'VND', 'kind', 'app',
  'credentials', (value::jsonb)->0->'credentials'
)))::text
WHERE key = 'ga4_configs';
```
`kind: "app"` **bắt buộc** từ s194 — thiếu field này thì toggle App không tự chọn đúng site (xem mục
s194 ở trên). Chạy đúng 1 lần (chạy lại sẽ thêm trùng entry) — kiểm tra trước bằng
`SELECT value::jsonb FROM app_settings WHERE key='ga4_configs';` nếu không chắc đã thêm chưa.

## 5. Liên quan
- B2C Metric subtab cũng dùng GA4 `yearMonth` dimension để lấy Traffic/Users theo tháng — xem [[analytics-b2c]].

## 6. Gotchas
- **s194+10 (2026-09-06)**: UI redesign — 5 KPI card viết tay đổi sang `StatTile` (dashboard-kit), 3 chart
  đổi sang `CHART_PALETTE`/`CHART_GRID_COLOR`/`chartTooltipStyle` dùng chung, `blue-*`→`brand-*` toàn trang.
  Không đổi logic/data.
- Cần credentials Google hợp lệ (service account JSON) — thiếu thì section rỗng graceful.
- App platform chỉ có data nếu Firebase Analytics đang collect và property được cấp quyền cho service account.
- `siteUrl: ""` trong config → `buildDimensionFilter` bỏ qua `hostName` filter → đúng cho app property.
- GSC không áp dụng cho app — ẩn tự động khi toggle App.

---

## Data Sources

| Column / Metric | Source | Ghi chú |
|---|---|---|
| Active Users | GA4 API `activeUsers` | Web: filter hostName. App: filter platform=ios\|android |
| Sessions | GA4 API `sessions` | — |
| Purchases | GA4 API `ecommercePurchases` | — |
| Purchase Revenue | GA4 API `purchaseRevenue` | — |
| GA4 Config | Supabase `app_settings.ga4_configs` | JSON array, đọc qua `/api/config/ga4` |
| Search Clicks / Impressions | Google Search Console API | Chỉ Web platform |
| Avg. Position | Google Search Console API | Top queries + pages |
| App Traffic/Users | Firebase Analytics (GA4 property 465150028) | platform=ios\|android filter |
