# Kiểm kê điều khiển: Vendors

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/vendors`
- Tệp quét (3): `app/(dashboard)/analytics/vendors/page.tsx`, `components/date-presets.tsx`, `app/(dashboard)/analytics/vendors/vendors-distribution.tsx`
- Dòng mã: 1101
- Thành phần dùng chung (không quét sâu): `components/dashboard-kit.tsx`
- Thư viện logic import: `lib/utils.ts`, `lib/analytics-formatters.ts`, `lib/vendor-distribution.ts`, `lib/export-excel.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (2):** `/api/analytics/query`, `/api/analytics/vendors/distribution`

**Bảng/nguồn nhắc trong mã giao diện:** `dim_sku`, `dim_order_source`, `fact_sales_revenue`, `fact_fulfillment_revenue`

**SQL xây ở giao diện (gửi qua /api/analytics/query), cần đối chiếu từng truy vấn:** `app/(dashboard)/analytics/vendors/page.tsx`

**Cờ cache/làm mới:** —. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (17)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| vendors-B01 | Fulfillment | `() => setDateColumn("fulfiled_date")` |  | page.tsx:466 |  |  |
| vendors-B02 | Created | `() => setDateColumn("created_date")` |  | page.tsx:471 |  |  |
| vendors-B03 | All | `() => setSelectedVendors(vendors)` |  | page.tsx:493 |  |  |
| vendors-B04 | Clear | `() => setSelectedVendors([])` |  | page.tsx:494 |  |  |
| vendors-B05 | Filters | `() => setShowFilters(!showFilters)` |  | page.tsx:532 |  |  |
| vendors-B06 | Làm mới dữ liệu | `fetchData` |  | page.tsx:539 |  |  |
| vendors-B07 | Reset | `() => { const d = getDefaultDateRange(); setStartDate(d.startDate); setEndDate(d.endDate);` |  | page.tsx:628 |  |  |
| vendors-B08 | Apply Filters | `() => { fetchData(); setShowFilters(false) }` |  | page.tsx:632 |  |  |
| vendors-B09 | Bỏ lọc | `() => applyFocus(null)` |  | page.tsx:709 |  |  |
| vendors-B10 | (icon) | `() => setProductPage(prev => Math.max(1, prev - 1))` | `productPage === 1` | page.tsx:796 |  |  |
| vendors-B11 | (icon) | `() => setProductPage(pageNum)` |  | page.tsx:810 |  |  |
| vendors-B12 | (icon) | `() => setProductPage(prev => Math.min(totalProductPages, prev + 1))` | `productPage === totalProductPages` | page.tsx:819 |  |  |
| vendors-B13 | (icon) | `() => { const r = getPresetRange(p.key) onSelect(r.startDate, r.endDate) }` |  | date-presets.tsx:45 |  |  |
| vendors-B14 | (icon) | `() => onViewChange(k)` |  | vendors-distribution.tsx:77 |  |  |
| vendors-B15 | Export | `doExport` | `loading // rows.length === 0` | vendors-distribution.tsx:88 |  |  |
| vendors-B16 | Bỏ lọc | `() => onFocus(null)` |  | vendors-distribution.tsx:98 |  |  |
| vendors-B17 | {open ? "Thu gọn" : `Xem thêm $ dòng`} | `() => setExpanded(prev => { const s = new Set(prev); s.has(group) ? s.delete(group) : s.ad` |  | vendors-distribution.tsx:171 |  |  |

### 2.2 Ô nhập và hộp tích (4)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| vendors-I01 | date | `startDate` | `(e) => setStartDate(e.target.value)` | page.tsx:608 |  |  |
| vendors-I02 | date | `endDate` | `(e) => setEndDate(e.target.value)` | page.tsx:613 |  |  |
| vendors-I03 | text «Search SKU...» | `searchTerm` | `(e) => setSearchTerm(e.target.value)` | page.tsx:714 |  |  |
| vendors-I04 | text «showCust ? "Tìm khách hàng / kênh…" : "Tìm kênh…"» | `search` | `e => setSearch(e.target.value)` | vendors-distribution.tsx:85 |  |  |

