---
title: "Inventory (Kế Hoạch Nhập Hàng Theo Tuần)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, inventory, restock, po, ops]
created: 2026-06-28
updated: 2026-08-25
status: active
---

# Inventory (Kế Hoạch Nhập Hàng Theo Tuần)

> **s160 (2026-08-25) — thay hoàn toàn nội dung cũ.** Tab từng là "Inventory Management" (theo dõi tồn kho theo kho vật lý PQ/DD/TSN + vendor balance, xây từ s147) — đã bỏ hoàn toàn theo yêu cầu Hiếu. Nay là **kế hoạch nhập hàng theo tuần từng SKU (VN/US)** + **PO tracker**, dựa theo file Ops dùng ngoài Intel `Plan nhập hàng theo tháng.xlsx`. Route/permission key giữ nguyên `/analytics/fulfillment` (id `"fulfillment"`).

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/fulfillment` — `web/src/app/(dashboard)/analytics/fulfillment/page.tsx` |
| API watchlist | `GET/POST/PATCH/DELETE /api/analytics/inventory-plan/skus` |
| API lưới tuần | `GET/POST /api/analytics/inventory-plan/weekly` |
| API PO | `GET/POST/PATCH/DELETE /api/analytics/inventory-po` |
| Logic gợi ý | `web/src/lib/inventory-plan.ts` |
| Import 1 lần | `web/scripts/import_inventory_plan.mjs` |

## 2. Data model (Supabase, migration `v42_inventory_plan.sql`)
- **`inventory_plan_skus`** — watchlist SKU cần theo dõi: `sku_code, company_code(VN/US), vendor, target_weeks_coverage(mặc định 8), safety_weeks(mặc định 3), lead_time_weeks(mặc định 4), note, is_active`.
- **`inventory_plan_weekly`** — dữ liệu ô lưới, khoá `(sku_code, week_start_date)`: `actual_stock` (nhập tay OPS — **chưa có nguồn `gohub_dw`**, chờ tech bổ sung cột sau), `sales_forecast` + `sales_forecast_auto`, `import_qty` + `import_qty_auto`. `*_auto=false` = OPS đã ghi đè tay, không bị gợi ý tính lại đè lên.
- **`inventory_po`** — PO tracker (thay sheet "PO Dự kiến nhập" + bỏ hẳn `vendor_balances`): vendor/sku/qty + 4 mốc ngày (hết hàng dự kiến/cần có hàng/trễ nhất thanh toán/có hàng dự kiến) + trạng thái thanh toán/giao hàng.
- Bảng cũ `inventory_items/inventory_snapshots/vendor_balances` **không bị xoá** (không có migration gốc nên không viết DROP) — chỉ ngừng dùng trong code, còn tồn tại vô hại trên Supabase.

## 3. Logic gợi ý (server-side, `lib/inventory-plan.ts`)
Cho mỗi SKU, dựng chuỗi tuần cố định (2 tuần gần nhất "Actual" làm ngữ cảnh + N tuần tới "Forecast", mặc định N=14 qua param `weeks`), roll forward:
```
velocity = SUM(fulfilled_quantity) 30 ngày gần nhất (gohub_dw fact_fulfillment_revenue, GROUP BY TRIM(sku)) / 30 × 7
đầu tuần[0] = actual_stock tuần gần nhất OPS đã nhập, else 0
mỗi tuần:
  bán dự kiến = OPS ghi đè, else velocity
  tồn trước-khi-nhập = đầu tuần − bán dự kiến
  gợi ý nhập = tồn trước-khi-nhập < safety_weeks×velocity
             ? max(0, target_weeks_coverage×velocity − tồn trước-khi-nhập) : 0
  số nhập = OPS ghi đè, else gợi ý nhập
  cuối tuần = tồn trước-khi-nhập + số nhập
  đầu tuần[kế tiếp] = cuối tuần
