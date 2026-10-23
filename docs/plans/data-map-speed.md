# Plan: Data Map mới + tối ưu tốc độ load (2026-10-23)

File TẠM. Xoá khi xong cả hai phần, chuyển kiến thức còn giá trị sang wiki `analytics-devtools.md`, `analytics-data-model.md`.
Hiếu duyệt hướng 2026-10-23. Làm trên `staging`, chỉ merge `main` khi Hiếu nói rõ.

## Đã chốt (Hiếu)
- Data Map **tự sinh bằng quét code**, không viết tay (có file chú thích tay nhỏ cho phần quét sót).
- Tầng "Mục/chức năng" đặt tên theo tiêu đề thẻ/bảng trên giao diện (mặc định; Hiếu chưa nói khác).
- Duyệt nhãn **"Dữ liệu cập nhật lúc HH:mm"** trên mỗi tab và hiển thị số cũ trước rồi cập nhật (stale-first) — chạm UI Strict Lock đã được Hiếu cho phép.
- Không dùng Kafka (không phù hợp quy mô/Hobby).
- Cache chỉ để trả lời nhanh trong lúc kiểm lại; không tin cache hơn dữ liệu thật.

## Vấn đề
- Data Map hiện (`lib/data-lineage.ts`, 347 dòng, `components/data-lineage-map.tsx`) viết tay, chỉ 2 tầng Tab ↔ Bảng, không số đo, dễ lệch (60+ route analytics, 59 đường nối).
- Chậm: cache nóng <1s nhưng nguội 3–12s/endpoint; mở tab nguội ~25s vì mỗi tab bắn 15–21 endpoint vào `gohub_dw` (pool 3, gần như tuần tự). Hobby không có DDL.

## Phần 1 — Data Map: Hệ thống → Tab → Mục → API → Bảng
Script `npm run build:datamap` quét code, ra JSON, giao diện đọc JSON:
| Tầng | Nguồn |
|---|---|
| Hệ thống (nguồn, ETL, cache, web) | khai báo gọn, ít đổi |
| Tab | `lib/nav.ts` |
| Mục/chức năng | `page.tsx` + component: `fetch("/api/...")`, tiêu đề thẻ/bảng cạnh lời gọi |
| API | `app/api/**` |
| Truy vấn | `cachedQuery(key, deps)`, `.from("bảng")`, `FROM/JOIN` trong SQL, `tursoQuery` |
| Bảng/cột | `sql-schema` (gohub_dw), migration (Supabase/Turso) |
Quét sót (~10–15%, SQL ghép chuỗi) ghi đè bằng file chú thích tay. Test: số route quét được = số route thật.
Giao diện: trái → phải, bấm nút thì mở rộng; bấm bảng thì sáng ngược mọi tab/mục dùng nó. Lớp số đo (từ Phần 2-A): p50/p95 nóng/nguội, byte payload, số lần gọi `gohub_dw`.
Chỉ sửa trong `devtools` (không đụng tab tiền).

