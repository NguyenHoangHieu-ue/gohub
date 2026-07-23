---
title: "Quarter Report (Báo Cáo CM1 Theo Quý)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, quarterly, cm1, target, qoq]
created: 2026-07-21
updated: 2026-07-24
status: active
---

# Quarter Report (Báo Cáo CM1 Theo Quý)

Tab riêng dưới Dashboard (tách khỏi modal "Báo cáo Quý" cũ). Báo cáo hiệu suất Revenue / Gross Margin / **CM1** theo quý, tách B2B + B2C, có **nhập & so sánh Target quý**, pro-rata cho tháng hiện tại. Thiết kế port từ `gohub-report/` (gohub.py + code.html).

---

## 1. Đường dẫn & File
| | |
|---|---|
| Trang | `web/src/app/(dashboard)/analytics/quarterly/page.tsx` |
| API báo cáo | `web/src/app/api/analytics/quarterly-report/route.ts` |
| API B2B customers | `web/src/app/api/analytics/quarterly-b2b-customers/route.ts` |
| API B2B customer cost | `web/src/app/api/analytics/b2b-customer-costs/route.ts` |
| API target | `web/src/app/api/analytics/quarterly-targets/route.ts` |
| API cache flush | `web/src/app/api/analytics/quarterly-cache-flush/route.ts` |
| API settings | `web/src/app/api/analytics/quarterly-settings/route.ts` |
| Lib settings | `web/src/lib/quarterly-settings.ts` |
| Nav | Sidebar Overview → **Quarter Report**; id phân quyền = `quarterly` |

## 2. Luồng dữ liệu
- **Báo cáo** (`quarterly-report`): gohub_dw fulfillment (Revenue/GP) + `dim_sku` 3HKDATAPOOL (3HK%) + `fetchCosts` Supabase (ngoài cache) + `prevGroupRows` cho QoQ. Cache key `qreport_raw_v2:...`.
- **B2B tier data** (`quarterly-b2b-customers`):
  - **Cache**: gohub_dw `customerRows` + `prevQuarterRows` (toàn quý trước, dùng tính QoQ).
  - **Ngoài cache**: `fetchCustomerCosts` Turso (always fresh) chạy song song với cachedQuery.
  - Cache key `qb2b_raw_v3:${quarter}:${year}:${companyCode}:${todayStr}:${exclHash}`.
- **B2B customer cost** (`b2b-customer-costs`): Turso `b2b_customer_cost_monthly` (primary) + Supabase fallback (legacy Q2 data trước khi migrate). UI edit-session: **Sửa chi tiết** → modal nhập cost → **Lưu** (giữ edit mode, rebuild từ data mới) | **Hủy** (thoát edit mode).
- **Target** (`quarterly-targets`): Turso `target_planning_quarter`.
- **Settings** (`quarterly-settings`): Supabase `app_settings` key `quarterly_excluded_customers` + `quarterly_tier_keywords`.

## 3. Bảng Target Turso — `target_planning_quarter`
Nhất quán với `gohub-report/gohub.py` (`save_quarter_targets` / `cm1_quarter`).

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | TEXT PK | `{quarter}_{channel}` vd `Q3-2026_B2B` |
| `quarter` | TEXT | `Q3-2026` (dạng `Q{n}-{year}`) |
| `channel` | TEXT | `B2B` \| `B2C` (mỗi quý 2 row) |
| `target_revenue` | REAL | |
| `target_cm1` | REAL | |
| `target_three_hk_pct` | REAL | % |
| `updated_by` | TEXT | username người lưu |
| `updated_at` | TEXT | ISO timestamp |

- **GET** `?quarter=Q3&year=2026` → gộp 2 row B2B/B2C thành `{ targets: { b2bRev, b2bCm1, b2bThk, b2cRev, b2cCm1, b2cThk } }`. Không có row → `targets: null`.
- **POST** (chỉ **admin/creator**): `INSERT OR REPLACE` 2 row B2B + B2C. Tự `CREATE TABLE IF NOT EXISTS`.
- Env cần: `TURSO_URL`, `TURSO_AUTH_TOKEN` (đọc/ghi qua `tursoQuery`).

