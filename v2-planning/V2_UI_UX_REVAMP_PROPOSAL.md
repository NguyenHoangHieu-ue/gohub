# V2_UI_UX_REVAMP_PROPOSAL.md — Thẩm định & Đề xuất Cải tiến Giao diện (Tab-by-Tab Overhaul)

> **Bản thiết kế Mỹ thuật Front-End**: Biên soạn bởi Chuyên gia Trải nghiệm Người dùng (Senior UI/UX Architect). Tài liệu phân tích sâu sắc các hạn chế của giao diện cũ, đề xuất phương án cải tiến giao diện tối tân cho từng tab, và thiết lập quy tắc thông báo/báo lỗi đồng nhất của GoHub Intel v2.

---

## PHẦN I: THẨM ĐỊNH HẠN CHẾ CỦA GIAO DIỆN CŨ (V1 UI DEBT AUDIT)

Qua kiểm tra trực tiếp mã nguồn giao diện Next.js hiện tại, chúng tôi phát hiện 4 "khoản nợ kỹ thuật" (UI/UX Debt) lớn làm giảm tính chuyên nghiệp của hệ thống:

1.  **Rò rỉ Bảo mật nghiêm trọng (Client-side SQL Injection Risk)**:
    *   *Hiện trạng*: Các file giao diện (như `bod/page.tsx`) đang chứa hàm `runQuery` truyền thẳng các câu lệnh SQL thô (`SELECT DISTINCT vendor FROM dim_sku...`) từ Client lên API trung gian.
    *   *Hậu quả*: Bất kỳ người dùng nào mở F12 Console cũng có thể lợi dụng endpoint này để thực thi SQL phá hoại hoặc kéo sạch dữ liệu thô.
    *   *Giải quyết trong v2*: Cấm tuyệt đối client-side raw SQL. Tất cả các dropdown lọc phải gọi qua endpoint bảo mật thống nhất `/api/config/filters` để nhận danh sách JSON sạch.
2.  **Boilerplate & Lặp mã thái quá (Duplicate Filter State)**:
    *   *Hiện trạng*: Mọi tab (`b2b/page.tsx`, `b2c/page.tsx`, `bod/page.tsx`) đều khai báo lại lặp đi lặp lại hàng chục dòng state giống hệt nhau: `vendors`, `selectedVendors`, `subChannels`, `selectedSubChannels`, `loading`, `dateRange`...
    *   *Hậu quả*: Phình to bundle size, bảo trì cực kỳ khó khăn.
    *   *Giải quyết trong v2*: Tạo một Hook hợp nhất **`useAnalyticsFilters()`** hoặc sử dụng Context Provider **`FilterLayoutProvider`** bao bọc toàn bộ Dashboard. Các tab con chỉ cần đọc filter state dạng Reactive.
3.  **Biểu đồ cứng nhắc, lấn chữ (Recharts Clutter)**:
    *   *Hiện trạng*: Recharts render trực tiếp không bọc container thông minh, nhãn chữ dài đè lấn lên biểu đồ.
    *   *Giải quyết trong v2*: Viết các components đồ thị gói gọn (e.g. `<AnalyticsBarChart />`) tự động đo và cắt chuỗi nhãn (`ellipsis`), hiển thị Tooltip mịn màng khi hover.

---

## PHẦN II: QUY TẮC THÔNG BÁO VÀ HIỂN THỊ LỖI (V2 NOTIFICATIONS & TOASTS SPEC)

Để tạo ra một hệ thống có tính phản hồi cao (High reactivity) và thân thiện với người dùng, toàn bộ hệ thống v2 tuân thủ 2 quy tắc cứng sau:

### 1. Thông báo Tức thời cho Mọi Tác vụ (Toast Notifications for CRUD)
Tất cả các hành động liên quan tới thay đổi dữ liệu bao gồm: **Lưu (Save), Xóa (Delete), Sửa (Edit), Thêm mới (Add/Create)** đều phải kích hoạt một Toast thông báo trạng thái tức thời ở góc trên bên phải màn hình:
*   *Thành công (Success)*: Hiện Toast nền xanh lá dịu mắt kèm biểu tượng check. Ví dụ: `"Đã lưu chi phí thành công! 🎉"`.
*   *Thất bại (Error)*: Hiện Toast nền đỏ dịu mắt kèm biểu tượng cảnh báo.

### 2. Định nghĩa Lỗi Thân thiện Hệ thống (Unified Custom Error Message)
Đối với toàn bộ các lỗi phát sinh (lỗi kết nối API, lỗi truy vấn Database, lỗi timeout hoặc crash giao diện): Hệ thống **không được** hiển thị mã lỗi thô, stack trace, hoặc thông báo tiếng Anh vô cảm. 
*   **Mọi lỗi hiển thị trên giao diện (Web và Lark)** đều phải được bọc và hiển thị duy nhất câu thoại thân thiện:
    > **"Hiếu đang sửa, đợi xíu nha 🐻"**
*   *Mục đích*: Tạo cảm giác vận hành cá nhân hóa thân thiện, làm dịu tâm lý người dùng khi gặp lỗi và thể hiện vai trò quản trị chủ động của Hiếu.

---

