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
