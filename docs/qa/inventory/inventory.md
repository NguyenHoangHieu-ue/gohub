# Kiểm kê điều khiển: Inventory

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/fulfillment`
- Tệp quét (2): `app/(dashboard)/analytics/fulfillment/page.tsx`, `components/inventory/stock-view.tsx`
- Dòng mã: 901
- Thành phần dùng chung (không quét sâu): `components/dashboard-kit.tsx`
- Thư viện logic import: `lib/utils.ts`, `lib/export-excel.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (4):** `/api/analytics/inventory-plan/skus`, `/api/analytics/inventory-plan/weekly`, `/api/analytics/inventory-po`, `/api/analytics/inventory-stock`

**Bảng/nguồn nhắc trong mã giao diện:** `fact_inventory`

**Cờ cache/làm mới:** —. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (22)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| inventory-B01 | Hủy | `onClose` |  | page.tsx:165 |  |  |
| inventory-B02 | (icon) | `submit` | `saving` | page.tsx:166 |  |  |
| inventory-B03 | Hủy | `() => setDrafts({})` |  | page.tsx:205 |  |  |
| inventory-B04 | (icon) | `save` | `saving` | page.tsx:206 |  |  |
| inventory-B05 | Thêm PO | `addRow` |  | page.tsx:340 |  |  |
| inventory-B06 | Hủy | `() => setEditMode(false)` |  | page.tsx:343 |  |  |
| inventory-B07 | (icon) | `save` | `saving` | page.tsx:344 |  |  |
| inventory-B08 | Sửa | `enterEdit` |  | page.tsx:350 |  |  |
| inventory-B09 | (icon) | `() => del(r.id)` |  | page.tsx:396 |  |  |
| inventory-B10 | (icon) | `() => setCompany(c)` |  | page.tsx:481 |  |  |
| inventory-B11 | Thêm SKU | `() => setShowAdd(true)` |  | page.tsx:487 |  |  |
| inventory-B12 | Export | `exportData` |  | page.tsx:490 |  |  |
| inventory-B13 | SKU nguy hiểm (dưới ngưỡng an toàn) | `() => setFilter(filter === "critical" ? null : "critical")` |  | page.tsx:508 |  |  |
| inventory-B14 | SKU cần đặt PO trong lead time | `() => setFilter(filter === "orderSoon" ? null : "orderSoon")` |  | page.tsx:515 |  |  |
| inventory-B15 | (icon) | `() => setEditSku(s)` |  | page.tsx:554 |  |  |
| inventory-B16 | (icon) | `() => deleteSku(s.sku_code)` |  | page.tsx:555 |  |  |
| inventory-B17 | (icon) | `() => setTab(key)` |  | page.tsx:592 |  |  |
| inventory-B18 | Export Excel | `exportExcel` |  | stock-view.tsx:136 |  |  |
| inventory-B19 | Tải lại | `load` |  | stock-view.tsx:139 |  |  |
| inventory-B20 | (icon) | `() => setMarket(m)` |  | stock-view.tsx:176 |  |  |
| inventory-B21 | (icon) | `() => setSimType(t)` |  | stock-view.tsx:184 |  |  |
| inventory-B22 | ( ) | `() => setFilter(filter === lv ? null : lv)` |  | stock-view.tsx:200 |  |  |

