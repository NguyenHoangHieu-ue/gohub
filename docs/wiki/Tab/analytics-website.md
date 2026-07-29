---
title: "Website Analytics (Phân Tích Website GA4 & GSC)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, website, ga4, gsc]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# Website Analytics (Phân Tích Website GA4 & GSC)

Số liệu website từ **Google Analytics 4** (sessions, users, conversion, revenue) + **Search Console** (impressions, clicks, position). KHÔNG dùng gohub_dw.

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/website` — `web/src/app/(dashboard)/analytics/website/page.tsx` |
| API | `/api/analytics/website` (GA4), `/api/analytics/gsc` (Search Console), `/api/config/ga4` |
| Lib | `lib/ga4.ts` (Google Analytics Data API) |

## 2. Nguồn dữ liệu
- **GA4**: config **2 property** lưu ở `app_config['ga4_configs']` (Turso, đã copy sang Supabase `app_settings`). Đọc metric `activeUsers`, `sessions`, `purchases`, `purchaseRevenue`, `conversionRate` theo `siteId`.
- **GSC**: qua `googleapis` (service account).
- Có tham số `localPreview` cho route preview B2C.

## 3. Liên quan
- B2C Section 4 (Conversion Rate charts) đọc chung nguồn GA4 này — xem [[analytics-b2c]].

## 4. Gotchas
- Cần credentials Google hợp lệ (service account / OAuth) — thiếu thì section rỗng graceful.
- Đọc theo từng `siteId` (2 property VN/Global).

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Active Users | Google Analytics 4 API | Metric `activeUsers` per `siteId` (2 property VN/Global) |
| Sessions | Google Analytics 4 API | Metric `sessions` |
| Purchases / CR | Google Analytics 4 API | Metrics `purchases`, `conversionRate` |
| Purchase Revenue | Google Analytics 4 API | Metric `purchaseRevenue` |
| GA4 Config | Supabase `app_settings.ga4_configs` | 2 property config; đọc qua `/api/config/ga4` |
| Impressions / Clicks | Google Search Console API | `googleapis` service account; query theo `siteUrl` |
| Average Position | Google Search Console API | Top queries + pages ranking |
