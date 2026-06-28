# Board of Directors Report (Báo Cáo Quản Trị BOD)

Báo cáo cấp cao cho Ban Giám đốc: phân tích cơ cấu **Contribution Margin (CM1)**, chi phí kênh, đóng góp doanh thu 3HK và dự kiến cuối tháng. Là báo cáo tài chính "ra quyết định" của team Business.

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: cho BOD thấy lợi nhuận thực sau khi trừ giá vốn + chi phí vận hành (không chỉ doanh thu), và mức đóng góp của dòng sản phẩm chiến lược 3HK.
- **Tại sao tách khỏi Dashboard**: số liệu nhạy cảm (giá vốn, margin) + nhiều bảng con (channel performance, group margin) → cần trang chuyên sâu, phân quyền chặt hơn.

## 2. Đường dẫn & file
- **Web**: `/analytics/bod` — `web/src/app/(dashboard)/analytics/bod/page.tsx`
- **API**: `/api/analytics/bod-report`, `/bod-summary`, `/bod-channel-performance`, `/bod-group-margin`.

## 3. Thuật ngữ tài chính (QUAN TRỌNG — đã đổi term)
> Từ 2026-06-23, đồng bộ với Management Report: **GP2/GPM2 → CM1 (Contribution Margin 1)**. Trên UI hiển thị **CM1 / CM1 %**. Trong code/SQL **giữ nguyên** key/alias lowercase `gpm2`, `gpm2_percent` để không vỡ data shape.

- **Revenue**: doanh thu thực tế.
- **Gross Profit (GP)** = Revenue − COGS (giá vốn sản phẩm).
- **GPM%** = GP / Revenue.
- **CM1** = GP − Operation Cost (phí sàn / phí quảng cáo / phí tài trợ SP...).
- **CM1 %** = CM1 / Revenue.
- **3HK Contribution Revenue %** = doanh thu SP 3HK / tổng doanh thu.

## 4. Công thức & nguồn biến số
$$\text{CM1} = \text{Revenue} - \text{COGS} - \text{Channel/Operation Cost} - \text{Platform Fee}$$
$$\text{CM1\%} = \frac{\text{CM1}}{\text{Revenue}} \times 100\%$$
- **Revenue**: `fact_fulfilment_revenue` (`gohub_dw`).
- **COGS**: giá vốn sản phẩm (cohort `latest_cogs` / dữ liệu nhập).
- **Platform Fee / Channel Cost**: cấu hình kênh (phí sàn Shopee/Klook...) + `channel_group_costs`.
- **3HK contribution**: lọc vendor 3HK — dùng `REPLACE(UPPER(vendor),' ','') = '3HKDATAPOOL'` (xem mục 6).

## 5. Cách hoạt động (luồng)
1. `bod-summary` gom nhiều chỉ số (revenue, CM1, 3HK contribution, prev period/year) — đã gộp ~8 await tuần tự thành 1 `Promise.all` cho nhanh.
2. `bod-channel-performance` + `bod-group-margin` cấp bảng phụ theo kênh/nhóm.
3. Áp **Projection Factor** (như Dashboard) để dự kiến CM1 cuối tháng.
4. Tất cả qua cache 12h + prewarm.

## 6. Vấn đề đã gặp & cách khắc phục
- **3HK Contribution luôn = 0 / tab 3HK rỗng (S80)**: `dim_sku.vendor` thực tế là `'3HK DATAPOOL'` (CÓ dấu cách) nhưng SQL lọc `'3HKDATAPOOL'` (không dấu cách) → khớp 0 dòng. Fix: chuẩn hoá `REPLACE(UPPER(vendor),' ','')` ở mọi câu lọc 3HK.
- **Cold-load 25-50s (S81)**: BOD fan-out ~12-40 query không cache. Fix: bọc `cachedQuery` 12h cho `bod-summary/report/group-margin/channel-performance`; gộp await; tăng pool 2→10; prewarm cron.
- **Đổi term GP2→CM1 (S74)**: chỉ đổi LABEL hiển thị, giữ data key để không vỡ findKPI/shape.

## 7. Quy trình vận hành
- Số liệu nhạy cảm tính trực tiếp trên `gohub_dw`, cache L2 Supabase TTL 12h, prewarm 06:30 ICT → phản hồi gần như tức thì khi lặp lại.
- Hỗ trợ xuất PDF phục vụ họp chiến lược.

## 8. Phân quyền
- Chỉ **Admin, Creator, BOD, Manager**. **Staff/Standard** bị chặn + redirect.
- Lưu ý: `bod` phải có trong allow-list của các API analytics (creator/manager từng bị bỏ quên → 403 âm thầm, đã fix S80).
