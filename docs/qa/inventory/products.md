# Kiểm kê điều khiển: Products (BI)

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/products`
- Tệp quét (2): `app/(dashboard)/analytics/products/page.tsx`, `components/date-presets.tsx`
- Dòng mã: 1095
- Thành phần dùng chung (không quét sâu): `components/toast.tsx`, `components/dashboard-kit.tsx`
- Thư viện logic import: `lib/utils.ts`, `lib/analytics-formatters.ts`, `lib/export-excel.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (7):** `/api/analytics/query`, `/api/channels`, `/api/config/sku-destination-rule`, `/api/config/country-codes`, `/api/analytics/b2b/strategic-performance`, `/api/analytics/win-rate`, `/api/orders/export`

**Bảng/nguồn nhắc trong mã giao diện:** `dim_sku`, `fact_sales_revenue`, `fact_fulfillment_revenue`, `dim_order_source`

**SQL xây ở giao diện (gửi qua /api/analytics/query), cần đối chiếu từng truy vấn:** `app/(dashboard)/analytics/products/page.tsx`

**Cờ cache/làm mới:** —. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (13)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| products-B01 | Fulfillment | `() => setDateColumn("fulfiled_date")` |  | page.tsx:521 |  |  |
| products-B02 | Created | `() => setDateColumn("created_date")` |  | page.tsx:525 |  |  |
| products-B03 | Export PDF | `exportToPDF` | `loading // exporting` | page.tsx:536 |  |  |
| products-B04 | Export Orders | `handleExport` | `loading` | page.tsx:541 |  |  |
| products-B05 | (icon) | `() => setActiveTab(tab)` |  | page.tsx:552 |  |  |
| products-B06 | Clear Selection | `(e) => { e.stopPropagation(); setSelectedSkus([]) }` |  | page.tsx:584 |  |  |
| products-B07 | Clear | `() => setSelectedVendors([])` |  | page.tsx:619 |  |  |
| products-B08 | Apply Filters | `fetchPerformanceData` |  | page.tsx:690 |  |  |
| products-B09 | Export | `() => exportToCSV(group.data, group.id.replace(/-/g, "_"), [ { label: "Channel", key: "cha` |  | page.tsx:794 |  |  |
| products-B10 | (icon) | `exportSkuBreakdownFull` | `exportingSku` | page.tsx:848 |  |  |
| products-B11 | Tính Win Rate | `fetchWinRate` | `wrLoading` | page.tsx:930 |  |  |
| products-B12 | Export | `() => exportRawRows(wrData.skus.map((s: any) => ({ "SKU": s.sku_code, "Vendor": s.vendor /` |  | page.tsx:966 |  |  |
| products-B13 | (icon) | `() => { const r = getPresetRange(p.key) onSelect(r.startDate, r.endDate) }` |  | date-presets.tsx:45 |  |  |

### 2.2 Ô nhập và hộp tích (6)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| products-I01 | text «Search SKU...» | `skuSearch` | `(e) => setSkuSearch(e.target.value)` | page.tsx:577 |  |  |
| products-I02 | date | `startDate` | `(e) => setStartDate(e.target.value)` | page.tsx:636 |  |  |
| products-I03 | date | `endDate` | `(e) => setEndDate(e.target.value)` | page.tsx:638 |  |  |
| products-I04 | number | `wrDays` | `e => setWrDays(parseInt(e.target.value) // 90)` | page.tsx:906 |  |  |
| products-I05 | number | `wrThresh` | `e => setWrThresh(parseInt(e.target.value) // 5)` | page.tsx:912 |  |  |
| products-I06 | number | `wrWinDays` | `e => setWrWinDays(parseInt(e.target.value) // 14)` | page.tsx:918 |  |  |