## 4. Công thức
- **CM1 = Gross Profit − Channel Cost − Group Cost**.
- **Pro-rata (PR)**: tháng hiện tại → `factor = dim / elapsed`; cột tháng hiện tại hiện cả **Actual** (số thực) và **PR** (projected, stacked).
- **3HK%** = revenue SP vendor `3HKDATAPOOL` / total revenue.
- **%QoQ(CM1)** (cập nhật 2026-07-24): `(CM1 projected quý này − CM1 thực tế quý trước) / |CM1 quý trước|`. Áp dụng thống nhất ở tất cả 3 vị trí: bảng Tổng Quý (B2B/B2C/Tổng), tier pivot, customer detail. CM1 quý trước = GP − channel cost − group cost (tính từ prevChannelRows + Supabase costs). Cache key API `v3 → v4`.
- **INACTIVE filter**: KH có `price_list_name` chứa "INACTIVE" bị loại khỏi mọi tổng B2B.

## 5. Cài đặt động (admin/creator)
Nút **Cài đặt** trong header Quarter Report (chỉ admin/creator):
- **KH bị loại**: danh sách tên KH không tính vào báo cáo B2B (mặc định: `B2C Customer US`, `B2C Customer VN`, `B2B Ops`). Lưu `app_settings.quarterly_excluded_customers`.
- **Phân loại tầng**: từ khóa trong `price_list_name` để phân loại Strategic/VIP/Gold/Silver. Lưu `app_settings.quarterly_tier_keywords`.
- Sau khi lưu → bấm **Tải lại mới** để áp dụng (cache key tự đổi theo hash exclusion list).

## 6. Nút & Luồng chính
| Nút | Hành động |
|---|---|
| **Xem báo cáo** | Fetch `quarterly-report` + `quarterly-b2b-customers` (dùng cache) |
| **Tải lại mới** | Flush L2 Supabase cache (`quarterly-cache-flush`) + fetch fresh cho mọi role |
| **Sửa target** → **Lưu** | POST `quarterly-targets` → auto `Tải lại mới` |
| **Sửa chi tiết** (B2B) | Bật edit mode; modal nhập CH.Cost per-KH/tháng |
| **Lưu** (CH.Cost) | POST `b2b-customer-costs` → đóng modal, GIỮ edit mode, auto `Tải lại mới` → rebuild costEdits từ data mới |
| **Hủy** (CH.Cost) | Reset toàn bộ edits, thoát edit mode |

## 7. Gotchas
- **Cache key đổi khi thêm field**: `qreport_raw_v2`, `qb2b_raw_v3`. Đổi key khi cấu trúc cached data thay đổi để tránh crash.
- **Costs ngoài cache**: `fetchCustomerCosts` (Turso) chạy song song với `cachedQuery` (gohub_dw) → costs luôn fresh, không bao giờ stale.
- **Supabase fallback**: Q2 costs lưu ở Supabase (code cũ trước Turso migration) → `fetchCustomerCosts` tự fallback nếu Turso empty.
- **Target lưu Turso** (KHÔNG Supabase) để đồng bộ Python `gohub-report`.
- **CH.Cost rebuild**: sau khi lưu, FE rebuild `costEdits` từ data mới (không reset edit mode) → user tiếp tục edit được ngay.
- **Tháng hiện tại**: cột `Actual` + `PR` stacked (badge `Act`/`PR` xanh). Tháng đã qua: chỉ PR.

## 8. Phân quyền
- **Xem tab**: admin, creator, bod, b2b, b2c, staff. Default permissions union code defaults + DB.
- **Lưu Target**: admin, creator, bod, b2b, b2c, staff (mở rộng 2026-07-23).
- **Sửa CH.Cost**: admin, creator, bod, b2b, b2c, staff.
- **Cài đặt (tier/exclusion)**: chỉ admin, creator.
- **Tải lại mới (cache flush)**: mọi user đã login.
