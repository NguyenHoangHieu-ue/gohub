---
title: "Quarter Report (Báo Cáo CM1 Theo Quý)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, quarterly, cm1, target]
created: 2026-07-21
updated: 2026-07-22
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
| API B2B customer cost | `web/src/app/api/analytics/b2b-customer-costs/route.ts` |
| API target | `web/src/app/api/analytics/quarterly-targets/route.ts` |
| Nav | Sidebar Overview → **Quarter Report** (sau Dashboard); id phân quyền = `quarterly` |

## 2. Luồng dữ liệu
- **Báo cáo** (`quarterly-report`): gohub_dw fulfillment (Revenue/GP) + `dim_sku` 3HKDATAPOOL (3HK%) + `fetchCosts` (channel cost + group cost từ Supabase). Cache key `qreport_v3:...`.
- **B2B customer cost** (`b2b-customer-costs`): lưu/xóa CH.cost nhập tay theo từng KH và tháng trong Supabase `b2b_customer_cost_monthly`. UI dùng edit-session: bấm **Sửa chi tiết** → nút chuyển thành **Lưu/Hủy**, chỉnh từng ô `Ch.Cost` qua modal, **Lưu** chỉ active khi có thay đổi; **Hủy** bỏ toàn bộ thay đổi local.
- **Target** (`quarterly-targets`): lưu/đọc từ **Turso** table `target_planning_quarter` — KHÔNG dùng Supabase.

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
- **CM1 = Gross Profit − Channel Cost − Group Cost** (giữ nguyên định nghĩa hệ thống).
- **Pro-rata (PR)**: tháng hiện tại → nhân `factor = dim / elapsed`; Group Cost KHÔNG nhân (full tháng). Cột "PR Rev"/"PR CM1" chỉ hiện khi tháng projected.
- **3HK%** = doanh thu SP vendor `3HKDATAPOOL` / total revenue.
- **Đạt PR** (bảng target) = PR Rev / target_revenue × 100.

## 5. Gotchas
- Đổi cache key khi thêm field mới vào `quarterly-report` (đã từng crash do cache cũ thiếu `hk3Pct`/`qt.b2b` → guard `?? 0` + `{qt.b2b && …}`). Hiện tại `qreport_v3`.
- Target lưu Turso (KHÔNG Supabase) để đồng bộ với script Python `gohub-report`.
- Xóa hết dòng trong modal CH.cost sẽ gửi `cost_lines: []`; API xóa record `b2b_customer_cost_monthly` tương ứng thay vì giữ row rỗng. Sau khi lưu, FE gọi lại `quarterly-b2b-customers?refresh=1` để bypass cache.
- UI style: chỉ dùng slate + blue (CM1) + green/red (status). Header bảng `bg-slate-800`. Từ 2026-07-21 canh cho ĐỒNG BỘ với các tab analytics khác: wrapper `p-4 lg:p-8 space-y-8 max-w-7xl mx-auto` (bỏ nền xám `bg-slate-50`), tiêu đề trang `text-2xl font-bold`, tiêu đề nhóm ("Tổng hợp theo Tháng", "Tổng hợp cả Quý — So sánh với Target", Target, pivot) `text-lg font-bold text-slate-900` (in đậm + to hơn, thay `text-sm font-semibold text-slate-700` cũ).

## 6. Phân quyền
- Xem tab: **admin, creator, bod, b2b, b2c, staff** (`useRoleGuard`). Default permissions: b2b/b2c có `quarterly`.
- Lưu Target: chỉ **admin/creator** (POST guard).
- Sửa/Lưu B2B customer CH.cost: chỉ **admin/creator** (`canEditCost` + POST guard).
