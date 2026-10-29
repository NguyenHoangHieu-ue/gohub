# Plan QA Gấu Prime (2026-10-29)

Mục tiêu: Gấu Pro có gì thì Gấu Prime phải bằng hoặc tốt hơn. Chỉ hoàn thiện cái có sẵn, không thêm tính năng mới.
Tài khoản thử: admin không phải Creator (thấy giao diện thành viên) + Creator khi cần so sánh. Môi trường: staging (dùng chung DB production, cuộc thử phải xoá).

## Cách chấm
Mỗi ca ghi: đạt/không, thời gian đến chữ đầu tiên (TTFT), thời gian hoàn tất, số công cụ gọi, chi phí (`argon_runs`), ghi chú UI. Cùng một câu hỏi chạy ở Gấu Pro và Gấu Prime, chấm số liệu đối chiếu API staging.

## Nhóm ca
1. **Đính kèm/đa phương tiện:** 1 ảnh, 2–5 ảnh khác tên, 2 ảnh CÙNG tên (image.png), dán ảnh từ clipboard, kéo thả, ảnh + PDF + xlsx + docx cùng lúc, tệp >8MB, tệp lỗi, bỏ tệp khỏi thẻ, gửi rồi kiểm "Tài liệu của tôi".
2. **Số liệu (so Gấu Pro):** doanh thu/CM1 theo kỳ, so quý, top khách, SKU, GA4/GSC, 936 lượt querySupabase của Gấu Pro (tra bảng sản phẩm/NCC/ref), câu cần `sql` nhiều bước. Đối chiếu với API Quarter/BOD.
3. **Kho/trí nhớ:** hỏi Kho, tìm hội thoại cũ, đề xuất ghi nhớ + thẻ Đồng ý/Không, panel Trí nhớ.
4. **Soạn/tạo:** báo cáo HTML (Mở report, .html, Nhờ sửa, Kho báo cáo), xuất Word/Excel/Markdown, ảnh (taoAnh), biểu đồ.
5. **Hành động:** thẻ duyệt (task Lark, tin Lark, lịch) — chỉ tạo đề xuất, không bấm duyệt thật.
6. **Trình duyệt/Bridge:** đọc tab, đọc URL, đọc Lark/Google bằng token từng người.
7. **Quyền:** thành viên không thấy tab Creator, không thấy code/#, bị chặn đúng công cụ (MEMBER_BLOCKED_TOOLS).
8. **UI/UX:** bố cục cột trái/chat/Bàn làm việc, trạng thái chờ, lỗi, cuộn khi trả lời dài, gõ khi chat dài, popup Lark, tối/sáng, điện thoại (resize không đổi được → kiểm CSS bằng đọc code), phím tắt, Dừng, tiếp tục.
9. **Tốc độ/hiệu suất:** TTFT + tổng thời gian đường nhanh vs đầy đủ, Nhanh vs Sâu; số request/lượt; kích thước payload; long-task khi cuộn; `reload_log`.
10. **Format câu trả lời:** hộp Kết luận, bảng, chip nguồn [#N], độ dài, không bức tường chữ, tiếng Việt có dấu, không lộ tên công cụ/code với thành viên.
11. **Độ chính xác:** eval `scripts/eval-argon.mjs` (25 ca) + 10 câu cặp Gấu Pro/Gấu Prime chấm tay.

## Kết quả đã có (2026-10-29)
- 2 ảnh khác nội dung, cùng tên `image.png`, thả vào: cả hai được đọc đúng. Nhưng: thông báo sau gửi hiện "Đã lưu vào Tài liệu của tôi: ." (tên rỗng); câu hỏi ảnh đơn giản chạy ~45 giây ở chế độ Nhanh.
- Chưa dán ảnh được: ô nhập không có xử lý `paste`.
- Rủi ro mất ảnh âm thầm: so khớp "đã đăng ký" theo TÊN tệp nên 2 tệp trùng tên che lỗi của nhau.

## Đã sửa (staging, chưa push)
- Dán ảnh/tệp từ clipboard (`onPaste` ở ô nhập).
- Tệp trùng tên/"image.png" tự đặt tên duy nhất (`anh-HHMMSS-n.png`) để người dùng thấy rõ từng thẻ và mô hình phân biệt từng nguồn.
- So khớp lỗi đăng ký theo đường dẫn lưu, không theo tên.
- Thông báo "Đã lưu…" hiện "N tài liệu" thay vì rỗng.

## Kết quả đợt 2 (staging `9f92a5de`)
- Dán 2 ảnh cùng tên (giả lập paste): thẻ tự đặt tên `anh-HHMMSS-1/2.png`, cả hai ảnh được đọc đúng, thông báo "Đã lưu: 2 tài liệu". ĐẠT.
- Tốc độ câu ảnh: tổng ~25s = lấy project Kho 2s + prepare 2,1s + chạy mô hình 20s. Đã bỏ bước 2s (lấy sẵn khi chọn tệp).
- Số liệu: "Doanh thu và CM1 Q3/2026" → 22.900.269.200 VND, CM1 5.672.743.934 (24,8%), khớp `bod-summary` tuyệt đối. 32s, không hiện tên công cụ/code, có câu gợi ý xuất Excel/báo cáo. ĐẠT.
- UX: thông báo "Đã lưu vào Tài liệu của tôi" nằm mãi sang lượt hỏi khác → nay tự tắt sau 8s.

## Còn phải test (chưa làm)
Nhóm 2 (nhiều bước/GA4/GSC), 3, 4 (xuất file, report), 5, 6, 7 (cần tài khoản thành viên thật), 8 (điện thoại), 9 (đo FPS), 11 (eval 25 ca + 10 cặp so Gấu Pro).

## Kết quả eval Argon (2026-10-29, staging `ada85350`, `web/eval/results/s244-qa.*`)
- 24/25 qua kiểm tra code, giám khảo 7,72/8, ~$0,59. Đường nhanh p50 15,4s; đường đầy đủ p50 17,8s, p90 36,7s.
- E4 (thành viên: từ chối gửi Lark + tìm web) 116s lần đầu, chạy lại 47s → biến động lớn; thời gian nằm ở `runWebSearch` (Gemini googleSearch, prompt "comprehensive", chưa giới hạn độ dài/thời gian; module dùng chung Bé Gấu/Gấu Pro).
- D3: giám khảo báo "bịa mã sự việc" nhưng mã là kết quả thật của công cụ `ghiSuViec` (giám khảo không thấy kết quả công cụ) → nghi dương tính giả, cần xem tay.
- Điểm trừ nội dung: A7 thiếu câu so sánh trực tiếp UK vs Nhật; A2 thiếu thư Nimbus; F5 tự nhắc "Gấu Pro" ngoài dữ liệu; C3 thiếu hỏi lại người dùng.
