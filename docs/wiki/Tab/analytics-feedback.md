# User Feedback (Ý Kiến Đóng Góp Người Dùng)

Cổng thu thập đánh giá/phản hồi của người dùng về độ chính xác & hiệu quả của công cụ, số liệu trên hệ thống.

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: kênh để mọi nhân viên góp ý/báo lỗi số liệu trực tiếp trên web → Team Tech theo dõi cải tiến; BOD/Admin nắm chất lượng vận hành thực tế.
- **Tại sao mọi role gửi được**: feedback càng nhiều người gửi càng tốt → không giới hạn quyền gửi (chỉ giới hạn quyền XEM tổng hợp).

## 2. Đường dẫn & file
- **Web**: `/analytics/feedback` — `web/src/app/(dashboard)/analytics/feedback/page.tsx`
- **API**: `/api/feedbacks`

## 3. Luồng vận hành & lưu trữ
- **Gửi**: người dùng soạn góp ý + thang điểm hài lòng → POST `/api/feedbacks`.
- **Lưu trữ**: ghi vào bảng `feedbacks` (Supabase) ngay lập tức.
- **Báo cáo**: tổng hợp thành bảng cho Admin/BOD theo dõi.

## 4. Phân quyền
- **Gửi ý kiến**: TẤT CẢ vai trò (Standard → Admin).
- **Xem tổng hợp**: chỉ **Admin / Manager / Creator / BOD**.