## Phần 2 — Tốc độ (thứ tự làm)
**A. Đo thật** (làm cùng Phần 1): ghi thời gian từng API (nóng/nguội, byte, số lần gọi DW) vào Turso; bảng p50/p95 lên Data Map. Hiện chỉ có đo tay.
**A'. An toàn cache** (gộp vào A):
1. Khoá cache có **phiên bản dữ liệu** (`version` tăng sau mỗi lần ETL xong → khoá cũ tự vô hiệu).
2. Ghi một nơi, xoá một nơi: mọi API ghi gọi hàm `invalidate(topic)`; test tĩnh quét route ghi, báo lỗi nếu thiếu.
3. **Checksum**: cron 10–15 phút chạy truy vấn rẻ (`MAX(last_modified)`, `COUNT` theo ngày 3–7 ngày gần nhất); đổi thì tăng `version` (bắt dữ liệu lùi ngày/sửa ngoài hệ thống).
4. Nhãn "Dữ liệu cập nhật lúc HH:mm" + nút tải lại mới (đã có `nocache=1`).
5. Target/chi phí vừa sửa: lần đọc kế tiếp bắt buộc đọc mới (read-your-writes).
6. Đối chiếu hằng đêm `test:consistency` trên cache nóng; lệch thì báo Lark.
**B. Prewarm theo hành vi thật**: dùng `app_usage_events` lấy các cặp tab × bộ lọc hay dùng (kỳ mặc định, ALL/VN/US, ba hộp tích); cron làm nóng theo thứ tự lượt xem sau mỗi ETL (hiện chỉ ≤50 URL theo registry).
**D. Tải theo giai đoạn ở UI**: khung xương + số stale ngay, cập nhật khi số mới về; chỉ gọi khối trong màn hình; tab con chỉ gọi khi bấm.
**C. Gom truy vấn** (3 tab nhiều lượt xem trước: Quarter Report 753, Channels 285, B2C 281): endpoint "bundle" mỗi tab thay 15–21 lời gọi; cache tầng dưới cho phần dùng chung (tên khách, tier, target, group cost, config); thẻ KPI chạy trước, bảng nặng tải sau.
**E. Bảng tổng hợp sẵn** (doanh thu/GP/CM1 theo ngày × kênh × khách): chỉ làm nếu A–D chưa đủ. Đặt ở Turso (Supabase 425/500MB) hoặc hỏi bên giữ `gohub_dw`. Xây lại từ dữ liệu gốc sau mỗi ETL.

## Thứ tự
1. A + A' + Data Map (dùng chung dữ liệu quét/đo). 2. D + B. 3. C cho 3 tab. 4. E nếu cần.
Mỗi bước: staging, tsc/lint/build/vitest, QA sống, wiki tab, commit riêng. Đo trước/sau từng bước bằng bảng p50/p95 của A.

## Rủi ro
Quét code sót SQL động · cron checksum tăng tải `gohub_dw` (truy vấn phải rẻ, tuần tự) · stale-first làm người xem thấy số cũ vài giây (có nhãn giờ) · bundle endpoint làm một tab lỗi kéo cả khối (cần lỗi từng phần).

## Hiếu còn
Duyệt plan này (đã duyệt hướng); quyết khi nào làm E; hỏi bên `gohub_dw` về bảng tổng hợp (và xem họ có dùng Kafka không — chỉ để biết).

## Tiến độ (2026-10-23, staging `155ac98a`, chưa merge `main`)
- [x] **A đo thật:** `lib/perf-recorder.ts` + bảng Turso `perf_events` + `/api/creator/perf-stats`; QA sống: ghi được số nguội thật (bod-summary ~12s, qreport_raw ~4,6s, staff-report ~4,6s).
- [x] **Data Map mới** (`components/data-map-view.tsx`, `scripts/datamap/build.mjs`, `npm run build:datamap`): 19 tab · 87 API · 32 bảng; 2 chế độ Theo Tab / Theo Bảng; số đo p50/p95; test khoá đồng bộ. QA sống staging OK (khoá cache nhận được 45/87 API; còn lại không qua cachedQuery hoặc khoá động).
- [x] **A' an toàn cache:** checksum 7 ngày trong cron `etl-cache-sync` (chạy sống 2 lần: ổn định, ~0,7s); nhãn "Dữ liệu cập nhật HH:mm" ở thanh trên; test `cache-invalidation` (danh sách REVIEWED 42 route ghi chưa flush — cần rà dần, chưa chứng minh an toàn); khoá phiên bản = epoch sẵn có (softExpire) nên không đổi cấu trúc khoá.
- [ ] A' còn: nút "Tải lại mới"/read-your-writes cho target–chi phí (rà REVIEWED); đối chiếu `test:consistency` hằng đêm báo Lark.
- [ ] B prewarm theo hành vi · D UI stale-first · C gom truy vấn (3 tab) · E bảng tổng hợp — chưa làm. Lấy số đo vài ngày (`/api/creator/perf-stats?days=3`) rồi mới chọn C/E.

