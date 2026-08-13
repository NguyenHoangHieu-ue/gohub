---
title: "Inventory Management (Fulfillment)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, fulfillment, inventory, ops]
created: 2026-06-28
updated: 2026-08-13
status: active
---

# Inventory Management

Tab dành riêng cho OPS quản lý tồn kho SIM/eSIM. Rebuild hoàn toàn từ s147 (2026-08-13) — thay thế tab Fulfillment cũ (báo cáo doanh thu).

---

## 1. Đường dẫn & File

| | |
|---|---|
| Web | `/analytics/fulfillment` |
| Page | `web/src/app/(dashboard)/analytics/fulfillment/page.tsx` |
| API items | `GET/POST/PATCH/DELETE /api/analytics/inventory-items` |
| API snapshots | `GET/POST /api/analytics/inventory-snapshots` |
| API snapshot dates | `GET /api/analytics/inventory-snapshots/dates` |
| API vendor balances | `GET/PATCH /api/analytics/vendor-balances` |

---

## 2. Kiến trúc data

### Supabase tables (OPS nhập tay)

**`inventory_items`** — danh sách SKU OPS muốn theo dõi (OPS tự thêm/xóa):
- `sku_code` TEXT PRIMARY KEY
- `sim_type` TEXT — "SIM" | "ESIM"
- `vendor` TEXT
- `status` TEXT — Active / Inactive / Temporary / Deleted
- `retail_price` NUMERIC
- `safety_stock` INT — ngưỡng cảnh báo 15D
- `reorder_point` INT — ngưỡng nhập hàng 30D
- `note_permanent` TEXT — ghi chú cố định (hiện ở mọi snapshot)

**`inventory_snapshots`** — mỗi lần OPS nhập = 1 bản ghi theo ngày:
- PK = `(sku_code, snapshot_date)`
- Kho: `stock_total`, `stock_warehouse` (Main WH), `stock_pq_hcm`, `stock_dd_hn`, `stock_tsn_hcm`, `stock_kg` (Consignment)
- HSD: `expiry_date`, `expiry_qty`
- Kênh: `ops_qty`, `telco_qty`, `od_qty`, `ws_qty`, `b2c_qty`, `marketing_qty`
- `note`, `updated_by`, `updated_at`

**`vendor_balances`** — số dư tài khoản với từng vendor:
- PK = `vendor`
- `balance`, `currency`, `credit_limit`, `note`, `updated_by`

### gohub_dw (tự động)

- `fact_fulfillment_revenue` → tính **Sold 15D / Sold 30D** per SKU (fulfilled_quantity, fulfiled_date)
- Tính toán: `Avg/Day = sold_30d / 30`, `DOI = stock_total / avg_day`, `Est. Out of Stock = today + DOI ngày`

---

## 3. Tên kho (mapping)

| Code | Tên đầy đủ |
|---|---|
| `stock_warehouse` | Main Warehouse (Kho tổng) |
| `stock_pq_hcm` | Pho Quang (HCM) |
| `stock_dd_hn` | Dong Da (HN) |
| `stock_tsn_hcm` | Tan Son Nhat (HCM) |
| `stock_kg` | Consignment (Chi nhánh ký gửi) |

---

## 4. Alert logic

| Level | Điều kiện | Màu hiển thị |
|---|---|---|
| Critical | DOI < 7 ngày (hoặc stock = 0) | Row bg đỏ nhạt, badge đỏ |
| Warning | DOI 7–30 ngày | Row bg vàng nhạt, badge vàng |
| OK | DOI > 30 ngày | Badge xanh, không đổi màu row |
| None | Chưa bán (Avg/Day = 0) | Badge xám |
| Expiry alert | expiry_date ≤ 30 ngày từ hôm nay | Cột expiry_date màu cam |

Alert banner đầu trang: click để filter theo mức cảnh báo. Vendor balance: đỏ nhạt nếu balance < 20% credit_limit.

---

## 5. Luồng UX

### Thêm SKU
1. Click "Add SKU" → modal nhập SKU code, type, vendor, status, retail_price, safety_stock, reorder_point
2. Vendor/type tự lookup từ `dim_sku` gohub_dw nếu để trống
3. POST → `inventory_items`

### Cập nhật tồn kho (snapshot)
1. Click "Update Stock" → bảng vào edit mode, chọn ngày snapshot (mặc định hôm nay)
2. Nhập số từng kho, hạn SD, ghi chú
3. "Save Snapshot" → POST → `inventory_snapshots` upsert theo `(sku_code, snapshot_date)`
4. Lưu `updated_by` = tên người dùng

### Sửa cấu hình SKU
- Icon ⚙️ cuối row → modal EditItemModal → PATCH `inventory_items`
- Có thể sửa: retail_price, safety_stock, reorder_point, status, vendor, sim_type, note_permanent

### Xem lịch sử
- Click ▶ đầu row → hiện tất cả snapshot dates + stock_total
- Click vào 1 ngày → load toàn bảng theo ngày đó

### Vendor Balance
- Section riêng (có thể collapse) phía trên bảng chính
- Tự hiện vendor nào có trong `inventory_items`
- "Edit Balances" → nhập balance, currency, credit_limit per vendor → PATCH `vendor_balances`

---

## 6. Phân quyền

GET/POST/PATCH/DELETE: `admin`, `creator`, `manager`, `staff`

---

## 7. Gotchas

- SKU code trong `inventory_items` phải khớp chính xác với `fact_fulfillment_revenue.sku` (sau TRIM) để sold 15D/30D tính đúng
- `dim_sku.sku` trong gohub_dw = mã hiện tại (đã map sẵn) — không cần map thêm
- Snapshot upsert theo `(sku_code, snapshot_date)` — nhập lại cùng ngày = ghi đè
- `sold_15d / sold_30d` tính từ hôm nay ngược về 15/30 ngày (không theo snapshot_date)
