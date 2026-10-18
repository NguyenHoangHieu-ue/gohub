# Kiểm kê điều khiển: Channels

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/channels`
- Tệp quét (4): `app/(dashboard)/analytics/channels/page.tsx`, `components/date-presets.tsx`, `components/cost-management-modal.tsx`, `components/channels/b2b-customer-detail.tsx`
- Dòng mã: 2655
- Thành phần dùng chung (không quét sâu): `components/dashboard-kit.tsx`, `components/toast.tsx`
- Thư viện logic import: `lib/utils.ts`, `lib/analytics-formatters.ts`, `lib/export-excel.ts`, `lib/use-role-guard.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (11):** `/api/analytics/query`, `/api/config/country-codes`, `/api/analytics/channels/b2b-customers`, `/api/channels`, `/api/analytics/channels/performance`, `/api/analytics/channels/kpis`, `/api/channel-costs`, `/api/channel-group-costs`, `/api/channel-cost-settings`, `/api/config/subchannels`, `/api/channel-group-costs/`

**Bảng/nguồn nhắc trong mã giao diện:** `dim_sku`, `dim_order_source`, `fact_fulfillment_revenue`, `dim_customer`, `fact_sales_revenue`

**SQL xây ở giao diện (gửi qua /api/analytics/query), cần đối chiếu từng truy vấn:** `app/(dashboard)/analytics/channels/page.tsx`, `components/channels/b2b-customer-detail.tsx`

**Cờ cache/làm mới:** —. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (34)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| channels-B01 | (icon) | `() => { setB2bTierFilter(t); setSelectedCustomer(null) }` |  | page.tsx:883 |  |  |
| channels-B02 | Filters | `() => setShowFilters(!showFilters)` |  | page.tsx:926 |  |  |
| channels-B03 | Làm mới dữ liệu kênh | `fetchChannelData` |  | page.tsx:938 |  |  |
| channels-B04 | Clear All | `(e) => { e.stopPropagation(); setSelectedVendors([]) }` |  | page.tsx:989 |  |  |
| channels-B05 | Clear All | `(e) => { e.stopPropagation(); setSelectedSubChannels([]) }` |  | page.tsx:1033 |  |  |
| channels-B06 | Clear All | `(e) => { e.stopPropagation(); setSelectedProductTypes([]) }` |  | page.tsx:1077 |  |  |
| channels-B07 | Fulfillment | `() => setDateColumn("fulfiled_date")` |  | page.tsx:1106 |  |  |
| channels-B08 | Created | `() => setDateColumn("created_date")` |  | page.tsx:1115 |  |  |
| channels-B09 | Reset All Filters | `() => { setStartDate("2026-03-01") setEndDate("2026-03-31") setComparisonType("none") setS` |  | page.tsx:1130 |  |  |
| channels-B10 | Apply Filters | `() => { fetchChannelData(); setShowFilters(false) }` |  | page.tsx:1150 |  |  |
| channels-B11 | ← Quay lại | `() => setSelectedCustomer(null)` |  | page.tsx:1169 |  |  |
| channels-B12 | Làm mới danh sách khách hàng B2B | `fetchB2BCustomers` |  | page.tsx:1186 |  |  |
| channels-B13 | {rev >= 1e9 ? `$ Tỷ` : `$ Tr`} KH · GP {gp >= 1e9 ? `$ T` : `$ Tr`} | `() => setB2bTierFilter(b2bTierFilter === tier ? "ALL" : tier)` |  | page.tsx:1213 |  |  |
| channels-B14 | Làm mới tổng hợp tất cả kênh | `fetchAllChannels` |  | page.tsx:1293 |  |  |
| channels-B15 | Export | `exportPerformanceBreakdown` |  | page.tsx:1487 |  |  |
| channels-B16 | Export | `exportDaily` |  | page.tsx:1678 |  |  |
| channels-B17 | Export | `exportTopProductsFull` |  | page.tsx:1746 |  |  |
| channels-B18 | (icon) | `() => setShowAllProducts(!showAllProducts)` |  | page.tsx:1826 |  |  |
| channels-B19 | (icon) | `() => { const r = getPresetRange(p.key) onSelect(r.startDate, r.endDate) }` |  | date-presets.tsx:45 |  |  |
| channels-B20 | Total Mode | `() => toggleSubchannelMode(chanName, "total")` |  | cost-management-modal.tsx:352 |  |  |
| channels-B21 | Sub-channel Mode | `() => toggleSubchannelMode(chanName, "subchannels")` |  | cost-management-modal.tsx:356 |  |  |
| channels-B22 | (icon) | `() => handleSaveCost(chanName)` | `savingCosts // !dirty` | cost-management-modal.tsx:363 |  |  |
| channels-B23 | (icon) | `onClose` |  | cost-management-modal.tsx:429 |  |  |
| channels-B24 | B2B Channels | `() => setActiveCostTab("b2b")` |  | cost-management-modal.tsx:439 |  |  |
| channels-B25 | B2C Channels | `() => setActiveCostTab("b2c")` |  | cost-management-modal.tsx:444 |  |  |
| channels-B26 | (icon) | `() => setActiveCostTab("group")` |  | cost-management-modal.tsx:449 |  |  |
| channels-B27 | {isTabDirty ? `Save All $ ` : "No Changes"} | `handleSaveAll` | `savingCosts // !isTabDirty` | cost-management-modal.tsx:458 |  |  |
| channels-B28 | Huỷ sửa | `() => { setNewGroupCost({ group_name: defaultGroup as "B2C" / "B2B", month: costMonth, ite` |  | cost-management-modal.tsx:486 |  |  |
| channels-B29 | (icon) | `handleSaveGroupCost` | `savingCosts` | cost-management-modal.tsx:538 |  |  |
| channels-B30 | Sửa | `() => handleEditGroupCost(cost)` |  | cost-management-modal.tsx:578 |  |  |
| channels-B31 | Xoá | `() => handleDeleteGroupCost(cost.id!)` |  | cost-management-modal.tsx:585 |  |  |
| channels-B32 | Huỷ | `() => setConfirmDeleteId(null)` |  | cost-management-modal.tsx:589 |  |  |
| channels-B33 | Xoá | `() => setConfirmDeleteId(cost.id // "")` |  | cost-management-modal.tsx:595 |  |  |
| channels-B34 | Switch to Total Mode | `() => toggleSubchannelMode(channel, "total")` |  | cost-management-modal.tsx:624 |  |  |