## Tiến độ B + D (2026-10-23, staging `44a80686`, chưa merge `main`)
- [x] **B prewarm theo hành vi:** `lib/url-hits.ts` (Turso `url_hits`, đếm lượt gọi thật, mẫu ngày tương đối, điểm 7 ngày), `prewarmAnalyticsUrls` lấy top theo điểm + ngân sách thời gian (cron 38s / ETL 22s). QA sống: danh sách xếp hạng ra đúng (`/api/creator/perf-stats` → `warmList`); chưa kiểm một vòng cron thật sau khi tích luỹ nhiều ngày dùng.
- [x] **D tải nhanh ở trình duyệt:** `lib/client-fetch-cache.ts` (dedupe + nhớ 60s + xoá khi ghi) cho mọi tab; `lib/stale-first.ts` số-cũ-trước **chỉ ở Quarter Report** (`quarterly-report`, `quarterly-b2b-customers`). QA sống: lần đầu 12,4s → lặp 0ms; 2 request đồng thời dùng chung 1 lần gọi; POST xoá bộ nhớ + số cũ.
- [ ] Mở rộng số-cũ-trước cho Channels, B2C, B2B, BOD, Staff (mỗi tab đọc `readStale` trước, `writeStale` sau); đo hiệu quả bằng Data Map sau vài ngày; rồi quyết C (gom truy vấn) / E (bảng tổng hợp).

## Tiến độ bước 3 (2026-10-23, staging `da825c8f`, chưa merge `main`)
- [x] Số-cũ-trước mở rộng: BOD, Staff, Channels (bảng tất cả kênh), B2B (`processRaw`), B2C Advanced + Metric; nhãn `StaleNotice`. tsc/lint/vitest 1045/build PASS. QA sống: BOD ghi bundle 48KB vào sessionStorage sau lần tải đầu; **chưa xem được lần mở lại bằng mắt** (công cụ Chrome bị extension khác chặn sau reload) — Hiếu mở BOD/Staff/B2B hai lần liên tiếp để xem số cũ hiện ngay + nhãn "Đang cập nhật số mới…".
- [ ] Chưa áp: B2C Performance, Orders, Customers, Vendors, Products, Dashboard, All-Time.

## QA sống bước 3 (2026-10-23, staging `f7bda27f`)
Kịch bản: mở lần đầu BOD → Staff → Channels → B2B → B2C, chờ 18s (qua ngưỡng đếm lượt xem 15s), quay lại từng tab (điều hướng trong app, không reload), đo trạng thái mỗi 250–600ms.
- **Đạt:** Staff, Channels, B2B (Theo tháng): quay lại hiện nội dung cũ + nhãn "Đang cập nhật số mới…" ở ~0,6–0,8s, số mới thay sau ~1,4–2s; thao tác ghi (`quarterly-cache-flush`) xoá sạch số cũ (5 khoá → 0); BOD cũng hiện số cũ + nhãn ở ~108ms ở một lần kiểm riêng.
- **Lỗi tìm ra + đã sửa:** (1) POST nền (`analytics/track` sau 15s, `user/heartbeat` mỗi 2 phút) xoá sạch bộ nhớ → số cũ không còn; (2) Channels/B2B đọc dữ liệu bằng POST `analytics/query` → cũng xoá; (3) B2B mặc định là chế độ "Theo tháng" (không đi qua `fetchData` khoảng ngày) nên bản đầu chỉ áp cho chế độ cũ → thêm vào `b2b-month-view.tsx`. Danh sách POST chỉ-đọc/nền: `TELEMETRY` trong `lib/client-fetch-cache.ts` (có test).
- **Còn nghi:** BOD lần mở đầu tiên có lúc bản lưu chưa xuất hiện sau 30s dù nội dung đã hiện (một lần kiểm có, một lần không); B2C Advanced quay lại không thấy nhãn (số mới về nhanh nên có thể không kịp). Cần Hiếu dùng thật vài ngày để xác nhận.
- Công cụ Chrome chập chờn (extension khác chặn sau reload; tab cũ chạy bản code cũ còn phát tín hiệu xoá sang tab mới → làm nhiễu kết quả; phải đóng tab cũ trước khi kiểm).
