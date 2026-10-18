# Kiểm kê điều khiển: Website Analytics

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/website`
- Tệp quét (2): `app/(dashboard)/analytics/website/page.tsx`, `components/date-presets.tsx`
- Dòng mã: 1109
- Thành phần dùng chung (không quét sâu): `components/dashboard-kit.tsx`
- Thư viện logic import: `lib/utils.ts`, `lib/analytics-formatters.ts`, `lib/export-excel.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (3):** `/api/config/ga4`, `/api/analytics/ga4`, `/api/analytics/gsc`

**Bảng/nguồn nhắc trong mã giao diện:** —

**Cờ cache/làm mới:** —. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (8)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| website-B01 | Go to Settings | `() => { window.location.href = "/admin" }` |  | page.tsx:536 |  |  |
| website-B02 | Đi tới Cài đặt | `() => { window.location.href = "/admin" }` |  | page.tsx:554 |  |  |
| website-B03 | Web | `() => switchPlatform("web")` |  | page.tsx:576 |  |  |
| website-B04 | App | `() => switchPlatform("app")` |  | page.tsx:583 |  |  |
| website-B05 | Lọc | `() => fetchAnalytics()` |  | page.tsx:626 |  |  |
| website-B06 | Làm mới dữ liệu | `fetchAnalytics` | `loading` | page.tsx:628 |  |  |
| website-B07 | Export | `exportEsimDestinations` | `esimDestinations.length === 0` | page.tsx:914 |  |  |
| website-B08 | (icon) | `() => { const r = getPresetRange(p.key) onSelect(r.startDate, r.endDate) }` |  | date-presets.tsx:45 |  |  |

### 2.2 Ô nhập và hộp tích (5)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| website-I01 | checkbox | `compareEnabled` | `() => setCompareEnabled(!compareEnabled)` | page.tsx:610 |  |  |
| website-I02 | date | `dateRange.startDate` | `(e) => setDateRange({ ...dateRange, startDate: e.target.value })` | page.tsx:619 |  |  |
| website-I03 | date | `dateRange.endDate` | `(e) => setDateRange({ ...dateRange, endDate: e.target.value })` | page.tsx:621 |  |  |
| website-I04 | date | `compareRange.startDate` | `(e) => setCompareRange({ ...compareRange, startDate: e.target.value })` | page.tsx:636 |  |  |
| website-I05 | date | `compareRange.endDate` | `(e) => setCompareRange({ ...compareRange, endDate: e.target.value })` | page.tsx:638 |  |  |

### 2.3 Danh sách chọn (2)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| website-S01 | `selectedSiteId` |  | `(e) => setSelectedSiteId(e.target.value)` | page.tsx:598 |  |  |
| website-S02 |  | Nhanh… | `(e) => { if (!e.target.value) return const r = getPresetRange(e.target.value as` | date-presets.tsx:25 |  |  |

### 2.4 State điều khiển (26)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| loading | `true` | page.tsx:44 |
| loadingSites | `true` | page.tsx:45 |
| error | `null` | page.tsx:46 |
| gscError | `null` | page.tsx:47 |
| sites | `[]` | page.tsx:48 |
| selectedSiteId | `""` | page.tsx:49 |
| generalData | `null` | page.tsx:50 |
| ecommerceData | `null` | page.tsx:51 |
| topProducts | `null` | page.tsx:52 |
| topCountries | `null` | page.tsx:53 |
| trafficSources | `null` | page.tsx:54 |
| esimPages | `null` | page.tsx:55 |
| searchConsoleData | `null` | page.tsx:56 |
| compareGeneralData | `null` | page.tsx:57 |
| compareEcommerceData | `null` | page.tsx:58 |
| compareSearchConsoleData | `null` | page.tsx:59 |
| compareTopProducts | `null` | page.tsx:60 |
| compareTopCountries | `null` | page.tsx:61 |
| compareTrafficSources | `null` | page.tsx:62 |
| compareEsimPages | `null` | page.tsx:63 |
| compareTopSearchQueries | `null` | page.tsx:64 |
| topSearchQueries | `null` | page.tsx:65 |
| dateRange | `() => getDefaultDateRange()` | page.tsx:66 |
| compareEnabled | `false` | page.tsx:67 |
| compareRange | `() => { const defaultDate = getDefaultDateRange() const end` | page.tsx:68 |
| platform | `"web"` | page.tsx:80 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `Query`, `Clicks`, `Impressions`, `CTR`, `Avg. Position`, `Destination`, `Views`, `Purchases`, `Conv. Rate`, `Product Purchased`, `Product Name`

**Cột khai báo (label:):** `Sessions`, `Purchases`, `Search Clicks`, `Avg. CTR`, `Revenue`, `So sánh`, `Tuần này`, `Tháng này`, `Quý này`, `Năm nay`

## 4. Xuất file

Hàm: `exportRawRows`, `exportEsimDestinations`

## 5. Thao tác ghi từ giao diện (0)

_(không có)_

## 6. Cổng quyền trong giao diện

_(không thấy)_