### 2.2 Ô nhập và hộp tích (7)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| channels-I01 | date | `startDate` | `(e) => setStartDate(e.target.value)` | page.tsx:954 |  |  |
| channels-I02 | date | `endDate` | `(e) => setEndDate(e.target.value)` | page.tsx:963 |  |  |
| channels-I03 | number «0» | `costs[cat]?.value ? costs[cat].value : ""` | `e => updateCost(chanName, cat, "value", e.target.value === "" ? 0 : (parseFloat(` | cost-management-modal.tsx:385 |  |  |
| channels-I04 | month | `costMonth` | `e => setCostMonth(e.target.value)` | cost-management-modal.tsx:423 |  |  |
| channels-I05 | text «VD: Marketing Campaign» | `newGroupCost.item_name` | `e => { setNewGroupCost(prev => ({ ...prev, item_name: e.target.value })); setGro` | cost-management-modal.tsx:506 |  |  |
| channels-I06 | number | `newGroupCost.amount // ""` | `e => { setNewGroupCost(prev => ({ ...prev, amount: parseFloat(e.target.value) //` | cost-management-modal.tsx:516 |  |  |
| channels-I07 | text «Tuỳ chọn...» | `newGroupCost.note` | `e => setNewGroupCost(prev => ({ ...prev, note: e.target.value }))` | cost-management-modal.tsx:525 |  |  |

### 2.3 Danh sách chọn (6)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| channels-S01 | `channelGroup` | All Groups · B2B · B2C | `(e) => { setChannelGroup(e.target.value as any) if (e.target.value !== "B2B") se` | page.tsx:866 |  |  |
| channels-S02 | `selectedChannel` | All Channels (Overview) | `(e) => setSelectedChannel(e.target.value)` | page.tsx:894 |  |  |
| channels-S03 | `comparisonType` | No Comparison · Compare: Prev Period · Compare: Prev Year | `(e: any) => setComparisonType(e.target.value)` | page.tsx:915 |  |  |
| channels-S04 |  | Nhanh… | `(e) => { if (!e.target.value) return const r = getPresetRange(e.target.value as` | date-presets.tsx:25 |  |  |
| channels-S05 | `costs[cat]?.type ?? "amount"` | VND · % | `e => updateCost(chanName, cat, "type", e.target.value)` | cost-management-modal.tsx:395 |  |  |
| channels-S06 | `newGroupCost.group_name` | B2B · B2C | `e => setNewGroupCost(prev => ({ ...prev, group_name: e.target.value as "B2C" / "` | cost-management-modal.tsx:495 |  |  |

