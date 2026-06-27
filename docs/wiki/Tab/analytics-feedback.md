# User Feedback (Ý Kiến Đóng Góp Người Dùng)

Cổng thu thập đánh giá chất lượng, phản hồi của nhân viên và người dùng về độ chính xác và hiệu quả của các công cụ và số liệu trên hệ thống GoHub Intel.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/feedback` (`web/src/app/(dashboard)/analytics/feedback/page.tsx`)
- **API Feedbacks**: `/api/feedbacks` (`web/src/app/api/feedbacks/route.ts`)

---

## 2. Luồng Vận Hành
- **Gửi phản hồi**: Người dùng hệ thống có thể biên soạn và gửi các đóng góp ý kiến kèm theo thang điểm đánh giá mức độ hài lòng trực tiếp trên giao diện Web.
- **Lưu trữ dữ liệu**: Dữ liệu phản hồi được ghi nhận lập tức vào bảng `feedbacks` trong Supabase để chuyển đến bộ phận phát triển (Team Tech) theo dõi cải tiến.
- **Hiển thị báo cáo**: Hệ thống tổng hợp các ý kiến đóng góp thành bảng thống kê trực quan để Ban giám đốc và Admin theo dõi chất lượng vận hành thực tế.

---

## 3. Phân Quyền
- **Gửi ý kiến**: **Tất cả người dùng** trong hệ thống (từ vai trò Standard đến Admin) đều được quyền gửi ý kiến đóng góp.
- **Xem báo cáo đóng góp**: Chỉ những người dùng có quyền thuộc nhóm **Admin / Manager / Creator / BOD** mới được phép xem bảng tổng hợp danh sách góp ý chi tiết từ người dùng khác.\n