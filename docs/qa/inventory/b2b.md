# Kiểm kê điều khiển: B2B

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/b2b`
- Tệp quét (2): `app/(dashboard)/analytics/b2b/page.tsx`, `components/date-presets.tsx`
- Dòng mã: 1316
- Thành phần dùng chung (không quét sâu): `components/dashboard-kit.tsx`
- Thư viện logic import: `lib/utils.ts`, `lib/export-excel.ts`, `lib/analytics-engine/projection.ts`, `lib/analytics-formatters.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (9):** `/api/analytics/b2b/ecom-costs`, `/api/analytics/b2b/kpis`, `/api/analytics/b2b/performance`, `/api/analytics/b2b/strategic-performance`, `/api/analytics/b2b/trend`, `/api/analytics/channels-with-platform-fee`, `/api/config/partner-tiers`, `/api/analytics/quarterly-settings`, `/api/analytics/b2b/ecom-breakdown`

**Bảng/nguồn nhắc trong mã giao diện:** —

**Cờ cache/làm mới:** fresh, nocache=1. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (19)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| b2b-B01 | Fulfillment | `() => setDateColumn("fulfiled_date")` |  | page.tsx:409 |  |  |
| b2b-B02 | Created | `() => setDateColumn("created_date")` |  | page.tsx:410 |  |  |
| b2b-B03 | Apply Filters | `() => fetchData()` |  | page.tsx:421 |  |  |
| b2b-B04 | Tải lại mới | `() => fetchData(true)` | `loading` | page.tsx:427 |  |  |
| b2b-B05 | (icon) | `exportToPDF` | `exporting` | page.tsx:431 |  |  |
| b2b-B06 | (icon) | `() => setGranularity(g)` |  | page.tsx:512 |  |  |
| b2b-B07 | Export | `() => { const columns: { label: string; key: string }[] = [{ label: "Partner", key: "name"` |  | page.tsx:548 |  |  |
| b2b-B08 | (icon) | `() => setTierSearch("")` |  | page.tsx:715 |  |  |
| b2b-B09 | Excel | `() => { const nonStrategic = getFilteredOtherTiers() const classifyTierForExport = (pln?:` |  | page.tsx:720 |  |  |
| b2b-B10 | Export | `() => { const columns = [ { label: "Customer", key: "customer" }, { label: "Shop", key: "s` |  | page.tsx:1003 |  |  |
| b2b-B11 | Cost | `() => openEcomCostModal(c.name, "", "", c.name)` |  | page.tsx:1048 |  |  |
| b2b-B12 | Cost | `() => openEcomCostModal(c.name, s.name, "", `${c.name} · ${s.name}`)` |  | page.tsx:1081 |  |  |
| b2b-B13 | Cost | `() => openEcomCostModal(c.name, s.name, sub.name, `${c.name} · ${s.name} · ${sub.name}`)` |  | page.tsx:1113 |  |  |
| b2b-B14 | (icon) | `closeEcomCostModal` |  | page.tsx:1194 |  |  |
| b2b-B15 | + Thêm | `() => addEcomLine(m)` |  | page.tsx:1210 |  |  |
| b2b-B16 | (icon) | `() => removeEcomLine(m, idx)` |  | page.tsx:1225 |  |  |
| b2b-B17 | Hủy | `closeEcomCostModal` |  | page.tsx:1240 |  |  |
| b2b-B18 | (icon) | `saveEcomCost` | `savingEcomCost // ecomCostLoading // ecomMonths.length === 0` | page.tsx:1241 |  |  |
| b2b-B19 | (icon) | `() => { const r = getPresetRange(p.key) onSelect(r.startDate, r.endDate) }` |  | date-presets.tsx:45 |  |  |

