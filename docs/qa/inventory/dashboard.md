# Kiểm kê điều khiển: Dashboard

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics`
- Tệp quét (3): `app/(dashboard)/analytics/page.tsx`, `components/quarterly-report.tsx`, `components/date-presets.tsx`
- Dòng mã: 1202
- Thành phần dùng chung (không quét sâu): `components/dashboard-kit.tsx`
- Thư viện logic import: `lib/utils.ts`, `lib/analytics-formatters.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (12):** `/api/analytics/kpis`, `/api/analytics/revenue-chart`, `/api/analytics/region-chart`, `/api/analytics/performance-source`, `/api/analytics/performance-channel`, `/api/analytics/recent-orders`, `/api/analytics/targets-summary`, `/api/config/partner-tiers`, `/api/analytics/b2b/strategic-performance`, `/api/analytics/monthly-kpis`, `/api/analytics/b2b/tier-performance`, `/api/analytics/quarterly-report`

**Bảng/nguồn nhắc trong mã giao diện:** —

**Cờ cache/làm mới:** —. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (11)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| dashboard-B01 | Fulfillment | `() => setDateColumn("fulfiled_date")` |  | page.tsx:262 |  |  |
| dashboard-B02 | Created | `() => setDateColumn("created_date")` |  | page.tsx:263 |  |  |
| dashboard-B03 | Filters | `() => setShowFilters(!showFilters)` |  | page.tsx:269 |  |  |
| dashboard-B04 | (icon) | `() => setCompanyCode(t.code)` |  | page.tsx:279 |  |  |
| dashboard-B05 | Lọc | `() => fetchData()` |  | page.tsx:303 |  |  |
| dashboard-B06 | Reset | `() => { const today = new Date(); const yesterday = new Date(today); yesterday.setDate(yes` |  | page.tsx:305 |  |  |
| dashboard-B07 | (icon) | `() => setB2bRegion(r)` |  | page.tsx:603 |  |  |
| dashboard-B08 | (icon) | `() => setSelQ(q)` |  | quarterly-report.tsx:168 |  |  |
| dashboard-B09 | (icon) | `onClose` |  | quarterly-report.tsx:180 |  |  |
| dashboard-B10 | Xuất Excel | `exportExcel` |  | quarterly-report.tsx:268 |  |  |
| dashboard-B11 | (icon) | `() => { const r = getPresetRange(p.key) onSelect(r.startDate, r.endDate) }` |  | date-presets.tsx:45 |  |  |

### 2.2 Ô nhập và hộp tích (2)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| dashboard-I01 | date | `startDate` | `e => setStartDate(e.target.value)` | page.tsx:296 |  |  |
| dashboard-I02 | date | `endDate` | `e => setEndDate(e.target.value)` | page.tsx:300 |  |  |

### 2.3 Danh sách chọn (2)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| dashboard-S01 | `selYear` |  | `e => setSelYear(parseInt(e.target.value))` | quarterly-report.tsx:175 |  |  |
| dashboard-S02 |  | Nhanh… | `(e) => { if (!e.target.value) return const r = getPresetRange(e.target.value as` | date-presets.tsx:25 |  |  |

### 2.4 State điều khiển (25)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| kpis | `[]` | page.tsx:50 |
| prevMonthKpis | `[]` | page.tsx:51 |
| revenueData | `[]` | page.tsx:52 |
| regionData | `[]` | page.tsx:53 |
| performanceSource | `[]` | page.tsx:54 |
| performanceChannel | `[]` | page.tsx:55 |
| strategicPerformance | `[]` | page.tsx:56 |
| b2bTierData | `null` | page.tsx:58 |
| b2bRegion | `"ALL"` | page.tsx:59 |
| recentOrders | `[]` | page.tsx:60 |
| targetProgress | `null` | page.tsx:61 |
| isLoading | `true` | page.tsx:62 |
| error | `null` | page.tsx:63 |
| monthlyKpis | `null` | page.tsx:64 |
| startDate | `() => getDefaultDateRange().startDate` | page.tsx:66 |
| endDate | `() => getDefaultDateRange().endDate` | page.tsx:67 |
| dateColumn | `"fulfiled_date"` | page.tsx:68 |
| companyCode | `"ALL"` | page.tsx:69 |
| showFilters | `false` | page.tsx:70 |
| expandedGroups | `[]` | page.tsx:167 |
| selQ | ``Q${Math.ceil((today.getMonth() + 1) / 3)}`` | quarterly-report.tsx:94 |
| selYear | `today.getFullYear()` | quarterly-report.tsx:95 |
| report | `null` | quarterly-report.tsx:96 |
| loading | `false` | quarterly-report.tsx:97 |
| error | `null` | quarterly-report.tsx:98 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `Metric`, `/ {m.isProjected && (× ) }`, `Group`, `Total Order`, `Unit Sold`, `Gross Revenue`, `Doanh thu dự phóng`, `%MoM`, `Channel / Phân khúc`, `Tháng`, `Revenue`, `Gross Profit`, `GP%`, `Ch. Cost`, `CM1`, `CM1%`

**Cột khai báo (label:):** `All`, `VN`, `US`, `Last period`, `vs Last period`, `Projected Revenue`, `Projected Orders`, `Projected AOV`, `Projected Units`, `Revenue`, `Gross Profit`, `CM1`, `CM1 %`, `3HK Revenue`, `3HK %`, `Tuần này`, `Tháng này`, `Quý này`, `Năm nay`

## 4. Xuất file

Hàm: `exportExcel`

## 5. Thao tác ghi từ giao diện (0)

_(không có)_

## 6. Cổng quyền trong giao diện

_(không thấy)_
