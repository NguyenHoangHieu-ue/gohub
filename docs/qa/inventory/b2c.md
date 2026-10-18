# Kiểm kê điều khiển: B2C

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/b2c`
- Tệp quét (5): `app/(dashboard)/analytics/b2c/page.tsx`, `components/b2c-performance.tsx`, `components/b2c-advanced-dashboard.tsx`, `components/b2c-metric.tsx`, `components/date-presets.tsx`
- Dòng mã: 3595
- Thành phần dùng chung (không quét sâu): `components/dashboard-kit.tsx`
- Thư viện logic import: `lib/utils.ts`, `lib/analytics-engine/projection.ts`, `lib/analytics-formatters.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (12):** `/api/analytics/query`, `/api/channel-costs`, `/api/channel-group-costs`, `/api/analytics/b2c/kpis`, `/api/analytics/b2c/trend`, `/api/analytics/b2c/performance`, `/api/analytics/b2c/loss-skus`, `/api/analytics/b2c/monthly`, `/api/config/ga4`, `/api/analytics/website`, `/api/analytics/b2c/ga4-categories`, `/api/analytics/b2c/metric`

**Bảng/nguồn nhắc trong mã giao diện:** `dim_sku`, `dim_order_source`, `fact_fulfillment_revenue`

**SQL xây ở giao diện (gửi qua /api/analytics/query), cần đối chiếu từng truy vấn:** `components/b2c-performance.tsx`