### 2.3 Danh sách chọn (7)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| products-S01 | `selectedCategory` | All Categories | `(e) => setSelectedCategory(e.target.value)` | page.tsx:601 |  |  |
| products-S02 | `selectedChannelGroup` | All Groups · B2C · B2B | `(e) => { setSelectedChannelGroup(e.target.value); setSelectedChannel("all") }` | page.tsx:646 |  |  |
| products-S03 | `selectedChannel` | All Channels | `(e) => setSelectedChannel(e.target.value)` | page.tsx:657 |  |  |
| products-S04 | `selectedDestination` | All Destinations · ( ) | `(e) => setSelectedDestination(e.target.value)` | page.tsx:669 |  |  |
| products-S05 | `comparisonType` | No Comparison · Previous Period · Previous Year | `(e) => setComparisonType(e.target.value as any)` | page.tsx:681 |  |  |
| products-S06 | `wrVendor` | Tất cả vendor | `e => setWrVendor(e.target.value)` | page.tsx:924 |  |  |
| products-S07 |  | Nhanh… | `(e) => { if (!e.target.value) return const r = getPresetRange(e.target.value as` | date-presets.tsx:25 |  |  |

### 2.4 State điều khiển (34)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| loading | `true` | page.tsx:54 |
| metrics | `{ revenue: 0, revenueChange: 0, orders: 0, ordersChange: 0,` | page.tsx:55 |
| trendData | `[]` | page.tsx:58 |
| channelData | `[]` | page.tsx:59 |
| regionData | `[]` | page.tsx:60 |
| skuPerformance | `[]` | page.tsx:61 |
| exporting | `false` | page.tsx:63 |
| exportingSku | `false` | page.tsx:65 |
| startDate | `() => getDefaultDateRange().startDate` | page.tsx:70 |
| endDate | `() => getDefaultDateRange().endDate` | page.tsx:71 |
| comparisonType | `"previous_period"` | page.tsx:72 |
| dateColumn | `"fulfiled_date"` | page.tsx:73 |
| availableSkus | `[]` | page.tsx:76 |
| selectedSkus | `[]` | page.tsx:77 |
| skuSearch | `""` | page.tsx:78 |
| showSkuDropdown | `false` | page.tsx:79 |
| categories | `[]` | page.tsx:82 |
| selectedCategory | `"all"` | page.tsx:83 |
| vendors | `[]` | page.tsx:84 |
| selectedVendors | `[]` | page.tsx:85 |
| showVendorDropdown | `false` | page.tsx:86 |
| selectedChannelGroup | `"all"` | page.tsx:89 |
| availableChannels | `[]` | page.tsx:90 |
| selectedChannel | `"all"` | page.tsx:91 |
| skuRule | `{ startsWith: "E", codeLength: 3, useGohubVietnamRule: true,` | page.tsx:94 |
| selectedDestination | `"all"` | page.tsx:96 |
| availableDestinations | `[]` | page.tsx:97 |
| activeTab | `"performance"` | page.tsx:100 |
| wrData | `null` | page.tsx:101 |
| wrLoading | `false` | page.tsx:102 |
| wrDays | `90` | page.tsx:103 |
| wrThresh | `5` | page.tsx:104 |
| wrWinDays | `14` | page.tsx:105 |
| wrVendor | `""` | page.tsx:106 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `Channel`, `Revenue`, `Units Sold`, `Orders`, `Gross Margin`, `Margin %`, `SKU`, `Country`, `Category`, `Vendor`, `Units`

**Cột khai báo (label:):** `Revenue (VND)`, `Units Sold`, `Orders`, `ASP (VND)`, `Gross Margin`, `So sánh`, `Channel`, `Revenue`, `SKU mới`, `WIN`, `PENDING`, `FAILED`, `Tuần này`, `Tháng này`, `Quý này`, `Năm nay`

## 4. Xuất file

Hàm: `exportWithDateRange`, `exportRawRows`, `exportToCSV`, `exportSkuBreakdownFull`, `exportToPDF`

## 5. Thao tác ghi từ giao diện (1)

| ID | Phương thức | URL | Vị trí | Quyền / hiệu ứng | Kết quả QA |
|---|---|---|---|---|---|
| products-W01 | POST | `"/api/analytics/query"` | page.tsx:119 |  |  |

## 6. Cổng quyền trong giao diện

_(không thấy)_