### 2.2 Ô nhập và hộp tích (6)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| b2b-I01 | date | `startDate` | `e => setStartDate(e.target.value)` | page.tsx:402 |  |  |
| b2b-I02 | date | `endDate` | `e => setEndDate(e.target.value)` | page.tsx:404 |  |  |
| b2b-I03 | checkbox | `val` | `e => set(e.target.checked)` | page.tsx:416 |  |  |
| b2b-I04 | text «Tìm khách hàng...» — {tierSearch && ( | `tierSearch` | `e => setTierSearch(e.target.value)` | page.tsx:707 |  |  |
| b2b-I05 | text «Ghi chú» | `l.label // ""` | `e => setEcomLine(m, idx, { label: e.target.value })` | page.tsx:1216 |  |  |
| b2b-I06 | number «0» | `l.value // ""` | `e => setEcomLine(m, idx, { value: parseFloat(e.target.value) // 0 })` | page.tsx:1223 |  |  |

### 2.3 Danh sách chọn (2)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| b2b-S01 | `l.type` | đ · % | `e => setEcomLine(m, idx, { type: e.target.value as "amount" / "percent" })` | page.tsx:1218 |  |  |
| b2b-S02 |  | Nhanh… | `(e) => { if (!e.target.value) return const r = getPresetRange(e.target.value as` | date-presets.tsx:25 |  |  |

### 2.4 State điều khiển (23)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| startDate | `() => getDefaultDateRange().startDate` | page.tsx:79 |
| endDate | `() => getDefaultDateRange().endDate` | page.tsx:80 |
| loading | `true` | page.tsx:82 |
| error | `null` | page.tsx:83 |
| dateColumn | `"fulfiled_date"` | page.tsx:84 |
| granularity | `"week"` | page.tsx:85 |
| includeShip | `true` | page.tsx:86 |
| includeInternalOps | `true` | page.tsx:87 |
| includeOpsCustomers | `true` | page.tsx:88 |
| expandedRow | `null` | page.tsx:90 |
| combinedKpis | `[]` | page.tsx:92 |
| trendData | `[]` | page.tsx:93 |
| wholesaleCustomers | `[]` | page.tsx:94 |
| strategicPerformance | `[]` | page.tsx:95 |
| channelsWithPlatformFee | `[]` | page.tsx:97 |
| ecomBreakdown | `[]` | page.tsx:98 |
| ecomCostTarget | `null` | page.tsx:100 |
| savingEcomCost | `false` | page.tsx:102 |
| ecomCostError | `null` | page.tsx:103 |
| ecomCostLoading | `false` | page.tsx:104 |
| wholesaleSort | `{ key: "revenue", direction: "desc" }` | page.tsx:106 |
| tierSearch | `""` | page.tsx:107 |
| exporting | `false` | page.tsx:121 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `Partner`, `Revenue`, `Units`, `GP`, `Margin %`, `CM1`, `CM1 %`, `Shop`, `Orders`, `CH.Cost`

**Cột khai báo (label:):** `B2B Revenue`, `Gross Profit`, `CM1`, `B2B Margin %`, `B2B CM1 %`, `vs Prev Period`, `Partner`, `Tier`, `Revenue`, `Projected Revenue`, `Projected GP`, `Projected CM1`, `Units`, `GP`, `Margin %`, `CM1 %`, `Customer Name`, `Units Sold`, `Customer`, `Shop`, `Sub-shop`, `Orders`, `CH.Cost`, `Tuần này`, `Tháng này`, `Quý này`, `Năm nay`

## 4. Xuất file

Hàm: `exportWithDateRange`, `exportToExcel`, `exportToCSV`, `exportToPDF`, `exportData`, `exportRows`

## 5. Thao tác ghi từ giao diện (1)

| ID | Phương thức | URL | Vị trí | Quyền / hiệu ứng | Kết quả QA |
|---|---|---|---|---|---|
| b2b-W01 | POST | ``/api/analytics/b2b/ecom-costs`` | page.tsx:172 |  |  |

## 6. Cổng quyền trong giao diện

_(không thấy)_
