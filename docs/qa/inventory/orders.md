# Kiểm kê điều khiển: Orders

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/orders`
- Tệp quét (1): `app/(dashboard)/analytics/orders/page.tsx`
- Dòng mã: 634
- Thành phần dùng chung (không quét sâu): `components/dashboard-kit.tsx`
- Thư viện logic import: `lib/export-excel.ts`, `lib/analytics-formatters.ts`, `lib/utils.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (5):** `/api/analytics/quarterly-settings`, `/api/staff`, `/api/channels`, `/api/order-sources`, `/api/analytics/order-report`

**Bảng/nguồn nhắc trong mã giao diện:** `fact_sales_revenue`, `fact_fulfillment_revenue`

**Cờ cache/làm mới:** —. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (8)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| orders-B01 | (icon) | `handleExport` | `exporting // rows.length === 0` | page.tsx:325 |  |  |
| orders-B02 | (icon) | `() => setCompanyCode(code)` |  | page.tsx:345 |  |  |
| orders-B03 | (icon) | `() => setDateMode(m)` |  | page.tsx:364 |  |  |
| orders-B04 | Apply | `() => doFetch(1)` |  | page.tsx:470 |  |  |
| orders-B05 | (icon) | `() => setSearch("")` |  | page.tsx:484 |  |  |
| orders-B06 | (icon) | `() => doFetch(page - 1)` | `page <= 1` | page.tsx:601 |  |  |
| orders-B07 | (icon) | `() => doFetch(pg)` |  | page.tsx:609 |  |  |
| orders-B08 | (icon) | `() => doFetch(page + 1)` | `page >= totalPages` | page.tsx:618 |  |  |

### 2.2 Ô nhập và hộp tích (4)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| orders-I01 | date | `singleDate` | `e => setSingleDate(e.target.value)` | page.tsx:378 |  |  |
| orders-I02 | date | `startDate` | `e => setStartDate(e.target.value)` | page.tsx:387 |  |  |
| orders-I03 | date | `endDate` | `e => setEndDate(e.target.value)` | page.tsx:393 |  |  |
| orders-I04 | text «Search order ID, customer, PIC...» — {search && ( | `search` | `e => setSearch(e.target.value)` | page.tsx:479 |  |  |

### 2.3 Danh sách chọn (7)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| orders-S01 | `dataSource` | Fulfilled · Created | `e => setDataSource(e.target.value)` | page.tsx:401 |  |  |
| orders-S02 | `includeShip ? "yes" : "no"` | No · Yes | `e => setIncludeShip(e.target.value === "yes")` | page.tsx:413 |  |  |
| orders-S03 | `includeInternalOps ? "yes" : "no"` | No · Yes | `e => setIncludeInternalOps(e.target.value === "yes")` | page.tsx:425 |  |  |
| orders-S04 | `channelGroup` | All groups · B2B · B2C | `e => { setChannelGroup(e.target.value); setChannel("") }` | page.tsx:439 |  |  |
| orders-S05 | `channel` | All channels | `e => setChannel(e.target.value)` | page.tsx:448 |  |  |
| orders-S06 | `staffCode` | All PIC | `e => setStaffCode(e.target.value)` | page.tsx:456 |  |  |
| orders-S07 | `orderSource` | All sources | `e => setOrderSource(e.target.value)` | page.tsx:464 |  |  |

### 2.4 State điều khiển (24)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| singleDate | `""` | page.tsx:97 |
| startDate | `""` | page.tsx:98 |
| endDate | `""` | page.tsx:99 |
| dateMode | `"range"` | page.tsx:100 |
| dataSource | `"fulfilled"` | page.tsx:101 |
| companyCode | `""` | page.tsx:104 |
| includeShip | `true` | page.tsx:105 |
| includeInternalOps | `true` | page.tsx:106 |
| staffCode | `""` | page.tsx:107 |
| channelGroup | `""` | page.tsx:108 |
| channel | `""` | page.tsx:109 |
| orderSource | `""` | page.tsx:110 |
| search | `""` | page.tsx:111 |
| page | `1` | page.tsx:112 |
| rows | `[]` | page.tsx:115 |
| total | `0` | page.tsx:116 |
| sumRevenue | `0` | page.tsx:117 |
| sumGp | `0` | page.tsx:118 |
| sumQty | `0` | page.tsx:119 |
| loading | `false` | page.tsx:120 |
| exporting | `false` | page.tsx:121 |
| staffList | `[]` | page.tsx:125 |
| channelList | `[]` | page.tsx:126 |
| orderSrcList | `[]` | page.tsx:127 |

## 3. Bảng và cột

**Tiêu đề cột (th):** —

**Cột khai báo (label:):** `VN`, `US`, `SG`, `HK`, `Date`, `Entity`, `PIC`, `Order Name`, `Customer`, `Order ID`, `Type`, `Channel`, `Qty`, `Unit Price`, `Revenue (VND)`, `GP (VND)`, `Tier`, `All`, `🇻🇳 VN`, `🇺🇸 US`, `Total Orders`, `Total Revenue`, `Gross Profit`

## 4. Xuất file

Hàm: `exportToExcel`, `exportRows`

## 5. Thao tác ghi từ giao diện (0)

_(không có)_

## 6. Cổng quyền trong giao diện

_(không thấy)_
