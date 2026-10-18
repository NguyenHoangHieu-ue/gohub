# Kiểm kê điều khiển: BOD Report

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/bod`
- Tệp quét (2): `app/(dashboard)/analytics/bod/page.tsx`, `components/date-presets.tsx`
- Dòng mã: 857
- Thành phần dùng chung (không quét sâu): `components/dashboard-kit.tsx`
- Thư viện logic import: `lib/utils.ts`, `lib/analytics-formatters.ts`, `lib/export-excel.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (7):** `/api/analytics/query`, `/api/analytics/bod-summary`, `/api/analytics/bod-report`, `/api/analytics/bod-group-margin`, `/api/analytics/bod-channel-performance`, `/api/analytics/b2b/strategic-performance`, `/api/config/partner-tiers`

**Bảng/nguồn nhắc trong mã giao diện:** `dim_sku`, `dim_order_source`

**SQL xây ở giao diện (gửi qua /api/analytics/query), cần đối chiếu từng truy vấn:** `app/(dashboard)/analytics/bod/page.tsx`

**Cờ cache/làm mới:** —. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (11)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| bod-B01 | Fulfillment | `() => setDateColumn("fulfiled_date")` |  | page.tsx:350 |  |  |
| bod-B02 | Created | `() => setDateColumn("created_date")` |  | page.tsx:351 |  |  |
| bod-B03 | Filters | `() => setShowFilters(!showFilters)` |  | page.tsx:357 |  |  |
| bod-B04 | (icon) | `fetchData` |  | page.tsx:360 |  |  |
| bod-B05 | Clear | `() => setSelectedVendors([])` |  | page.tsx:396 |  |  |
| bod-B06 | Apply Filters | `fetchData` |  | page.tsx:464 |  |  |
| bod-B07 | (icon) | `exportRevenueCogsCSV` |  | page.tsx:535 |  |  |
| bod-B08 | Export | `exportChannelPerformanceCSV` |  | page.tsx:552 |  |  |
| bod-B09 | (icon) | `exportMarginAnalysisCSV` |  | page.tsx:632 |  |  |
| bod-B10 | Export | `exportChannelPerformanceCSV` |  | page.tsx:695 |  |  |
| bod-B11 | (icon) | `() => { const r = getPresetRange(p.key) onSelect(r.startDate, r.endDate) }` |  | date-presets.tsx:45 |  |  |

### 2.2 Ô nhập và hộp tích (3)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| bod-I01 | date | `dateRange.start` | `e => setDateRange(prev => ({ ...prev, start: e.target.value }))` | page.tsx:372 |  |  |
| bod-I02 | date | `dateRange.end` | `e => setDateRange(prev => ({ ...prev, end: e.target.value }))` | page.tsx:376 |  |  |
| bod-I03 | checkbox | `val` | `e => set(e.target.checked)` | page.tsx:459 |  |  |

### 2.3 Danh sách chọn (2)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| bod-S01 | `comparisonType` | No Comparison · Previous Period · Previous Year | `(e: any) => setComparisonType(e.target.value)` | page.tsx:380 |  |  |
| bod-S02 |  | Nhanh… | `(e) => { if (!e.target.value) return const r = getPresetRange(e.target.value as` | date-presets.tsx:25 |  |  |

### 2.4 State điều khiển (26)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| summary | `null` | page.tsx:60 |
| prevMonthSummary | `null` | page.tsx:61 |
| data | `[]` | page.tsx:62 |
| groupMargins | `[]` | page.tsx:63 |
| strategicPerformance | `[]` | page.tsx:64 |
| channelPerformance | `[]` | page.tsx:66 |
| loading | `true` | page.tsx:67 |
| dateRange | `() => { const defaultRange = getDefaultDateRange() return {` | page.tsx:68 |
| showFilters | `false` | page.tsx:73 |
| comparisonType | `"none"` | page.tsx:74 |
| dateColumn | `"fulfiled_date"` | page.tsx:75 |
| includeShip | `true` | page.tsx:76 |
| includeInternalOps | `true` | page.tsx:77 |
| vendors | `[]` | page.tsx:79 |
| selectedVendors | `[]` | page.tsx:80 |
| showVendorDropdown | `false` | page.tsx:81 |
| subChannels | `[]` | page.tsx:83 |
| selectedSubChannels | `[]` | page.tsx:84 |
| showSubChannelDropdown | `false` | page.tsx:85 |
| channelGroups | `[]` | page.tsx:87 |
| selectedChannelGroups | `[]` | page.tsx:88 |
| showChannelGroupDropdown | `false` | page.tsx:89 |
| productTypes | `[]` | page.tsx:91 |
| selectedProductTypes | `[]` | page.tsx:92 |
| showProductTypeDropdown | `false` | page.tsx:93 |
| expandedGroups | `[]` | page.tsx:95 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `Channel Group`, `Orders`, `Units Sold`, `Revenue`, `Gross Margin`, `Margin %`, `CM1`, `CM1 %`, `Date`, `COGS`, `Channel`, `Units`, `Doanh thu dự phóng`, `CM1 dự phóng`, `CM1 % dự phóng`

**Cột khai báo (label:):** `Goal`, `vs Prev Period`, `vs Prev Year`, `Projected Revenue`, `Projected Units`, `Projected Margin`, `Projected CM1`, `Tuần này`, `Tháng này`, `Quý này`, `Năm nay`

## 4. Xuất file

Hàm: `exportAOA`, `exportChannelPerformanceCSV`, `exportRevenueCogsCSV`, `exportMarginAnalysisCSV`

## 5. Thao tác ghi từ giao diện (1)

| ID | Phương thức | URL | Vị trí | Quyền / hiệu ứng | Kết quả QA |
|---|---|---|---|---|---|
| bod-W01 | POST | `"/api/analytics/query"` | page.tsx:103 |  |  |

## 6. Cổng quyền trong giao diện

_(không thấy)_