cảnh báo: coverage(đầu tuần/velocity) < safety_weeks → "Nguy hiểm"; < target_weeks_coverage → "Cần chú ý"; else "Đủ hàng"
"Cần đặt PO ngay" = tuần thiếu hụt đầu tiên rơi trong vòng lead_time_weeks kể từ hôm nay
```
Query velocity dùng đúng pattern trailing-30d đã có ở hệ thống (`fulfiled_date::date <= CURRENT_DATE-1`), bọc `cachedAnalyticsQuery` (cache 12h — data gohub_dw chỉ đổi 1 lần/ngày).

## 4. UI
- Toggle thị trường **VN/US** đầu trang.
- Banner cảnh báo: số SKU "Nguy hiểm" + số SKU "cần đặt PO trong lead time tới" — click để filter.
- Bảng tổng quan 1 dòng/SKU: Vendor · Tồn hiện tại · Vận tốc bán/tuần · Số nhập tuần này (badge "(gợi ý)" nếu chưa OPS chỉnh) · Badge cảnh báo · mở rộng.
- Row mở rộng → lưới tuần: cột = tuần (mốc ngày + tag Actual/Forecast), 5 dòng: Tồn thực tế (input) / Đầu tuần (readonly) / Bán dự kiến (input, prefill gợi ý) / Số nhập (input, prefill gợi ý) / Cuối tuần (readonly, đỏ nếu âm). Ô nét đứt = số auto chưa chỉnh; gõ số → ghi đè, lưu riêng theo từng SKU.
- Modal thêm/sửa SKU watchlist: `target_weeks_coverage/safety_weeks/lead_time_weeks/note`, vendor tự lookup `dim_sku` nếu để trống.
- PO Tracker (card riêng dưới): bảng đúng cột sheet Excel gốc, edit-mode batch-save + thêm dòng mới, pill màu trạng thái thanh toán/giao hàng.
- Export Excel: xuất lưới tuần (mọi SKU đang hiển thị) ra file.

## 5. Import dữ liệu Excel ban đầu
`node scripts/import_inventory_plan.mjs "<đường dẫn file Plan nhập hàng theo tháng.xlsx>"` (chạy trên máy có `web/.env.local`) — đọc sheet `Plan VN`/`Plan US` (map từng SKU 5-dòng → SKU watchlist + dữ liệu tuần, `week_start_date` suy từ mốc "as of" ở hàng 0 cộng dồn 7 ngày/cột) và sheet `PO Dự kiến nhập` (map thẳng cột → `inventory_po`). Ô nào Excel đã có số ở Bán dự kiến/Số nhập → import kèm `*_auto=false` để giữ đúng số Ops đã tính.

## 6. Gotchas
- **`actual_stock` chưa có nguồn tự động** — OPS nhập tay tạm thời, giống Excel. Khi tech đưa cột tồn kho vào `gohub_dw`, sửa 1 chỗ ở `GET /api/analytics/inventory-plan/weekly` để tự pull thay vì đọc `inventory_plan_weekly.actual_stock`.
- `sku_code` tuần suy company_code từ ký tự đầu (VN=`1-6`, US=`A-E`) khi import — nếu SKU lạ không khớp pattern, script import bỏ qua/để null, cần bổ sung tay qua UI.
- Migration `v42_inventory_plan.sql` cần Hiếu chạy trên Supabase trước khi tab có dữ liệu; sau đó chạy script import 1 lần.
- Máy dev chính (không có `web/.env.local`) không tự chạy được migration/import/test live — cần Hiếu verify trên staging trước merge main.

## 7. Phân quyền
- **XEM**: `admin, creator, manager, staff, bod, ops-&-cs` (giữ nguyên `READ_ROLES` từ tab cũ).
- **SỬA** (thêm/sửa/xoá SKU, lưu lưới tuần, PO): `admin, creator, manager, staff` qua `canWriteTab(username, "fulfillment", WRITE_ROLES)` — hoặc user được cấp quyền riêng ở `/analytics/users` → "Quyền chỉnh sửa" (label hiển thị: "Inventory Plan (kế hoạch nhập hàng)").
