# V2_ERRORS_MEM.md — Nhật ký Lỗi hệ thống & Bài học kinh nghiệm (Error Memory)

> **"Học từ sai lầm của quá khứ"**: File này ghi nhận toàn bộ các lỗi nghiêm trọng, bug kinh điển đã từng xảy ra ở hệ thống v1, nguyên nhân gốc rễ (Root cause), và hướng giải quyết triệt để. AI và nhà phát triển tuyệt đối không được lặp lại các vết xe đổ này ở hệ thống v2.

---

## 1. BUG CHỮ KÝ WEBHOOK LARK (LARK SIGNATURE MISMATCH)
*   **Trạng thái xảy ra**: v1 (s159 → s176). Chặn toàn bộ tin nhắn từ Lark tới Production trong suốt 1 tuần làm Bé Gấu bị câm hoàn toàn.
*   **Triệu chứng**: Webhook Lark `/api/lark/events` nhận request thật nhưng báo lỗi `[Lark] signature mismatch — request rejected` và reject 100% cuộc hội thoại.
*   **Nguyên nhân gốc rễ (Root Cause)**: Hàm `verifyLarkSignature()` sử dụng thuật toán HMAC-SHA256 ký bằng `LARK_VERIFICATION_TOKEN`. Tuy nhiên, đặc tả kỹ thuật (Spec) của Lark chỉ ra: Khi ứng dụng có bật **Encrypt Key** (AES payload decryption), chữ ký gửi kèm tiêu đề bắt buộc phải tính bằng công thức:
    $$\text{Expected Signature} = \text{sha256}(\text{timestamp} + \text{nonce} + \text{LARK\_ENCRYPT\_KEY} + \text{rawBody})$$
    *Lỗi kép: Sai thuật toán (dùng HMAC thay vì SHA256 thường) và sai Khóa bảo mật (dùng Verification Token thay vì Encrypt Key).*
*   **Bài học kinh nghiệm cho v2**:
    *   Sử dụng đúng thuật toán SHA256 thường phối hợp với `LARK_ENCRYPT_KEY` để kiểm tra chữ ký.
    *   Tuyệt đối không tự đoán Spec bảo mật của các nền tảng bên ngoài (Lark, Facebook, Telegram). Luôn đọc kỹ tài liệu chính thống.

---

## 2. GEMINI AI BỊ CẮT CỤT PHẢN HỒI JSON (JSON COMPLETION TRUNCATION)
*   **Trạng thái xảy ra**: v1 (s177b).
*   **Triệu chứng**: Giao diện My Metrics báo "0 case" khi quét lịch sử chat từ Lark. Kiểm tra nhật ký log Vercel phát hiện phản hồi JSON của Gemini bị cắt cụt giữa chừng (`"completion_reply` bị đứt ngang, mất dấu đóng ngoặc nhọn), khiến `JSON.parse` bị crash liên tục.
*   **Nguyên nhân gốc rễ (Root Cause)**: Cài đặt `maxOutputTokens: 500` cho mô hình `gemini-3.6-flash` là quá thấp. Do Gemini tốn một lượng token ẩn khổng lồ cho tiến trình suy nghĩ (Thinking Budget), lượng token này ăn sạch hạn mức đầu ra trước khi mô hình kịp sinh ra chuỗi JSON thật.
*   **Bài học kinh nghiệm cho v2**:
    *   Tăng hạn mức `maxOutputTokens` lên tối thiểu **4000** đối với các tác vụ AI trả về JSON hoặc cần suy nghĩ phức tạp.
    *   Bọc tất cả các câu lệnh phân tích AI trong cơ chế **generate-with-retry** (`genWithRetry`) để tự động thử lại 3 lần bằng cơ chế giãn cách (backoff) khi gặp lỗi nghẽn mạng hoặc quá tải API tạm thời.

---

## 3. LARK OAUTH THIẾU THÔNG TIN ĐỊNH DANH (LARK OPEN_ID EMPTY)
*   **Trạng thái xảy ra**: v1 (s175).
*   **Triệu chứng**: Người dùng kết nối Lark OAuth thành công nhưng hệ thống báo "0 case" do không gán đúng tài khoản người duyệt.
*   **Nguyên nhân gốc rễ (Root Cause)**: Phản hồi trả về từ cổng trao đổi Token (Lark OAuth v2 token-exchange response) **không chứa thuộc tính `open_id`** của người dùng. Code cũ cố ý đọc trực tiếp `tok.open_id` nên trường này luôn bị `undefined`.
*   **Bài học kinh nghiệm cho v2**:
    *   Bắt buộc gọi thêm endpoint độc lập `GET /open-apis/authen/v1/user_info` truyền Access Token vừa nhận để lấy được thông tin định danh `open_id` chính xác của người dùng.

