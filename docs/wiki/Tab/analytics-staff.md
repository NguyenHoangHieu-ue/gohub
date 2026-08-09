---
title: "Staff Performance (Hiệu Suất Nhân Viên)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, staff]
created: 2026-06-28
updated: 2026-08-09
status: active
---

# Staff Performance (Hiệu Suất Nhân Viên)

Báo cáo doanh thu / 3HK revenue / số KH / CM1 theo từng nhân viên. Có bảng drill-down per-customer và chart so sánh.

---

## 1. Đường dẫn & File

| | |
|---|---|
| Trang | `/analytics/staff` — `web/src/app/(dashboard)/analytics/staff/page.tsx` |
| API tổng | `GET /api/analytics/staff-report` |
| API KH theo staff | `GET /api/analytics/staff-report/customers` |
| Nguồn | `fact_fulfillment_revenue` + `dim_staff` + `dim_customer` + Supabase group costs |

---

## 2. Tính năng (s124, rebuild hoàn toàn)

- **KPI cards**: tổng Revenue / 3HK Revenue / Customer Count / CM1 của toàn bộ team
- **Bar chart so sánh**: chọn chế độ "Staff" (doanh thu từng nhân viên) hoặc "Customer" (KH hàng đầu)
- **Leaderboard**: bảng xếp hạng, click mở rộng từng staff → xem danh sách KH + revenue + CM1 của KH đó
- **Sparkline**: đường trend doanh thu theo tháng của mỗi nhân viên
- **Total row**: dòng tổng cuối bảng
- **Filter**: date range, include/exclude phí ship + đơn nội bộ

---

## 3. API `/api/analytics/staff-report`

| Param | Mô tả |
|---|---|
| `startDate`, `endDate` | Khoảng thời gian |
| `dateColumn` | `fulfiled_date` (default) hoặc `created_date` |
| `includeShip` | `1` = gồm phí ship (SHIPPINGFEE0) |
| `includeInternalOps` | `1` = gồm đơn Internal-Transaction |
| `includeOpsCustomers` | `1` = gồm B2B Ops / B2C Customer |

**Response mỗi staff:**
```json
{
  "staff_code": "...",
  "staff_name": "...",
  "total_revenue": 0,
  "total_3hk_revenue": 0,
  "customer_count": 0,
  "cm1": 0,
  "monthly_trend": [{ "month": "2026-07", "revenue": 0 }]
}
```

---

## 4. API `/api/analytics/staff-report/customers`

Trả danh sách KH của 1 staff, kèm revenue + 3HK revenue + CH.Cost + CM1 per customer.

⚠️ **Bug đã phát hiện (s138, chưa fix)**: FE không pass `includeShip` / `includeInternalOps` vào endpoint này → KH breakdown không khớp staff summary khi bật filter. Ảnh hưởng: nhỏ (filter mặc định đều Off).

---

## 5. Mapping staff

- `dim_staff.sales_pic_code` (từ s138) — nhân viên phụ trách KH, JOIN để gán KH cho đúng nhân viên
- Trước (s138): chỉ dùng `f.staff_code` → nhiều KH bị gán sai (không phải KH của staff đó)
- Fallback: `COALESCE(dim_customer.sales_pic_code, f.staff_code)`

---

## 6. CM1 tính như thế nào

```
CM1 staff = SUM(gross_profit_vnd) của staff đó
           - phần phân bổ Group Cost B2B/B2C theo revenue-share
```

⚠️ **Thiết kế hiện tại**: Σ(customer.cm1) > staff.cm1 vì customer-level không trừ group cost share — by design, group cost chỉ trừ ở cấp summary.

---

## 7. Gotchas

**3HK vendor (STAFF-1, s126):**
- Định nghĩa chuẩn: `REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'` (7.930 SKU)
- Trước: `LIKE '3HK%'` → bao gồm 61 SKU vendor "3HK" không phải datapool
- Tất cả 4 query (staff-report summary + monthly, customers summary + monthly) đã fix

**Loại nhân viên hệ thống:**
- `staff_name != 'Auto ESIM'`
- SKU nhiễu: `sku != 'SHIPPINGFEE0'` (khi includeShip = Off)

**Staff không map:**
- TRIM(staff_code) → "Unknown" nếu không có dim_staff entry

---

## 8. Filter chuẩn (từ s132)

| Filter | Default | Ý nghĩa |
|---|---|---|
| `includeShip` | Off | Bao gồm phí ship |
| `includeInternalOps` | Off | Bao gồm đơn Internal-Transaction (GP âm) |
| `includeOpsCustomers` | Off | Bao gồm KH hệ thống (B2B Ops, B2C Customer US/VN) |

Bật CẢ 3 → khớp số raw gohub_dw (dùng để validate).
