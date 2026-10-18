# Kiểm kê điều khiển: Staff

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/staff`
- Tệp quét (2): `app/(dashboard)/analytics/staff/page.tsx`, `components/date-presets.tsx`
- Dòng mã: 1095
- Thành phần dùng chung (không quét sâu): `components/dashboard-kit.tsx`
- Thư viện logic import: `lib/analytics-formatters.ts`, `lib/export-excel.ts`, `lib/utils.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (5):** `/api/permissions`, `/api/channels`, `/api/analytics/staff-report`, `/api/analytics/staff-targets`, `/api/analytics/staff-report/customers`

**Bảng/nguồn nhắc trong mã giao diện:** —

**Cờ cache/làm mới:** —. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (10)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| staff-B01 | (icon) | `() => setDraft(d => ({ ...d, viewMode: m }))` |  | page.tsx:550 |  |  |
| staff-B02 | (icon) | `() => setDraft(d => ({ ...d, channelGroup: g, channel: "" }))` |  | page.tsx:576 |  |  |
| staff-B03 | {selectedCodes.length === 0 ? "All Sales" : selectedCodes.length === 1 | `() => setStaffDropOpen(v => !v)` |  | page.tsx:595 |  |  |
| staff-B04 | Apply Filters | `applyFilters` |  | page.tsx:642 |  |  |
| staff-B05 | Export All | `exportStaff` |  | page.tsx:652 |  |  |
| staff-B06 | Hủy | `cancelEdit` |  | page.tsx:764 |  |  |
| staff-B07 | (icon) | `saveTargets` | `!hasChanges // saving` | page.tsx:768 |  |  |
| staff-B08 | Sửa Target {isMultiMonth ? "(chọn 1 tháng)" : `tháng $ `} | `enterEdit` | `isMultiMonth` | page.tsx:782 |  |  |
| staff-B09 | Export KH | `() => exportCustomers(s.staff_name)` |  | page.tsx:930 |  |  |
| staff-B10 | (icon) | `() => { const r = getPresetRange(p.key) onSelect(r.startDate, r.endDate) }` |  | date-presets.tsx:45 |  |  |

### 2.2 Ô nhập và hộp tích (6)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| staff-I01 | text «0» — {isNeg && | `str` | `e => { setStr(e.target.value) const n = parseFloat(e.target.value) onChange(isNa` | page.tsx:122 |  |  |
| staff-I02 | date | `draft.startDate` | `e => setDraft(d => ({ ...d, startDate: e.target.value }))` | page.tsx:559 |  |  |
| staff-I03 | date | `draft.endDate` | `e => setDraft(d => ({ ...d, endDate: e.target.value }))` | page.tsx:563 |  |  |
| staff-I04 | text «Tìm sales...» | `staffSearch` | `e => setStaffSearch(e.target.value)` | page.tsx:613 |  |  |
| staff-I05 | checkbox | `selectedCodes.includes(s.staff_code)` | `() => setSelectedCodes(prev => prev.includes(s.staff_code) ? prev.filter(c => c` | page.tsx:620 |  |  |
| staff-I06 | checkbox | `val` | `e => set(e.target.checked)` | page.tsx:638 |  |  |

### 2.3 Danh sách chọn (3)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| staff-S01 | `draft.channel` | All Channels | `e => setDraft(d => ({ ...d, channel: e.target.value }))` | page.tsx:583 |  |  |
| staff-S02 | `draft.companyCode` | All Companies · VN · US | `e => setDraft(d => ({ ...d, companyCode: e.target.value }))` | page.tsx:588 |  |  |
| staff-S03 |  | Nhanh… | `(e) => { if (!e.target.value) return const r = getPresetRange(e.target.value as` | date-presets.tsx:25 |  |  |

### 2.4 State điều khiển (18)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| str | `draftVal ? String(draftVal) : ""` | page.tsx:113 |
| grantedWrite | `false` | page.tsx:175 |
| draft | `{ ...urlState }` | page.tsx:199 |
| applied | `{ ...urlState }` | page.tsx:200 |
| includeShip | `true` | page.tsx:205 |
| includeInternalOps | `true` | page.tsx:206 |
| channels | `[]` | page.tsx:207 |
| staffData | `[]` | page.tsx:208 |
| loading | `true` | page.tsx:209 |
| staffSearch | `""` | page.tsx:210 |
| selectedCodes | `[]` | page.tsx:211 |
| staffDropOpen | `false` | page.tsx:212 |
| expandedStaff | `null` | page.tsx:213 |
| customers | `[]` | page.tsx:214 |
| custLoading | `false` | page.tsx:215 |
| editMode | `false` | page.tsx:219 |
| saving | `false` | page.tsx:221 |
| saveError | `""` | page.tsx:222 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `CM1 Target`, `3HK Rev Target`, `Strategic`, `Non-strat.`

**Cột khai báo (label:):** `Tổng Revenue`, `3HK Revenue`, `Gross Profit`, `CM1`, `Sales`, `Khách hàng`, `Tuần này`, `Tháng này`, `Quý này`, `Năm nay`

## 4. Xuất file

Hàm: `exportRawRows`, `exportStaff`, `exportCustomers`

## 5. Thao tác ghi từ giao diện (1)

| ID | Phương thức | URL | Vị trí | Quyền / hiệu ứng | Kết quả QA |
|---|---|---|---|---|---|
| staff-W01 | PATCH | `"/api/analytics/staff-targets"` | page.tsx:312 |  |  |

## 6. Cổng quyền trong giao diện

- `page.tsx:176: const canWrite = status === "authenticated" && (roleCanWrite || grantedWrite)`
- `page.tsx:186: const cfg = JSON.parse(d.perms["permissions.writable_tabs"] ?? "{}") as Record<string, string[]>`
- `page.tsx:781: ) : canWrite ? (`