### 2.3 Danh sách chọn (4)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| vendors-S01 | `selectedChannelGroup` | All Groups · B2B · B2C | `(e) => setSelectedChannelGroup(e.target.value)` | page.tsx:592 |  |  |
| vendors-S02 | `selectedChannel` |  | `(e) => setSelectedChannel(e.target.value)` | page.tsx:601 |  |  |
| vendors-S03 | `comparisonType` | No Comparison · Previous Period · Previous Year | `(e) => setComparisonType(e.target.value as any)` | page.tsx:619 |  |  |
| vendors-S04 |  | Nhanh… | `(e) => { if (!e.target.value) return const r = getPresetRange(e.target.value as` | date-presets.tsx:25 |  |  |

### 2.4 State điều khiển (26)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| vendors | `[]` | page.tsx:39 |
| selectedVendors | `[]` | page.tsx:40 |
| showVendorDropdown | `false` | page.tsx:41 |
| loading | `true` | page.tsx:42 |
| error | `null` | page.tsx:43 |
| startDate | `() => getDefaultDateRange().startDate` | page.tsx:45 |
| endDate | `() => getDefaultDateRange().endDate` | page.tsx:46 |
| showFilters | `false` | page.tsx:47 |
| searchTerm | `""` | page.tsx:49 |
| sortConfig | `{ key: "revenue", direction: "desc" }` | page.tsx:50 |
| productPage | `1` | page.tsx:52 |
| metrics | `{ revenue: 0, revenueChange: 0, orders: 0, ordersChange: 0,` | page.tsx:55 |
| prevMonthMetrics | `null` | page.tsx:60 |
| trendData | `[]` | page.tsx:62 |
| productPerformance | `[]` | page.tsx:63 |
| distRows | `[]` | page.tsx:65 |
| distView | `"customer"` | page.tsx:66 |
| distLoading | `false` | page.tsx:67 |
| focus | `null` | page.tsx:68 |
| productsLoading | `false` | page.tsx:69 |
| channels | `[]` | page.tsx:71 |
| selectedChannel | `"All Channels"` | page.tsx:72 |
| selectedChannelGroup | `"All Groups"` | page.tsx:73 |
| comparisonType | `"none"` | page.tsx:74 |
| dateColumn | `"fulfiled_date"` | page.tsx:75 |
| search | `""` | vendors-distribution.tsx:37 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `handleSort("sku")}> Product SKU`, `handleSort("revenue")}> Revenue (VND)`, `Change`, `handleSort("orders")}> Orders`, `handleSort("margin")}> Gross Margin`, `handleSort("marginPercent")}> Margin %`, `Kênh bán`, `Mã KH`, `Orders`, `Units`, `Revenue (VND)`, `Dự phóng`, `Tổng DT (mọi vendor)`, `%Contrib`, `%MoM`, `% vendor`

**Cột khai báo (label:):** `Projected Revenue`, `Projected Orders`, `Projected GP`, `Projected Units`, `Revenue (VND)`, `Orders`, `Units Sold`, `AOV (VND)`, `Gross Margin`, `So sánh`, `Tuần này`, `Tháng này`, `Quý này`, `Năm nay`

## 4. Xuất file

Hàm: `exportAOA`

## 5. Thao tác ghi từ giao diện (3)

| ID | Phương thức | URL | Vị trí | Quyền / hiệu ứng | Kết quả QA |
|---|---|---|---|---|---|
| vendors-W01 | POST | `"/api/analytics/query"` | page.tsx:120 |  |  |
| vendors-W02 | POST | `"/api/analytics/query"` | page.tsx:154 |  |  |
| vendors-W03 | POST | `"/api/analytics/query"` | page.tsx:278 |  |  |

## 6. Cổng quyền trong giao diện

_(không thấy)_
