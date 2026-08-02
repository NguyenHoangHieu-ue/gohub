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
- **Channel Cost (op-cost)** — `computeChannelCost`: phí `amount` cộng dồn (pro-rata theo số ngày trong kỳ × `ratio`); phí `percent` **CỘNG HẾT** tất cả loại (ads/platformFee/sponsorProducts/media) trên revenue. **(2026-08-02, QUARTERLY-1) ĐÃ đổi từ `MAX(percent)` → `SUM(percent)`** để nhất quán với BOD/Channels/B2B/B2C (`bod-data.ts`) — CM1 cùng 1 kênh nay khớp giữa Quarterly và các tab. (Trước lấy MAX theo `gohub.py`; thời điểm đổi 0 tác động số vì chưa kênh nào có ≥2 phí %.)
- **Pro-rata (PR)**: tháng hiện tại → `factor = dim / elapsed`; cột tháng hiện tại hiện cả **Actual** (số thực) và **PR** (projected, stacked).
- **3HK%** = revenue SP vendor `3HKDATAPOOL` / total revenue.
- **%QoQ(CM1)** (cập nhật 2026-07-24): `(CM1 monthly pro-rata quý này − CM1 thực tế quý trước) / |CM1 quý trước|`. Áp dụng thống nhất ở tất cả 3 vị trí: bảng Tổng Quý (B2B/B2C/Tổng), tier pivot, customer detail. **Monthly pro-rata** = Σ cm1 từng tháng (tháng hiện tại × `dim/elapsed`, tháng tương lai = 0) — KHÔNG dùng quarter-level factor (`qTotal/qElapsed`). CM1 quý trước = GP − channel cost − group cost (prevChannelRows + Supabase costs). Fix 2026-07-24: Tổng Quý trước dùng quarter-level (inflate QoQ đầu quý), nay đồng bộ sang monthly. Cache key API `v3 → v4`.
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

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Revenue | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(...)` GROUP BY month trong quý |
| GP (Gross Profit) | `fact_fulfillment_revenue.gross_profit_vnd` | `SUM(gross_profit_vnd)` |
| Channel Cost | Supabase `analytics_channel_costs` | `SUM(amount)` per channel per month; phân bổ B2B/B2C |
| Group Cost | Supabase `analytics_channel_group_costs` | `SUM(amount)` per group (B2B/B2C) per month |
| CM1 | GP − Channel Cost − Group Cost | Công thức chính (không phân bổ xuống đơn) |
| CM1% | CM1 / Revenue × 100 | |
| 3HK% | `fact_fulfillment_revenue` + `dim_sku.vendor` | Revenue vendor `3HKDATAPOOL` / total revenue |
| Tier (B2B) | `dim_customer.price_list_name` | `tierKeywords` từ `app_settings.quarterly_tier_keywords`; Strategic/VIP/Gold/Silver |
| CH.Cost per customer | Turso `b2b_customer_cost_monthly` | `cost_lines` JSON: amount (VND) hoặc percent (% revenue) |
| Target | Turso `target_planning_quarter` | `target_revenue`, `target_cm1`, `target_three_hk_pct` per B2B/B2C per quarter |
| QoQ % | `fact_fulfillment_revenue` quý trước | `(CM1_cur_prorata − CM1_prev) / |CM1_prev| × 100`; monthly pro-rata |
| Pro-rata | `fact_fulfillment_revenue` tháng hiện tại | `cm1_actual × (days_in_month / elapsed_days)` |
