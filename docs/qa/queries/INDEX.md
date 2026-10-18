# Kiểm kê dữ liệu: tổng quan

Sinh bởi `web/scripts/qa/queries.mjs` ngày 2026-10-18.

## Theo tab

| Tab | Route quét | Không tìm thấy | Route có ghi | Route có cache | Cache không nocache | Ghi chú tự phát hiện |
|---|---|---|---|---|---|---|
| [3HK Data Usage](3hk-usage.md) | 3 | 0 | 2 | 1 | 1 | 0 |
| [All-Time Report](all-time.md) | 2 | 0 | 0 | 1 | 0 | 1 |
| [B2B — VN Ecom theo thời gian](b2b-ecom.md) | 1 | 0 | 0 | 1 | 0 | 0 |
| [B2B](b2b.md) | 9 | 0 | 3 | 6 | 1 | 5 |
| [B2C](b2c.md) | 12 | 0 | 3 | 9 | 4 | 7 |
| [BOD Report](bod.md) | 7 | 0 | 2 | 7 | 2 | 2 |
| [Product Catalogue](catalogue.md) | 2 | 0 | 0 | 2 | 0 | 0 |
| [Channels](channels.md) | 11 | 0 | 5 | 5 | 3 | 9 |
| [CS Troubleshoot](cs-troubleshoot.md) | 2 | 0 | 1 | 0 | 0 | 1 |
| [Customers](customers.md) | 3 | 0 | 2 | 2 | 2 | 2 |
| [Dashboard](dashboard.md) | 12 | 0 | 1 | 12 | 9 | 11 |
| [Inventory](inventory.md) | 4 | 0 | 3 | 0 | 0 | 0 |
| [Orders](orders.md) | 5 | 0 | 1 | 1 | 1 | 3 |
| [Products (BI)](products.md) | 7 | 0 | 2 | 3 | 2 | 4 |
| [Quarter Report](quarterly.md) | 15 | 0 | 8 | 4 | 0 | 1 |
| [Scheduled Messages](scheduled.md) | 2 | 0 | 1 | 0 | 0 | 0 |
| [Staff](staff.md) | 5 | 0 | 1 | 1 | 0 | 1 |
| [Manage Costs](targets.md) | 9 | 0 | 7 | 1 | 1 | 8 |
| [Vendors](vendors.md) | 2 | 0 | 1 | 2 | 1 | 0 |
| [Website Analytics](website.md) | 3 | 0 | 0 | 0 | 0 | 0 |

## Route dùng chung giữa nhiều tab

| Route | Số tab | Tab |
|---|---|---|
| `/api/analytics/query` | 6 | 3hk-usage, b2c, bod, channels, products, vendors |
| `/api/channels` | 5 | all-time, channels, orders, products, staff |
| `/api/analytics/b2b/strategic-performance` | 4 | b2b, bod, dashboard, products |
| `/api/config/partner-tiers` | 4 | b2b, bod, customers, dashboard |
| `/api/analytics/quarterly-settings` | 3 | b2b, orders, quarterly |
| `/api/channel-costs` | 3 | b2c, channels, targets |
| `/api/channel-group-costs` | 3 | b2c, channels, targets |
| `/api/user/me` | 3 | quarterly, scheduled, targets |
| `/api/config/ga4` | 2 | b2c, website |
| `/api/config/country-codes` | 2 | channels, products |
| `/api/channel-cost-settings` | 2 | channels, targets |
| `/api/config/subchannels` | 2 | channels, targets |
| `/api/channel-group-costs/` | 2 | channels, targets |
| `/api/analytics/quarterly-report` | 2 | dashboard, quarterly |

## Route chỉ do 1 tab dùng: 73 · tổng route phân biệt: 87
