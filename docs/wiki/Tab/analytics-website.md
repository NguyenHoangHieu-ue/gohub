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
GoHub App dùng **Firebase Analytics** property ID `465150028`.

**Để connect App data:**
1. Firebase Console → Project Settings → Integrations → Google Analytics → **Manage** → Property Access Management → thêm service account email, role **Viewer**
2. Supabase SQL Editor — thêm entry vào `app_settings.ga4_configs`:
```json
{
  "id": "gohub-app",
  "name": "GoHub App",
  "propertyId": "465150028",
  "siteUrl": "",
  "currency": "VND",
  "credentials": "... copy từ entry web đã có ..."
}
```
3. Sau khi thêm, toggle App trong Web Analytics tab sẽ có data.

## 5. Liên quan
- B2C Metric subtab cũng dùng GA4 `yearMonth` dimension để lấy Traffic/Users theo tháng — xem [[analytics-b2c]].

## 6. Gotchas
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