### 2.4 State điều khiển (45)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| startDate | `() => getDefaultDateRange().startDate` | page.tsx:91 |
| endDate | `() => getDefaultDateRange().endDate` | page.tsx:92 |
| channelGroup | `"All"` | page.tsx:94 |
| b2bTier | `"All"` | page.tsx:95 |
| b2bCustomers | `[]` | page.tsx:96 |
| b2bTierFilter | `"ALL"` | page.tsx:97 |
| selectedCustomer | `null` | page.tsx:98 |
| loadingB2B | `false` | page.tsx:99 |
| channels | `[]` | page.tsx:102 |
| selectedChannel | `""` | page.tsx:103 |
| allChannelsData | `[]` | page.tsx:104 |
| loadingAll | `false` | page.tsx:105 |
| vendors | `[]` | page.tsx:106 |
| selectedVendors | `[]` | page.tsx:107 |
| loading | `false` | page.tsx:108 |
| metrics | `null` | page.tsx:109 |
| trendData | `[]` | page.tsx:110 |
| topProducts | `[]` | page.tsx:111 |
| showAllProducts | `false` | page.tsx:112 |
| productSortConfig | `{ key: "revenue", direction: "desc" }` | page.tsx:113 |
| performanceData | `[]` | page.tsx:114 |
| subChannels | `[]` | page.tsx:115 |
| selectedSubChannels | `[]` | page.tsx:116 |
| showSubChannelDropdown | `false` | page.tsx:117 |
| productTypes | `[]` | page.tsx:118 |
| selectedProductTypes | `[]` | page.tsx:119 |
| showProductTypeDropdown | `false` | page.tsx:120 |
| dateColumn | `"fulfiled_date"` | page.tsx:121 |
| showCostModal | `false` | page.tsx:122 |
| channelCostsMap | `{}` | page.tsx:124 |
| channelSettingsMap | `{}` | page.tsx:125 |
| showTotalCostBreakdown | `false` | page.tsx:126 |
| showFilters | `false` | page.tsx:274 |
| showVendorDropdown | `false` | page.tsx:275 |
| comparisonType | `"none"` | page.tsx:276 |
| costMonth | `initialMonth // new Date().toISOString().slice(0, 7)` | cost-management-modal.tsx:71 |
| groupCosts | `[]` | cost-management-modal.tsx:74 |
| newGroupCost | `{ ...BLANK_GROUP, month: costMonth }` | cost-management-modal.tsx:75 |
| groupFormError | `null` | cost-management-modal.tsx:76 |
| confirmDeleteId | `null` | cost-management-modal.tsx:77 |
| savingCosts | `false` | cost-management-modal.tsx:78 |
| activeCostTab | `scope === "b2c" ? "b2c" : "b2b"` | cost-management-modal.tsx:79 |
| vnEcomSubChannels | `[]` | cost-management-modal.tsx:80 |
| travelokaSubChannels | `[]` | cost-management-modal.tsx:81 |
| shopeepaySubChannels | `[]` | cost-management-modal.tsx:82 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `Khách hàng`, `Tier`, `Bảng giá`, `Revenue`, `GP`, `GP%`, `Orders`, `Units`, `Channel`, `Group`, `Margin%`, `CM1`, `CM1%`, `MoM`, `Sub-channel`, `Units Sold`, `Dự phóng Rev`, `Gross Profit`, `Dự phóng GP1`, `Contribution Margin 1`, `Dự phóng CM1`, `CM1 %`, `AOV`, `Contribution`, `Unit Sold`, `Product Name`, `Destination`, `Category`, `handleProductSort(col.key)} >`, `Kênh`, `SKU`, `Dest`

**Cột khai báo (label:):** `So sánh`, `Projected Revenue`, `Projected Orders`, `Projected AOV`, `Projected Units`, `Orders`, `Units Sold`, `Revenue`, `Gross Profit`, `Dự phóng`, `AOV`, `Tuần này`, `Tháng này`, `Quý này`, `Năm nay`

## 4. Xuất file

Hàm: `exportRawRows`, `exportPerformanceBreakdown`, `exportDaily`, `exportTopProductsFull`

## 5. Thao tác ghi từ giao diện (9)

| ID | Phương thức | URL | Vị trí | Quyền / hiệu ứng | Kết quả QA |
|---|---|---|---|---|---|
| channels-W01 | POST | `"/api/analytics/query"` | page.tsx:41 |  |  |
| channels-W02 | POST | `"/api/channel-cost-settings"` | cost-management-modal.tsx:152 |  |  |
| channels-W03 | POST | `"/api/channel-costs"` | cost-management-modal.tsx:199 |  |  |
| channels-W04 | POST | `"/api/channel-costs"` | cost-management-modal.tsx:214 |  |  |
| channels-W05 | POST | `"/api/channel-costs"` | cost-management-modal.tsx:251 |  |  |
| channels-W06 | POST | `"/api/channel-group-costs"` | cost-management-modal.tsx:290 |  |  |
| channels-W07 | DELETE | ``/api/channel-group-costs/${id}`` | cost-management-modal.tsx:319 |  |  |
| channels-W08 | POST | `"/api/analytics/query"` | b2b-customer-detail.tsx:22 |  |  |
| channels-W09 | POST | `"/api/analytics/query"` | b2b-customer-detail.tsx:35 |  |  |

## 6. Cổng quyền trong giao diện

- `page.tsx:15: import { useDbRole } from "@/lib/use-role-guard"`
- `page.tsx:123: const dbRole = useDbRole()   // ẩn "Manage Costs" — chỉ creator thấy (tạm thời)`