---

## 4. TRÙNG LẶP DANH TÍNH DO EMAIL RỖNG (USER IDENTITY COLLISION)
*   **Trạng thái xảy ra**: v1 (s163).
*   **Triệu chứng**: Một nhân viên được mời vào nhóm Tổ Gấu X, tuy nhiên tất cả các nhân viên khác (dù không được mời) vẫn có thể truy cập vào đọc tài liệu và tin nhắn chat của nhóm X.
*   **Nguyên nhân gốc rễ (Root Cause)**: Hệ thống định danh người dùng bằng trường `email` lấy từ session đăng nhập. Tuy nhiên, có hơn 43 tài khoản đăng nhập qua Lark OAuth **không liên kết email thật (email trả về bị trống `NULL`)**. Hệ thống xử lý fallback email rỗng thành chuỗi rỗng `""`. Hậu quả: Mọi nhân viên không-email cùng chia sẻ chung một danh tính là `""`, dẫn tới lỗ hổng bảo mật nghiêm trọng rò rỉ dữ liệu chéo.
*   **Bài học kinh nghiệm cho v2**:
    *   **Nghiêm cấm** dùng trường có khả năng bị trống (như `email` trong Lark login) để làm khóa định danh duy nhất (Unique Identity).
    *   Chuyển đổi toàn bộ khóa định danh người dùng và kiểm tra thành viên sang trường **`username`** (luôn duy nhất, luôn có giá trị thật bất kể hình thức đăng nhập).

---

## 5. CƠ CHẾ XOÁ CACHE LÀM CHẬM TOÀN APP (GLOBAL CACHE FLUSH COLLATERAL DAMAGE)
*   **Trạng thái xảy ra**: v1 (s169c).
*   **Triệu chứng**: Mỗi khi người dùng chỉnh sửa chi phí (Cost Management) hoặc thay đổi Target, toàn bộ trang web GoHub Intel bị chậm hẳn trong vài tiếng đồng hồ, các tab BI tải rất lâu.
*   **Nguyên nhân gốc rễ (Root Cause)**: Khi cập nhật chi phí, hệ thống kích hoạt hàm `flushAnalyticsCache()` để xóa sạch toàn bộ cache của cơ sở dữ liệu. Điều này nuke sạch cả các cache hoàn toàn độc lập (như danh mục Products, SKU, Staff, SQL Explorer registry) bắt buộc toàn bộ người dùng đang online phải query trực tiếp (live query) vào `gohub_dw`, gây nghẽn băng thông kết nối.
*   **Bài học kinh nghiệm cho v2**:
    *   Sử dụng cơ chế xóa cache theo phạm vi mục tiêu (**Scoped Cache Flushing**). 
    *   Định nghĩa danh sách tiền tố `B2B_COST_CACHE_PREFIXES` và chỉ dọn dẹp các cache key bắt đầu bằng tiền tố liên quan đến nghiệp vụ vừa thay đổi.

---

## 6. LỖI LẤN CHỮ, ĐÈ CHỮ TRÊN BIỂU ĐỒ (RECHARTS LABEL OVERLAPPING)
*   **Trạng thái xảy ra**: v1 (s176).
*   **Triệu chứng**: Tên SKU hoặc tên khách hàng sỉ quá dài đè lấn lên các thanh cột (bars) của biểu đồ Recharts YAxis, gây mất mỹ quan và không thể đọc được thông tin.
*   **Nguyên nhân gốc rễ (Root Cause)**: Phần tử văn bản SVG của Recharts không có cơ chế tự động wrap dòng hoặc cắt chữ. Việc ước lượng chiều rộng động theo độ rộng layout không hoạt động chính xác khi tên sản phẩm biến động lớn.
*   **Bài học kinh nghiệm cho v2**:
    *   Thiết lập chiều rộng trục Y cố định (ví dụ `width={92}`).
    *   Sử dụng thuộc tính `tickFormatter` cắt ngắn chuỗi thông minh (ellipsis sau 11-12 ký tự) và bọc ngoài bằng `Tooltip` để hiển thị đầy đủ tên khi di chuột qua.
