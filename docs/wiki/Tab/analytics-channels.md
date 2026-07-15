---
title: "Channel Performance (Hiệu Suất Kênh Bán Hàng)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, channels]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# Channel Performance (Hiệu Suất Kênh Bán Hàng)

Doanh thu / margin / đơn / units theo **từng kênh** (`dim_order_source.channel_name`), tách nhóm B2B/B2C + đánh dấu Strategic, kèm chi phí kênh & so kỳ trước. Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/channels` — `web/src/app/(dashboard)/analytics/channels/page.tsx` |
| API | `/api/analytics/channels/{performance, kpis, trend}`, `/api/analytics/channels-with-platform-fee` |
| Chi phí kênh | Supabase `analytics_channel_costs` (ads/platform_fee/sponsor_products/media) + `analytics_channel_group_costs` |

## 2. Query chính (`channels/performance`)
```sql
WITH cur AS (
  SELECT TRIM(s.channel_name) AS channel, UPPER(s.group_name) AS group_name,
         CASE WHEN s.channel_name ILIKE ANY(ARRAY[<strategic list>]) THEN true ELSE false END AS is_strategic,
         SUM(f.<revenueCol>) AS revenue, SUM(f.<marginCol>) AS margin,
         SUM(f.<quantityCol>) AS units, COUNT(DISTINCT f.order_code) AS orders
  FROM <mainTable> f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
  WHERE <dateFilter> <groupFilter>
  GROUP BY 1,2, is_strategic
),
prv AS ( ... revenue kỳ trước theo channel ... )
SELECT c.*, COALESCE(p.revenue,0) AS prev_revenue
FROM cur c LEFT JOIN prv p ON c.channel = p.channel
ORDER BY c.group_name, c.revenue DESC;
```

## 3. Chỉ số
- **revenue, margin (GP), units, orders** per kênh; **prev_revenue** để tính tăng trưởng.
- **is_strategic**: kênh có trong danh sách Strategic partners (Supabase app_settings) → so bằng `ILIKE ANY`.
- **Chi phí kênh (opCost)** gộp từ `analytics_channel_costs` → tính CM1 per kênh.

## 4. Gotchas
- `groupFilter` = `AND UPPER(s.group_name) = 'B2B'|'B2C'` khi lọc nhóm.
- Created mode → margin = 0.
- Khi gộp chi phí kênh, **lọc đúng nhóm kênh** để chi phí B2B không lẫn vào báo cáo B2C (bài học B2C Revenue & GP Trend — xem [[analytics-b2c]]).
