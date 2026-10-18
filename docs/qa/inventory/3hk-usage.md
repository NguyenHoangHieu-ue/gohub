# Kiểm kê điều khiển: 3HK Data Usage

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/3hk-usage`
- Tệp quét (2): `app/(dashboard)/analytics/3hk-usage/page.tsx`, `components/date-presets.tsx`
- Dòng mã: 1859
- Thành phần dùng chung (không quét sâu): —
- Thư viện logic import: `lib/utils.ts`, `lib/analytics-formatters.ts`, `lib/export-excel.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (3):** `/api/analytics/3hk-sku-meta`, `/api/ncc/3hk-zones`, `/api/analytics/query`

**Bảng/nguồn nhắc trong mã giao diện:** `fact_data_usage`, `data_usage_log`, `ncc_3hk`, `dim_sku`

**SQL xây ở giao diện (gửi qua /api/analytics/query), cần đối chiếu từng truy vấn:** `app/(dashboard)/analytics/3hk-usage/page.tsx`

**Cờ cache/làm mới:** —. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (14)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| 3hk-usage-B01 | (icon) | `() => setActiveTab(tab)` |  | page.tsx:1080 |  |  |
| 3hk-usage-B02 | Lọc | `() => { setPage(1); setAppliedTick(t => t + 1) }` |  | page.tsx:1102 |  |  |
| 3hk-usage-B03 | (icon) | `() => { setPage(1); fetchTotals(); fetchSKUMetrics(); fetchSKUTypeMetrics(); fetchRecords(` |  | page.tsx:1105 |  |  |
| 3hk-usage-B04 | Export | `exportZoneCsv` | `zoneRows.length === 0` | page.tsx:1189 |  |  |
| 3hk-usage-B05 | Chi tiết ( ) | `() => setExpandedGroup(expanded ? null : sg.key)` |  | page.tsx:1406 |  |  |
| 3hk-usage-B06 | Chi tiết ( ) | `() => setOtherLengthExpanded(v => !v)` |  | page.tsx:1491 |  |  |
| 3hk-usage-B07 | Xuất bảng SKU theo từng tháng trong kỳ đang lọc: Tháng · SKU · Active | `exportMonthly` | `exportingMonthly // !startDate // !endDate` | page.tsx:1592 |  |  |
| 3hk-usage-B08 | (icon) | `() => setSkuPage(p => Math.max(1, p - 1))` | `skuPage === 1` | page.tsx:1662 |  |  |
| 3hk-usage-B09 | (icon) | `() => setSkuPage(p => Math.min(Math.ceil(sortedSkuMetrics.length / skuPageSize), p + 1))` | `skuPage >= Math.ceil(sortedSkuMetrics.length / skuPageSize)` | page.tsx:1667 |  |  |
| 3hk-usage-B10 | (icon) | `exportRecords` | `exportingRecords` | page.tsx:1679 |  |  |
| 3hk-usage-B11 | (icon) | `() => handlePageChange(Math.max(1, page - 1))` | `page === 1 // loading // loadingMore` | page.tsx:1763 |  |  |
| 3hk-usage-B12 | (icon) | `() => handlePageChange(pageNum)` |  | page.tsx:1780 |  |  |
| 3hk-usage-B13 | (icon) | `() => handlePageChange(page + 1)` | `page >= Math.ceil(totals.count / pageSize) // loading // loa` | page.tsx:1789 |  |  |
| 3hk-usage-B14 | (icon) | `() => { const r = getPresetRange(p.key) onSelect(r.startDate, r.endDate) }` |  | date-presets.tsx:45 |  |  |

### 2.2 Ô nhập và hộp tích (3)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| 3hk-usage-I01 | text «Search ICCID, Order Code...» | `searchTerm` | `(e) => setSearchTerm(e.target.value)` | page.tsx:1089 |  |  |
| 3hk-usage-I02 | date | `startDate` | `(e) => setStartDate(e.target.value)` | page.tsx:1095 |  |  |
| 3hk-usage-I03 | date | `endDate` | `(e) => setEndDate(e.target.value)` | page.tsx:1097 |  |  |

