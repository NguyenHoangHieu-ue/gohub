# Kiểm kê điều khiển: Product Catalogue

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/catalogue`
- Tệp quét (9): `app/(dashboard)/analytics/catalogue/page.tsx`, `components/catalogue/use-catalogue.ts`, `components/catalogue/country-home.tsx`, `components/catalogue/country-page.tsx`, `components/catalogue/vendor-view.tsx`, `components/catalogue/product-drawer.tsx`, `components/catalogue/unrecognized-notice.tsx`, `components/catalogue/catalogue-ui.tsx`, `components/catalogue/product-card.tsx`
- Dòng mã: 1109
- Thành phần dùng chung (không quét sâu): `components/dashboard-kit.tsx`
- Thư viện logic import: `lib/utils.ts`, `lib/catalogue/country-index.ts`, `lib/catalogue/auto-names.ts`, `lib/catalogue/types.ts`, `lib/catalogue/plain-language.ts`, `lib/catalogue/carriers.ts`, `lib/catalogue/filter-labels.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (2):** `/api/analytics/product-catalogue`, `/api/analytics/product-catalogue/`

**Bảng/nguồn nhắc trong mã giao diện:** —

**Cờ cache/làm mới:** nocache=1, fresh. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (19)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| catalogue-B01 | Tải lại | `async () => { setRefreshing(true); await reload(true); setRefreshing(false) }` | `loading // refreshing` | page.tsx:73 |  |  |
| catalogue-B02 | (icon) | `() => go({ tab: k === "country" ? null : k })` |  | page.tsx:119 |  |  |
| catalogue-B03 | gói · nhà cung cấp | `() => onPick(stat.code)` |  | country-home.tsx:14 |  |  |
| catalogue-B04 | Xoá | `() => setQuery("")` |  | country-home.tsx:60 |  |  |
| catalogue-B05 | (icon) | `() => onPick(s.code)` |  | country-home.tsx:69 |  |  |
| catalogue-B06 | Tất cả các nước | `onBack` |  | country-page.tsx:59 |  |  |
| catalogue-B07 | Clear filters | `() => setF({ sellableOnly: true, vendor: null, scope: null })` |  | country-page.tsx:123 |  |  |
| catalogue-B08 | Clear filters | `() => setF({ sellableOnly: true, vendor: null, scope: null })` |  | country-page.tsx:136 |  |  |
| catalogue-B09 | {expanded.has(g.vendorCode) ? "Thu gọn" : `Xem thêm $ gói của $ `} | `() => setExpanded(cur => { const n = new Set(cur); if (n.has(g.vendorCode)) n.delete(g.ven` |  | country-page.tsx:168 |  |  |
| catalogue-B10 | gói ( ) · phủ nước | `() => setOpen(isOpen ? null : v.code)` |  | vendor-view.tsx:41 |  |  |
| catalogue-B11 | (icon) | `() => onPick(c.code, v.code)` |  | vendor-view.tsx:53 |  |  |
| catalogue-B12 | Đóng | `onClose` |  | product-drawer.tsx:133 |  |  |
| catalogue-B13 | chi tiết từng gói ( ) | `() => setShowSkuTable(v => !v)` |  | product-drawer.tsx:176 |  |  |
| catalogue-B14 | Xem đủ nước | `() => setAllCountries(true)` |  | product-drawer.tsx:262 |  |  |
| catalogue-B15 | (icon) | `() => setShowTech(v => !v)` |  | product-drawer.tsx:284 |  |  |
| catalogue-B16 | Có giá trị mới trong dữ liệu sản phẩm chưa có tên chuẩn. Trang vẫn hiể | `() => setOpen(v => !v)` |  | unrecognized-notice.tsx:13 |  |  |
| catalogue-B17 | title | `onClick` |  | catalogue-ui.tsx:13 |  |  |
| catalogue-B18 | Sao chép | `async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout((` |  | catalogue-ui.tsx:48 |  |  |
| catalogue-B19 | {p.network && } {p.status !== "Active" && } {p.tenant && Pháp nhân } N | `onOpen` |  | product-card.tsx:28 |  |  |

### 2.2 Ô nhập và hộp tích (1)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| catalogue-I01 | text «Ví dụ: Nhật, Thái Lan, Mỹ, Pháp…» — {query && ( | `query` | `e => setQuery(e.target.value)` | country-home.tsx:54 |  |  |

### 2.3 Danh sách chọn (0)

_(không có)_

### 2.4 State điều khiển (16)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| refreshing | `false` | page.tsx:45 |
| data | `null` | use-catalogue.ts:8 |
| error | `null` | use-catalogue.ts:9 |
| loading | `true` | use-catalogue.ts:10 |
| detail | `null` | use-catalogue.ts:29 |
| error | `null` | use-catalogue.ts:30 |
| loading | `false` | use-catalogue.ts:31 |
| query | `""` | country-home.tsx:32 |
| f | `{ sellableOnly: true, vendor: initialVendor ?? null }` | country-page.tsx:26 |
| open | `null` | vendor-view.tsx:14 |
| showSkuTable | `false` | product-drawer.tsx:53 |
| showTech | `false` | product-drawer.tsx:54 |
| allCountries | `false` | product-drawer.tsx:95 |
| open | `false` | unrecognized-notice.tsx:10 |
| done | `false` | catalogue-ui.tsx:46 |
| failed | `false` | catalogue-ui.tsx:88 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `Dung lượng`, `Số ngày`, `Hết dung lượng thì sao?`, `Nghe gọi`, `Mã gói (SKU)`, `Giá vốn`

**Cột khai báo (label:):** —

## 4. Xuất file

Hàm: —

## 5. Thao tác ghi từ giao diện (0)

_(không có)_

## 6. Cổng quyền trong giao diện

- `page.tsx:58: const unrecognized = useMemo(() => (data && (role === "admin" || role === "creator") ? findUnrecognized(data) `
