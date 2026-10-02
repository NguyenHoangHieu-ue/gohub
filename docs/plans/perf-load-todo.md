# Việc tối ưu tốc độ load còn lại (FILE TẠM — làm xong thì XOÁ file này + dòng trỏ tới nó trong CLAUDE.md)

Nguồn: rà soát s222 (2026-10-02). Bằng chứng + lý do đầy đủ ở `docs/wiki/system/analytics-data-model.md` mục s222.
Ràng buộc chung: KHÔNG thêm tải lên gohub_dw (pool max=3/instance, Hiếu không có quyền DDL/index); mọi thay đổi chỉ được GIẢM số query hoặc tăng tái dùng cache.
Quy ước làm: đo trước/sau bằng log Vercel (`[analytics-db] SLOW wait=… run=…`, `cache=MISS`) hoặc `/api/analytics/perf-probe`; staging trước, không tự merge `main`.

## Đã làm (s222, commit 3917018c)
- Khoá cache 4 route quý (`quarterly-report`, `quarterly-b2b-customers`, `squad-progress`, `quarterly-customer-lifecycle`) dùng ngày cuối khoảng truy vấn thay cho "hôm qua" → quý đã đóng không nguội mỗi ngày.
- CHƯA đo lại trên staging sau deploy → việc đầu tiên: mở Quarter Report / Performance (Q4) / Squad Progress lần 1 và lần 2 ở ngày hôm sau, xem log còn `cache=MISS` cho quý Q1-Q3 không.

## Việc còn lại (theo thứ tự ưu tiên)

1. **Tab Performance bắn 3 request `quarterly-report` song song cho quý trước** (xem Q4 → Q1, Q2, Q3 + báo cáo hiện tại = 4 request × ~6 query, pool chỉ 3 slot → `wait` 5-8s).
   Hướng: (a) 1 endpoint trả nhiều quý trong 1 lần (dùng lại `quarter-rows.ts` gom query theo khoảng), hoặc (b) cho quý ĐÃ ĐÓNG `MAX_STALE_MS` dài hơn (vd 48h) + TTL dài, vì số quý đã đóng gần như không đổi (ETL vẫn `softExpireAll`). Cần Hiếu chốt chấp nhận số quý cũ có thể trễ tới X giờ trước khi chọn (b).
   File: `web/src/components/quarterly/company-performance-view.tsx` (useEffect `prevQs`), `web/src/lib/analytics-helpers.ts` (`cachedQuery`, `MAX_STALE_MS`).
2. **Staging nguội lại sau mỗi lần deploy?** Log cho thấy cùng 1 khoá quý MISS ở các deployment khác nhau cách nhau ~25 phút. Chưa xác nhận Runtime Cache có sống qua deploy preview không. Cách thử: gọi 1 route 2 lần cùng deployment (lần 2 phải HIT), rồi deploy rỗng và gọi lại. Nếu không sống qua deploy → ghi vào wiki "staging luôn chậm lần đầu sau push", cân nhắc prewarm sau deploy staging.
3. **Request chạy nền gây round-trip Supabase (~300ms mỗi lần)**: `/api/user/heartbeat` ~740 lần/ngày, `/api/creator-ai/bridge/next` ~650, `/api/notifications` ~110, `/api/auth/session` ~60, `/api/user/me` ~60. Không chặn trang nhưng chiếm kết nối + chi phí. Hướng: tăng chu kỳ heartbeat/poll, dừng poll khi tab ẩn, gom thông báo vào 1 lần.
4. **Prewarm**: cron `prewarm-analytics` chỉ làm nóng URL đã đăng ký; kiểm xem Performance/quý đã đóng có nằm trong registry không (sau việc 1 nên thêm hẳn). Hiếu còn treo: xác nhận cron-job.org gọi `etl-cache-sync` (xem checklist CLAUDE.md).
5. **Query nặng còn lại khi cache nguội** (chỉ giảm bằng cách tái dùng, không có index): lifecycle 112.303 dòng (12-17s, cache 6h đã có); query gom `quarterly-report` 37.355 dòng (~10-14s); `b2c/kpis`, `b2c/performance` 3-6s. Nếu muốn nhanh hơn nữa → cache theo THÁNG (tháng đã đóng giữ lâu, chỉ tính lại tháng đang chạy) — thay đổi lớn, cần thiết kế riêng + test khớp số.

## Cách xoá file khi xong
Xoá `docs/plans/perf-load-todo.md` + xoá dòng "Plan tối ưu tốc độ" trong mục "Việc Hiếu cần làm" của `CLAUDE.md`; kiến thức còn giá trị đã nằm ở wiki `analytics-data-model.md` §s222 (cập nhật thêm kết quả đo sau khi làm).
