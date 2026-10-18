# Bảng phát hiện tổng hợp (QA tab Analyst)

Cập nhật sau mỗi giai đoạn. Mức độ: P0 sai số tiền hoặc mất dữ liệu · P1 sai số ở trường hợp thường gặp, hoặc ghi bị 403 câm · P2 không nhất quán, dễ hiểu lầm, thiếu chức năng · P3 giao diện, nhãn.

| # | Mức | Tab | Mô tả | Bằng chứng | Nguyên nhân gốc | Trạng thái |
|---|---|---|---|---|---|---|

## Phát hiện sơ bộ từ kiểm kê (G0, chưa xác nhận bằng giao diện)

Các điểm sau do bộ quét tĩnh `queries.mjs` gợi ý; cần kiểm lại ở G1 trước khi coi là lỗi.

| # | Mức dự kiến | Tab | Gợi ý | Cần xác nhận |
|---|---|---|---|---|
| G0-1 | P2 | Dashboard | 9 trong 12 route của Dashboard có cache nhưng không nhận `nocache=1` qua `noCache(req)` (`kpis`, `revenue-chart`, `region-chart`, `performance-source`, `performance-channel`, `recent-orders`, `targets-summary`, `b2b/tier-performance`, `config/partner-tiers`). Sau khi sửa dữ liệu hoặc cấu hình, số có thể giữ bản cũ tới hết TTL; khó đo số tươi | Gọi từng route với `nocache=1` và so hai lần |
| G0-2 | P2 | B2C | 4 route có cache không nhận `nocache=1` | Như trên |
| G0-3 | P2 | Channels, BOD, Customers, Products, Manage Costs | Một số route có cache không nhận `nocache=1` (`channels/b2b-customers`, `bod-*`, `customer/report`, `products/report`, `planning/targets`) | Như trên |
| G0-4 | P2 | Mọi tab | `/api/analytics/query` cache theo nội dung SQL và ghi chú ở mã nói TTL 12 giờ; các tab dựng SQL ở giao diện (Channels, Vendors, 3HK, Products, BOD một phần) có thể giữ số cũ lâu hơn các route khác | Đo thời gian sống thực tế của cache query |
