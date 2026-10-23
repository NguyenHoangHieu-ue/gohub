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