**Cờ cache/làm mới:** fresh. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (25)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| b2c-B01 | Advanced | `() => setView("advanced")` |  | page.tsx:17 |  |  |
| b2c-B02 | Performance | `() => setView("main")` |  | page.tsx:26 |  |  |
| b2c-B03 | Metric | `() => setView("metric")` |  | page.tsx:35 |  |  |
| b2c-B04 | Filters {(selectedVendors.length > 0 // selectedSubChannels.length > 0 | `() => setShowFilters(!showFilters)` |  | b2c-performance.tsx:577 |  |  |
| b2c-B05 | Export | `handleExport` |  | b2c-performance.tsx:594 |  |  |
| b2c-B06 | Fulfillment | `() => setDateColumn("fulfiled_date")` |  | b2c-performance.tsx:657 |  |  |
| b2c-B07 | Created | `() => setDateColumn("created_date")` |  | b2c-performance.tsx:666 |  |  |
| b2c-B08 | Clear All | `(e) => { e.stopPropagation() setSelectedVendors([]) }` |  | b2c-performance.tsx:696 |  |  |
| b2c-B09 | Clear All | `(e) => { e.stopPropagation() setSelectedSubChannels([]) }` |  | b2c-performance.tsx:746 |  |  |
| b2c-B10 | Clear All | `(e) => { e.stopPropagation() setSelectedProductTypes([]) }` |  | b2c-performance.tsx:796 |  |  |
| b2c-B11 | Reset Filters | `() => { const def = getDefaultDateRange() setStartDate(def.startDate) setEndDate(def.endDa` |  | b2c-performance.tsx:831 |  |  |
| b2c-B12 | Close | `() => setShowFilters(false)` |  | b2c-performance.tsx:847 |  |  |
| b2c-B13 | Apply Filters | `() => { fetchData() setShowFilters(false) }` |  | b2c-performance.tsx:853 |  |  |
| b2c-B14 | Monthly | `() => setPeriod("month")` |  | b2c-performance.tsx:1020 |  |  |
| b2c-B15 | Quarterly | `() => setPeriod("quarter")` |  | b2c-performance.tsx:1026 |  |  |
| b2c-B16 | Channel | `() => setGroupBy("channel")` |  | b2c-performance.tsx:1100 |  |  |
| b2c-B17 | SKU | `() => setGroupBy("sku")` |  | b2c-performance.tsx:1106 |  |  |
| b2c-B18 | Vendor | `() => setGroupBy("vendor")` |  | b2c-performance.tsx:1112 |  |  |
| b2c-B19 | Destination | `() => setGroupBy("destination")` |  | b2c-performance.tsx:1118 |  |  |
| b2c-B20 | Staff | `() => setGroupBy("staff")` |  | b2c-performance.tsx:1124 |  |  |
| b2c-B21 | Customer | `() => setGroupBy("customer")` |  | b2c-performance.tsx:1130 |  |  |
| b2c-B22 | {showAllPerformance ? "Show Less" : `View All ($ )`} | `() => setShowAllPerformance(!showAllPerformance)` |  | b2c-performance.tsx:1503 |  |  |
| b2c-B23 | (icon) | `() => setViewMode(mode)` |  | b2c-advanced-dashboard.tsx:1305 |  |  |
| b2c-B24 | (icon) | `load` | `loading` | b2c-metric.tsx:156 |  |  |
| b2c-B25 | (icon) | `() => { const r = getPresetRange(p.key) onSelect(r.startDate, r.endDate) }` |  | date-presets.tsx:45 |  |  |

### 2.2 Ô nhập và hộp tích (3)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| b2c-I01 | date | `startDate` | `(e) => setStartDate(e.target.value)` | b2c-performance.tsx:611 |  |  |
| b2c-I02 | date | `endDate` | `(e) => setEndDate(e.target.value)` | b2c-performance.tsx:620 |  |  |
| b2c-I03 | checkbox | `val` | `e => set(e.target.checked)` | b2c-performance.tsx:647 |  |  |

### 2.3 Danh sách chọn (3)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| b2c-S01 | `comparisonType` | No Comparison · Previous Period · Previous Year | `(e: any) => setComparisonType(e.target.value)` | b2c-performance.tsx:630 |  |  |
| b2c-S02 | `selectedProfitMonth` |  | `e => setProfitMonth(e.target.value)` | b2c-advanced-dashboard.tsx:1384 |  |  |
| b2c-S03 |  | Nhanh… | `(e) => { if (!e.target.value) return const r = getPresetRange(e.target.value as` | date-presets.tsx:25 |  |  |

### 2.4 State điều khiển (43)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| view | `"advanced"` | page.tsx:12 |
| startDate | `() => getDefaultDateRange().startDate` | b2c-performance.tsx:96 |
| endDate | `() => getDefaultDateRange().endDate` | b2c-performance.tsx:97 |
| period | `"month"` | b2c-performance.tsx:98 |
| groupBy | `"channel"` | b2c-performance.tsx:99 |
| loading | `true` | b2c-performance.tsx:100 |
| error | `null` | b2c-performance.tsx:101 |
| showFilters | `false` | b2c-performance.tsx:104 |
| vendors | `[]` | b2c-performance.tsx:105 |
| selectedVendors | `[]` | b2c-performance.tsx:106 |
| showVendorDropdown | `false` | b2c-performance.tsx:107 |
| subChannels | `[]` | b2c-performance.tsx:108 |
| selectedSubChannels | `[]` | b2c-performance.tsx:109 |
| showSubChannelDropdown | `false` | b2c-performance.tsx:110 |
| productTypes | `[]` | b2c-performance.tsx:111 |
| selectedProductTypes | `[]` | b2c-performance.tsx:112 |
| showProductTypeDropdown | `false` | b2c-performance.tsx:113 |
| comparisonType | `"none"` | b2c-performance.tsx:114 |
| showAllPerformance | `false` | b2c-performance.tsx:115 |
| dateColumn | `"fulfiled_date"` | b2c-performance.tsx:116 |
| includeShip | `true` | b2c-performance.tsx:119 |
| includeInternalOps | `true` | b2c-performance.tsx:120 |
| includeOpsCustomers | `true` | b2c-performance.tsx:121 |
| kpis | `[]` | b2c-performance.tsx:190 |
| prevMonthKpis | `[]` | b2c-performance.tsx:191 |
| trendData | `[]` | b2c-performance.tsx:192 |
| performanceData | `[]` | b2c-performance.tsx:193 |
| performanceTotal | `null` | b2c-performance.tsx:195 |
| performanceTotalGroups | `0` | b2c-performance.tsx:196 |
| lossSkus | `[]` | b2c-performance.tsx:197 |
| sortConfig | `{ key: "revenue", direction: "desc", }` | b2c-performance.tsx:198 |
| groupCosts | `[]` | b2c-performance.tsx:204 |
| expandedRow | `null` | b2c-performance.tsx:205 |
| data | `null` | b2c-advanced-dashboard.tsx:397 |
| loading | `true` | b2c-advanced-dashboard.tsx:398 |
| error | `null` | b2c-advanced-dashboard.tsx:399 |
| viewMode | `"month"` | b2c-advanced-dashboard.tsx:400 |
| profitMonth | `""` | b2c-advanced-dashboard.tsx:401 |
| ga4 | `null` | b2c-advanced-dashboard.tsx:403 |
| ga4Categories | `null` | b2c-advanced-dashboard.tsx:409 |
| data | `null` | b2c-metric.tsx:105 |
| loading | `true` | b2c-metric.tsx:106 |
| error | `null` | b2c-metric.tsx:107 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `handleSort("name")} >`, `handleSort("revenue")} >`, `VN`, `US`, `handleSort("units")} > Units`, `handleSort("margin")} > Gross Profit`, `handleSort("margin_percent")} > Margin %`, `handleSort("gpm2" as any)} > CM1`, `Line`, `Prorata`, `vs prev`, `% đạt KPI`, `Chỉ số`, `Category`, `Traffic`, `CR`, `Purchases`, `Traffic tăng/giảm`, `Kênh`, `Revenue`, `COGS`, `Gross Profit`, `Margin %`, `Operation Cost`, `CM1`, `CM1%`, `Metric`

**Cột khai báo (label:):** `Live Chat`, `WhatsApp`, `Zalo OA`, `Messenger`, `Instagram`, `VN B2C`, `US B2C`, `Total B2C`, `Meta Spend`, `Google Spend`, `Total chi phí MKT`, `Revenue B2C total`, `% chi phí MKT / revenue`, `Gross profit`, `Gross profit %`, `CM1 = Gross profit - Spend`, `(Gross profit - MKT) / revenue`, `Chi phí MKT`, `Leads`, `Khách mới`, `CAC / khách`, `Chi phí / Lead`, `Tỷ lệ chốt`, `VN Sales B2C`, `Web`, `App`, `Web VN`, `Total`, `Monthly budget`, `VN B2C Budget`, `US B2C Budget`, `Spend MTD`, `VN Spend MTD`, `US Spend MTD`, `Spend Pace`, `Spend Prorata`, `Doanh thu B2C`, `ROAS`, `% Chi phí/DT`, `Total Revenue`, `  - Web`, `  - App`, `Gross Profit`, `CM1`, `% CM1`, `Orders`, `AOV`, `Traffic`, `User`, `Customer`, `  Web`, `    New`, `    Returning`, `  App`, `Tuần này`, `Tháng này`, `Quý này`, `Năm nay`

## 4. Xuất file

Hàm: —

## 5. Thao tác ghi từ giao diện (1)

| ID | Phương thức | URL | Vị trí | Quyền / hiệu ứng | Kết quả QA |
|---|---|---|---|---|---|
| b2c-W01 | POST | `"/api/analytics/query"` | b2c-performance.tsx:148 |  |  |

## 6. Cổng quyền trong giao diện

_(không thấy)_