### 2.2 Ô nhập và hộp tích (15)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| inventory-I01 | number «String(Math.round(placeholder))» — ) } // ─── Add / Edit SKU Modal ──────── | `str` | `e => { const s = e.target.value setStr(s) onChange(s === "" ? null : Number(s))` | page.tsx:85 |  |  |
| inventory-I02 | text «vd. 1D0003DK00000» | `form.sku_code` | `e => set("sku_code", e.target.value)` | page.tsx:139 |  |  |
| inventory-I03 | text | `form.vendor` | `e => set("vendor", e.target.value)` | page.tsx:145 |  |  |
| inventory-I04 | number | `(form as any)[key]` | `e => set(key, Number(e.target.value))` | page.tsx:152 |  |  |
| inventory-I05 | text — : r.vendor} |  | `e => setDraft(r.id, "vendor", e.target.value)` | page.tsx:371 |  |  |
| inventory-I06 | text — : r.sku_code} |  | `e => setDraft(r.id, "sku_code", e.target.value)` | page.tsx:372 |  |  |
| inventory-I07 | number — : n0(r.qty)} |  | `e => setDraft(r.id, "qty", Number(e.target.value))` | page.tsx:373 |  |  |
| inventory-I08 | date — : (r[key] ? String(r[key]) : "—")} |  | `e => setDraft(r.id, key, e.target.value // null)` | page.tsx:377 |  |  |
| inventory-I09 | text — : (r.note // "—")} |  | `e => setDraft(r.id, "note", e.target.value)` | page.tsx:395 |  |  |
| inventory-I10 | text «Vendor» | `nr.vendor` | `e => setNewField(i, "vendor", e.target.value)` | page.tsx:402 |  |  |
| inventory-I11 | text «SKU» | `nr.sku_code` | `e => setNewField(i, "sku_code", e.target.value)` | page.tsx:403 |  |  |
| inventory-I12 | number | `nr.qty // ""` | `e => setNewField(i, "qty", e.target.value)` | page.tsx:404 |  |  |
| inventory-I13 | date | `(nr as any)[key]` | `e => setNewField(i, key as string, e.target.value)` | page.tsx:406 |  |  |
| inventory-I14 | text | `nr.note` | `e => setNewField(i, "note", e.target.value)` | page.tsx:418 |  |  |
| inventory-I15 | text «Tìm SKU, vendor...» | `search` | `e => setSearch(e.target.value)` | stock-view.tsx:193 |  |  |

### 2.3 Danh sách chọn (4)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| inventory-S01 |  | Chưa thanh toán · Đã thanh toán | `e => setDraft(r.id, "payment_status", e.target.value)` | page.tsx:383 |  |  |
| inventory-S02 |  | Chờ thanh toán · Chờ nhận · Đã nhập kho | `e => setDraft(r.id, "delivery_status", e.target.value)` | page.tsx:390 |  |  |
| inventory-S03 | `nr.payment_status` | Chưa thanh toán · Đã thanh toán | `e => setNewField(i, "payment_status", e.target.value)` | page.tsx:409 |  |  |
| inventory-S04 | `nr.delivery_status` | Chờ thanh toán · Chờ nhận · Đã nhập kho | `e => setNewField(i, "delivery_status", e.target.value)` | page.tsx:414 |  |  |

### 2.4 State điều khiển (25)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| str | `value != null ? String(value) : ""` | page.tsx:81 |
| form | `{ sku_code: existing?.sku_code ?? "", vendor: existing?.vend` | page.tsx:105 |
| saving | `false` | page.tsx:111 |
| error | `""` | page.tsx:112 |
| drafts | `{}` | page.tsx:180 |
| saving | `false` | page.tsx:181 |
| rows | `[]` | page.tsx:284 |
| loading | `true` | page.tsx:285 |
| editMode | `false` | page.tsx:286 |
| saving | `false` | page.tsx:289 |
| company | `"VN"` | page.tsx:431 |
| grid | `{ weeks: [], skus: [] }` | page.tsx:432 |
| loading | `true` | page.tsx:433 |
| expanded | `null` | page.tsx:434 |
| filter | `null` | page.tsx:435 |
| showAdd | `false` | page.tsx:436 |
| editSku | `null` | page.tsx:437 |
| tab | `"stock"` | page.tsx:581 |
| data | `null` | stock-view.tsx:52 |
| loading | `true` | stock-view.tsx:53 |
| search | `""` | stock-view.tsx:54 |
| filter | `null` | stock-view.tsx:55 |
| market | `"ALL"` | stock-view.tsx:56 |
| simType | `"ALL"` | stock-view.tsx:57 |
| expanded | `null` | stock-view.tsx:58 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `Tuần`, `Kho`, `Mã lô`, `Tồn kho`, `% tổng`, `Hạn dùng`

**Cột khai báo (label:):** `Nguy hiểm`, `Cần chú ý`, `Đủ hàng`, `—`, `Tồn thực tế`, `Đầu tuần`, `Bán dự kiến`, `Số nhập`, `Cuối tuần`, `Bình thường`, `An toàn`, `SKU`, `Sản phẩm`, `SIM/eSIM`, `Thị trường`, `Vendor`, `Tổng tồn kho`, `Tốc độ bán/ngày`, `Bán tuần trước`, `Ước tính hết hàng (ngày)`, `HSD gần nhất`, `Cảnh báo`, `Kho`, `Mã lô`, `Tồn theo kho`, `HSD theo kho`, `SKU theo dõi`, `SKU nguy hiểm`, `Sắp hết hạn (<30 ngày)`, `Kho đang có hàng`

## 4. Xuất file

Hàm: `exportRawRows`, `exportData`, `exportToExcel`, `exportExcel`

## 5. Thao tác ghi từ giao diện (5)

| ID | Phương thức | URL | Vị trí | Quyền / hiệu ứng | Kết quả QA |
|---|---|---|---|---|---|
| inventory-W01 | POST | `"/api/analytics/inventory-plan/weekly"` | page.tsx:191 |  |  |
| inventory-W02 | PATCH | `"/api/analytics/inventory-po"` | page.tsx:308 |  |  |
| inventory-W03 | POST | `"/api/analytics/inventory-po"` | page.tsx:312 |  |  |
| inventory-W04 | DELETE | `"/api/analytics/inventory-po"` | page.tsx:322 |  |  |
| inventory-W05 | DELETE | `"/api/analytics/inventory-plan/skus"` | page.tsx:458 |  |  |

## 6. Cổng quyền trong giao diện

_(không thấy)_
