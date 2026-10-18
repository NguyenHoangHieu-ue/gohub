# Kiểm kê điều khiển: All-Time Report

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/all-time`
- Tệp quét (2): `app/(dashboard)/analytics/all-time/page.tsx`, `components/date-presets.tsx`
- Dòng mã: 451
- Thành phần dùng chung (không quét sâu): `components/dashboard-kit.tsx`
- Thư viện logic import: `lib/analytics-formatters.ts`, `lib/utils.ts`, `lib/export-excel.ts`, `lib/all-time-kpi.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (2):** `/api/channels`, `/api/analytics/all-time-performance`

**Bảng/nguồn nhắc trong mã giao diện:** —

**Cờ cache/làm mới:** —. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (11)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| all-time-B01 | Retry Loading | `() => window.location.reload()` |  | page.tsx:179 |  |  |
| all-time-B02 | Monthly | `() => setActiveView("monthly")` |  | page.tsx:198 |  |  |
| all-time-B03 | Quarterly | `() => setActiveView("quarterly")` |  | page.tsx:199 |  |  |
| all-time-B04 | Filters | `() => setShowFilters(!showFilters)` |  | page.tsx:201 |  |  |
| all-time-B05 | Export | `handleExport` |  | page.tsx:204 |  |  |
| all-time-B06 | Reset Filters | `() => { setSelectedChannelGroup(""); setSelectedCustomerTier(""); setSelectedChannel("");` |  | page.tsx:266 |  |  |
| all-time-B07 | Apply Filters | `() => { fetchData(); setShowFilters(false) }` |  | page.tsx:274 |  |  |
| all-time-B08 | Total Revenue | `() => setMetricView("revenue")` |  | page.tsx:281 |  |  |
| all-time-B09 | Avg. GPM % % | `() => setMetricView("gpm")` |  | page.tsx:288 |  |  |
| all-time-B10 | Avg. CM1 % % | `() => setMetricView("gpm2")` |  | page.tsx:295 |  |  |
| all-time-B11 | (icon) | `() => { const r = getPresetRange(p.key) onSelect(r.startDate, r.endDate) }` |  | date-presets.tsx:45 |  |  |

### 2.2 Ô nhập và hộp tích (3)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| all-time-I01 | date | `startDate` | `e => setStartDate(e.target.value)` | page.tsx:219 |  |  |
| all-time-I02 | date | `endDate` | `e => setEndDate(e.target.value)` | page.tsx:226 |  |  |
| all-time-I03 | checkbox | `val` | `e => set(e.target.checked)` | page.tsx:269 |  |  |

### 2.3 Danh sách chọn (4)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| all-time-S01 | `selectedChannelGroup` | All Groups · B2B · B2C | `e => setSelectedChannelGroup(e.target.value)` | page.tsx:233 |  |  |
| all-time-S02 | `selectedCustomerTier` | All Tiers · Strategic · Non-strategic | `e => setSelectedCustomerTier(e.target.value)` | page.tsx:245 |  |  |
| all-time-S03 | `selectedChannel` | All Channels | `e => setSelectedChannel(e.target.value)` | page.tsx:257 |  |  |
| all-time-S04 |  | Nhanh… | `(e) => { if (!e.target.value) return const r = getPresetRange(e.target.value as` | date-presets.tsx:25 |  |  |

### 2.4 State điều khiển (14)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| data | `null` | page.tsx:39 |
| loading | `true` | page.tsx:40 |
| error | `null` | page.tsx:41 |
| activeView | `"monthly"` | page.tsx:42 |
| metricView | `"revenue"` | page.tsx:43 |
| startDate | `() => getDefaultDateRange().startDate` | page.tsx:44 |
| endDate | `() => getDefaultDateRange().endDate` | page.tsx:45 |
| channels | `[]` | page.tsx:47 |
| selectedChannel | `""` | page.tsx:48 |
| selectedChannelGroup | `""` | page.tsx:49 |
| selectedCustomerTier | `""` | page.tsx:50 |
| showFilters | `false` | page.tsx:51 |
| includeShip | `true` | page.tsx:52 |
| includeInternalOps | `true` | page.tsx:53 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `Period`, `B2B Strategic`, `B2B Non-Strategic`, `B2C Performance`, `Total Revenue`

**Cột khai báo (label:):** `Tuần này`, `Tháng này`, `Quý này`, `Năm nay`

## 4. Xuất file

Hàm: `exportRawRows`

## 5. Thao tác ghi từ giao diện (0)

_(không có)_

## 6. Cổng quyền trong giao diện

_(không thấy)_
