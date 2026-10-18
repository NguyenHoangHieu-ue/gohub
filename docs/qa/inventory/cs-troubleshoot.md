# Kiểm kê điều khiển: CS Troubleshoot

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/cs-troubleshoot`
- Tệp quét (2): `app/(dashboard)/analytics/cs-troubleshoot/page.tsx`, `components/date-presets.tsx`
- Dòng mã: 664
- Thành phần dùng chung (không quét sâu): `components/toast.tsx`, `components/dashboard-kit.tsx`
- Thư viện logic import: `lib/utils.ts`, `lib/analytics-formatters.ts`, `lib/export-excel.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (2):** `/api/reports/cs-troubleshoot`, `/api/admin/sync-lark-tickets`

**Bảng/nguồn nhắc trong mã giao diện:** —

**Cờ cache/làm mới:** —. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (11)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| cs-troubleshoot-B01 | Retry | `() => fetchData()` |  | page.tsx:121 |  |  |
| cs-troubleshoot-B02 | Lọc | `() => fetchData()` |  | page.tsx:147 |  |  |
| cs-troubleshoot-B03 | (icon) | `fetchData` |  | page.tsx:154 |  |  |
| cs-troubleshoot-B04 | (icon) | `syncLarkData` | `syncing` | page.tsx:157 |  |  |
| cs-troubleshoot-B05 | (icon) | `() => setActiveTab(tab.id as any)` |  | page.tsx:173 |  |  |
| cs-troubleshoot-B06 | Export | `exportSkuPerformance` | `sorted.length === 0` | page.tsx:379 |  |  |
| cs-troubleshoot-B07 | (icon) |  |  | page.tsx:412 |  |  |
| cs-troubleshoot-B08 | (icon) |  |  | page.tsx:463 |  |  |
| cs-troubleshoot-B09 | (icon) |  |  | page.tsx:512 |  |  |
| cs-troubleshoot-B10 | (icon) |  |  | page.tsx:548 |  |  |
| cs-troubleshoot-B11 | (icon) | `() => { const r = getPresetRange(p.key) onSelect(r.startDate, r.endDate) }` |  | date-presets.tsx:45 |  |  |

### 2.2 Ô nhập và hộp tích (2)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| cs-troubleshoot-I01 | date | `dateRange.start` | `e => setDateRange(prev => ({ ...prev, start: e.target.value }))` | page.tsx:142 |  |  |
| cs-troubleshoot-I02 | date | `dateRange.end` | `e => setDateRange(prev => ({ ...prev, end: e.target.value }))` | page.tsx:144 |  |  |

### 2.3 Danh sách chọn (2)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| cs-troubleshoot-S01 | `channelGroup` | All Channels · B2B Performance · B2C Performance | `e => setChannelGroup(e.target.value)` | page.tsx:149 |  |  |
| cs-troubleshoot-S02 |  | Nhanh… | `(e) => { if (!e.target.value) return const r = getPresetRange(e.target.value as` | date-presets.tsx:25 |  |  |

### 2.4 State điều khiển (12)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| data | `null` | page.tsx:48 |
| loading | `true` | page.tsx:49 |
| syncing | `false` | page.tsx:50 |
| error | `null` | page.tsx:51 |
| activeTab | `"tbs"` | page.tsx:52 |
| dateRange | `() => { const defaultRange = getDefaultDateRange() return {` | page.tsx:58 |
| channelGroup | `"All"` | page.tsx:62 |
| sortConfig | `{ key: defaultKey, direction: "desc" }` | page.tsx:349 |
| expandedSku | `null` | page.tsx:362 |
| expanded | `null` | page.tsx:427 |
| expandedRow | `null` | page.tsx:478 |
| expandedGroup | `null` | page.tsx:479 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `handleSort(key)}>`, `Action`, `Detail`, `Group`, `Units Sold`, `TBS Volume`, `TBS Rate (%)`, `Refunds`, `Rf Rate (%)`, `Ticket ID`, `Order No`, `Issue/Reason`

**Cột khai báo (label:):** `CS_ Troubleshoot`, `CS_ SKU Performance`, `CS_ Vendor Performance`, `CS_ Source Performance`, `CS_ Invalid`, `Units Sold`, `TBS Tickets`, `TBS Rate`, `Avg Handle Time`, `Tuần này`, `Tháng này`, `Quý này`, `Năm nay`

## 4. Xuất file

Hàm: `exportRawRows`, `exportSkuPerformance`

## 5. Thao tác ghi từ giao diện (1)

| ID | Phương thức | URL | Vị trí | Quyền / hiệu ứng | Kết quả QA |
|---|---|---|---|---|---|
| cs-troubleshoot-W01 | POST | `"/api/admin/sync-lark-tickets"` | page.tsx:83 |  |  |

## 6. Cổng quyền trong giao diện

_(không thấy)_
