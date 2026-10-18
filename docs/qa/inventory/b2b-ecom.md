# Kiểm kê điều khiển: B2B — VN Ecom theo thời gian

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/b2b/ecom`
- Tệp quét (1): `app/(dashboard)/analytics/b2b/ecom/page.tsx`
- Dòng mã: 468
- Thành phần dùng chung (không quét sâu): `components/dashboard-kit.tsx`
- Thư viện logic import: `lib/utils.ts`, `lib/export-excel.ts`, `lib/b2b-ecom-timeline.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (1):** `/api/analytics/b2b/ecom-timeline`

**Bảng/nguồn nhắc trong mã giao diện:** —

**Cờ cache/làm mới:** fresh. **localStorage:** b2b-ecom-timeline

## 2. Điều khiển

### 2.1 Nút (7)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| b2b-ecom-B01 | (icon) | `() => onChange(it.key)` |  | page.tsx:64 |  |  |
| b2b-ecom-B02 | Kỳ trước | `onPrev` | `prevDisabled` | page.tsx:80 |  |  |
| b2b-ecom-B03 | Kỳ sau | `onNext` | `nextDisabled` | page.tsx:82 |  |  |
| b2b-ecom-B04 | Tải lại mới | `() => load(true)` | `loading` | page.tsx:256 |  |  |
| b2b-ecom-B05 | Export Excel | `doExport` | `loading // !totals` | page.tsx:260 |  |  |
| b2b-ecom-B06 | (icon) | `() => setCollapsed(allCollapsed ? new Set() : new Set(allCollapsible))` |  | page.tsx:361 |  |  |
| b2b-ecom-B07 | {canToggle ? : } | `() => toggle(r.id)` | `!canToggle` | page.tsx:399 |  |  |

### 2.2 Ô nhập và hộp tích (1)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| b2b-ecom-I01 | checkbox | `includeShip` | `e => setIncludeShip(e.target.checked)` | page.tsx:281 |  |  |

### 2.3 Danh sách chọn (0)

_(không có)_

### 2.4 State điều khiển (9)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| gran | `"month"` | page.tsx:101 |
| year | `init.y` | page.tsx:102 |
| month | `init.m` | page.tsx:103 |
| metric | `"revenue"` | page.tsx:104 |
| compact | `true` | page.tsx:105 |
| includeShip | `true` | page.tsx:106 |
| data | `null` | page.tsx:107 |
| loading | `true` | page.tsx:108 |
| error | `null` | page.tsx:109 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `Shop`, `Tổng kỳ`

**Cột khai báo (label:):** `Doanh thu`, `GP`, `CM1`, `Đơn hàng`, `Units`, `Tháng`, `Tuần`, `Quý`, `Est. cuối kỳ`, `Triệu`, `Đầy đủ`

## 4. Xuất file

Hàm: `exportAOA`

## 5. Thao tác ghi từ giao diện (0)

_(không có)_

## 6. Cổng quyền trong giao diện

_(không thấy)_
