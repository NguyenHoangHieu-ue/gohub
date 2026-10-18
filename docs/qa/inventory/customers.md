# Kiểm kê điều khiển: Customers

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/customers`
- Tệp quét (2): `app/(dashboard)/analytics/customers/page.tsx`, `components/date-presets.tsx`
- Dòng mã: 741
- Thành phần dùng chung (không quét sâu): `components/dashboard-kit.tsx`, `components/pager.tsx`
- Thư viện logic import: `lib/utils.ts`, `lib/analytics-formatters.ts`, `lib/export-excel.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (3):** `/api/analytics/customer/report`, `/api/config/partner-tiers`, `/api/customers`

**Bảng/nguồn nhắc trong mã giao diện:** —

**Cờ cache/làm mới:** —. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (7)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| customers-B01 | Clear All | `() => setSelectedCustomers([])` |  | page.tsx:204 |  |  |
| customers-B02 | Apply Filters | `fetchData` |  | page.tsx:287 |  |  |
| customers-B03 | Daily | `() => setPeriod("day")` |  | page.tsx:351 |  |  |
| customers-B04 | Weekly | `() => setPeriod("week")` |  | page.tsx:357 |  |  |
| customers-B05 | Monthly | `() => setPeriod("month")` |  | page.tsx:363 |  |  |
| customers-B06 | Export | `() => { // Xuất TẤT CẢ khách (bỏ strategic partners, không giới hạn phân trang) const all` |  | page.tsx:592 |  |  |
| customers-B07 | (icon) | `() => { const r = getPresetRange(p.key) onSelect(r.startDate, r.endDate) }` |  | date-presets.tsx:45 |  |  |

### 2.2 Ô nhập và hộp tích (3)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| customers-I01 | text «Search customers...» | `searchQuery` | `(e) => setSearchQuery(e.target.value)` | page.tsx:214 |  |  |
| customers-I02 | date | `startDate` | `(e) => setStartDate(e.target.value)` | page.tsx:270 |  |  |
| customers-I03 | date | `endDate` | `(e) => setEndDate(e.target.value)` | page.tsx:277 |  |  |

### 2.3 Danh sách chọn (1)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| customers-S01 |  | Nhanh… | `(e) => { if (!e.target.value) return const r = getPresetRange(e.target.value as` | date-presets.tsx:25 |  |  |

### 2.4 State điều khiển (19)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| startDate | `() => getDefaultDateRange().startDate` | page.tsx:57 |
| endDate | `() => getDefaultDateRange().endDate` | page.tsx:58 |
| kpis | `[]` | page.tsx:60 |
| trendData | `[]` | page.tsx:61 |
| performanceData | `[]` | page.tsx:62 |
| custPage | `1` | page.tsx:63 |
| tierDistribution | `[]` | page.tsx:65 |
| channelDistribution | `[]` | page.tsx:66 |
| productData | `[]` | page.tsx:67 |
| orderData | `[]` | page.tsx:68 |
| searchQuery | `""` | page.tsx:69 |
| customers | `[]` | page.tsx:70 |
| selectedCustomers | `[]` | page.tsx:71 |
| showCustomerDropdown | `false` | page.tsx:72 |
| searching | `false` | page.tsx:73 |
| loading | `true` | page.tsx:75 |
| error | `null` | page.tsx:76 |
| period | `"day"` | page.tsx:77 |
| dateColumn | `"fulfiled_date"` | page.tsx:78 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `Product`, `Qty`, `Revenue`, `Order Code`, `Customer Name`, `Date`, `Items`, `Amount`, `Partner Name`, `Margin %`, `Orders`, `Last Order`, `Customer`, `Tier`, `GP`, `GM%`, `CM1`, `CM1%`, `3HK%`

**Cột khai báo (label:):** `Tuần này`, `Tháng này`, `Quý này`, `Năm nay`

## 4. Xuất file

Hàm: `exportRawRows`

## 5. Thao tác ghi từ giao diện (1)

| ID | Phương thức | URL | Vị trí | Quyền / hiệu ứng | Kết quả QA |
|---|---|---|---|---|---|
| customers-W01 | POST | ``/api/analytics/customer/report`` | page.tsx:90 |  |  |

## 6. Cổng quyền trong giao diện

_(không thấy)_