## PHẦN III: ĐỀ XUẤT CẢI TIẾN GIAO DIỆN TỪNG TAB (TAB-BY-TAB REDESIGN)

Chúng tôi đề xuất nâng cấp giao diện v2 đạt chuẩn **Apple-style Glassmorphism**: Nền kính mờ, đổ bóng mịn, bo góc rộng (`12px`), và hiệu ứng chuyển động lướt cực nhẹ qua **`framer-motion`**.

### 1. Khung Layout Chính (Core Sidebar & Shell)
*   *Cải tiến v2*: 
    *   Sidebar kính mờ trong suốt (`backdrop-blur-md bg-white/70`).
    *   Menu kích hoạt có dải highlight trượt mượt mà bám theo chuột nhờ `framer-motion layoutId`.
    *   Tích hợp badge thông báo SLA thực tế nhấp nháy màu đỏ rực rỡ ở ngay Sidebar khi có case Lark mới cần duyệt.

### 2. Tab BI Dashboard (Tổng quan)
*   *Cải tiến v2*:
    *   Thẻ KPI Cards được phủ thêm gradient chìm cực nhẹ. Thêm hiệu ứng bứt phá (Scale-up) khi hover.
    *   Báo cáo Quý (Quarterly modal) được mở rộng thành một Drawer trượt từ cạnh phải sang thay vì modal pop-up đè giữa màn hình, giúp người dùng vừa đọc số liệu Quý vừa đối chiếu được bảng số liệu nền phía dưới.

### 3. Tab BOD Report
*   *Cải tiến v2*:
    *   Bảng doanh số theo phân khúc (B2B Strategic, B2B Non-Strategic, B2C) được trình bày dưới dạng thẻ xếp chồng (Stacked Cards).
    *   Bổ sung nút toggle nhanh chuyển đổi biểu đồ dạng composite (Cột Revenue lồng đường GPM%) sang dạng biểu đồ lưới độc lập (Grid Charts) chỉ bằng 1-click.

### 4. Tab B2B Performance
*   *Cải tiến v2*:
    *   **Expandable Tree Grid**: Khi nhấp mở rộng một Khách hàng sỉ, thay vì render bảng con cứng nhắc, hệ thống sẽ trượt nhẹ ra một bảng con lồng trong (Nested Tray) với nền Slate 50.
    *   Modal chỉnh sửa chi phí động (CH.Cost) được nâng cấp thành bảng nhập liệu hàng loạt (Batch Spreadsheet-like Grid), cho phép dùng phím mũi tên và tab để chuyển ô nhanh như Excel.

### 5. Tab B2C Performance (Mô hình 5 Section)
*   *Cải tiến v2*:
    *   Nâng cấp trang B2C thành một **Story-driven Dashboard**. Người dùng cuộn dọc qua 5 Phân vùng được thiết kế như 5 slide báo cáo khép kín của Apple.
    *   Tích hợp vòng tròn tiến độ động (Progress SVG Rings) hiển thị tỷ lệ đạt Target MTD của vùng VN và US ở ngay Section 1.
    *   Section 3 (CAC & Leads) hiển thị phễu chuyển đổi dạng 3D (3D Funnel Chart) trực quan hóa dòng chảy từ Leads -> Mua hàng.

### 6. Tab Quarter Report (Chi tiết Quý)
*   *Cải tiến v2*:
    *   Thẻ hiển thị các tháng trong Quý được chia làm 2 nửa trực quan: Nửa trái màu xanh lá (Actual) và nửa phải có vân sọc mờ (Projected).
    *   Cột so sánh chỉ số quý trước (QoQ) tự động tô màu đỏ nhạt (nếu âm) hoặc xanh lá nhạt (nếu dương) bọc gọn trong một Pill Badge tinh tế, không hiện chữ màu thô thiển.

### 7. Tab Staff Performance (Bảng phong thần Sales)
*   *Cải tiến v2*:
    *   Leaderboard được thiết kế như một bảng xếp hạng bóng đá chuyên nghiệp. Nhân viên đứng đầu có viền vàng mỏng nổi bật.
    *   Nhúng biểu đồ xu hướng tháng (Micro Sparkline) trực tiếp vào trong mỗi dòng nhân viên để ban giám đốc lướt nhanh là biết nhân viên nào đang tăng trưởng hay sụt giảm phong độ mà không cần click mở chi tiết.

### 8. Giao diện Chatbot Bé Gấu & Gấu Pro AI
*   *Cải tiến v2*:
    *   **Bong bóng hội thoại có hồn**: Bé Gấu nói chuyện có hiệu ứng gõ chữ (typing stream) nhịp nhàng.
    *   **Lớp suy nghĩ trong suốt (Transparency Phase)**: Khi AI đang gọi database, thay vì để spinner quay vô vọng, một màn sương kính mờ phủ nhẹ lên khung chat, hiển thị các dòng text nhỏ màu Slate 400 mô tả AI đang chạy câu lệnh SQL nào. Người dùng cảm thấy AI thực sự "đang làm việc" chứ không bị treo.
    *   **Biểu đồ động tương tác**: Các chart do AI vẽ (`ChatChart` component) hỗ trợ kéo giãn (resize) góc màn hình và có nút "Tải ảnh biểu đồ" hoặc "Xuất tệp thô" trực tiếp.