### 2.3 Danh sách chọn (1)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| 3hk-usage-S01 |  | Nhanh… | `(e) => { if (!e.target.value) return const r = getPresetRange(e.target.value as` | date-presets.tsx:25 |  |  |

### 2.4 State điều khiển (32)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| data | `[]` | page.tsx:249 |
| skuMetrics | `[]` | page.tsx:250 |
| skuMetricsTab | `"all"` | page.tsx:253 |
| skuTypeMetrics | `[]` | page.tsx:266 |
| loading | `false` | page.tsx:267 |
| loadingSKU | `false` | page.tsx:268 |
| loadingType | `false` | page.tsx:269 |
| loadingMore | `false` | page.tsx:270 |
| error | `null` | page.tsx:271 |
| searchTerm | `""` | page.tsx:272 |
| debouncedSearch | `""` | page.tsx:273 |
| page | `1` | page.tsx:274 |
| skuPage | `1` | page.tsx:275 |
| hasMore | `true` | page.tsx:277 |
| activeTab | `"all"` | page.tsx:280 |
| startDate | `""` | page.tsx:283 |
| endDate | `""` | page.tsx:284 |
| maxAvailableDate | `null` | page.tsx:287 |
| appliedTick | `0` | page.tsx:289 |
| sortConfig | `{ key: "first_report_date", direction: "desc" }` | page.tsx:290 |
| skuSort | `{ key: "total_usage_gb", direction: "desc" }` | page.tsx:292 |
| skuTypeSort | `{ key: "total_usage_gb", direction: "desc" }` | page.tsx:293 |
| totals | `{ totalUsage: 0, totalCapacity: 0, avgUsage: 0, count: 0 }` | page.tsx:295 |
| countryMonths | `[]` | page.tsx:324 |
| countryRows | `[]` | page.tsx:325 |
| loadingCountry | `false` | page.tsx:326 |
| countryError | `null` | page.tsx:327 |
| expandedGroup | `null` | page.tsx:591 |
| otherLengthExpanded | `false` | page.tsx:615 |
| exportingRecords | `false` | page.tsx:880 |
| exportingMonthly | `false` | page.tsx:920 |
| expandedZone | `null` | page.tsx:1036 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `Zone`, `Total`, `Run-rate 12M`, `setSkuTypeSort(prev => ( ))}>`, `Efficiency`, `Mã`, `Active SIMs`, `Total Plan (GB)`, `Total Actual (GB)`, `GB/ngày/SIM`, `Thực tế / Kế hoạch %`, `SKU`, `Kế hoạch (GB/ngày/SIM)`, `Avg. Usage %`, `setSkuSort(prev => ( ))}>`, `handleSort(col.key)}>`

**Cột khai báo (label:):** `Unlimited ${info.unliSpeed}Mbps`, `0–0.5`, `0.5–1`, `1–1.5`, `1.5–2`, `2–2.5`, `2.5–3`, `≥3`, `SKU Type`, `Active SIMs`, `Total Plan (GB)`, `Total Actual (GB)`, `Avg. Usage %`, `SKU`, `Order Code`, `ICCID`, `Product / SKU`, `First Usage`, `Plan (GB)`, `Actual (GB)`, `Usage %`, `Tuần này`, `Tháng này`, `Quý này`, `Năm nay`

## 4. Xuất file

Hàm: `exportRawRows`, `exportAOA`, `exportRecords`, `exportMonthly`, `exportZoneCsv`

## 5. Thao tác ghi từ giao diện (2)

| ID | Phương thức | URL | Vị trí | Quyền / hiệu ứng | Kết quả QA |
|---|---|---|---|---|---|
| 3hk-usage-W01 | POST | `"/api/analytics/3hk-sku-meta"` | page.tsx:306 |  |  |
| 3hk-usage-W02 | POST | `"/api/analytics/query"` | page.tsx:352 |  |  |

## 6. Cổng quyền trong giao diện

_(không thấy)_
