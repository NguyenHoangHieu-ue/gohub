# Test Plan: Tổ Gấu 🐻 — Kiểm thử toàn diện

> Ngày tạo: 2026-08-11
> Môi trường: staging → https://gohub-intel.vercel.app/analytics/to-gau
> Người test: Hiếu (creator) + 1 tài khoản member thường + 1 tài khoản chưa được add vào group nào

---

## Tài khoản test cần chuẩn bị

| Role | Tài khoản | Mục đích |
|---|---|---|
| Creator/Admin | Hiếu | Toàn quyền |
| Member | Tài khoản nhân viên đã có | Quyền giới hạn |
| Non-member | Tài khoản nhân viên chưa được add | Kiểm tra visibility |

---

## 1. List Groups — `/analytics/to-gau`

### 1.1 Visibility (Phase 5 #1)
- [ ] **Creator**: thấy tất cả active groups + nút "Tạo nhóm" + tab "Lưu trữ"
- [ ] **Member (không thuộc group nào)**: thấy danh sách tên group nhưng nút "Xem nhóm" màu slate (không phải xanh)
- [ ] **Member (thuộc 1+ group)**: group mình là member → nút "Vào nhóm" xanh; group không phải member → nút "Xem nhóm" slate
- [ ] Tab "Lưu trữ" **không hiện** với member thường

### 1.2 Tạo group (creator only)
- [ ] Bấm "Tạo nhóm" → modal hiện
- [ ] Chọn emoji, nhập tên, nhập mô tả → bấm "Tạo nhóm"
- [ ] Group mới xuất hiện trong grid

### 1.3 Archived groups
- [ ] Creator: bấm "Lưu trữ" → hiện danh sách group archived
- [ ] Group archived có badge "Lưu trữ" và opacity nhạt hơn
- [ ] Bấm "Xem nhóm" trên archived group → vào được, thấy banner cảnh báo

---

## 2. Chat Room — `/analytics/to-gau/[id]`

### 2.1 Access control
- [ ] **Non-member** click vào group → trang hiện "Bạn chưa được thêm vào nhóm này. Liên hệ Hiếu để được cấp quyền."
- [ ] **Member** vào group của mình → load bình thường
- [ ] **Archived group** → hiện banner amber "Nhóm này đã được lưu trữ. Chỉ có thể xem, không thể gửi tin."
- [ ] Input bar **ẩn** khi group archived

### 2.2 Header
- [ ] Hiện emoji + tên nhóm + số thành viên
- [ ] Badge "AI" hiện nếu group bật AI
- [ ] Nút search 🔍 hoạt động

### 2.3 Gửi tin nhắn (Phase 1)
- [ ] Gõ text → Enter gửi (Shift+Enter xuống dòng)
- [ ] Tin nhắn của mình: bong bóng xanh bên phải
- [ ] Tin nhắn người khác: bong bóng trắng bên trái + avatar
- [ ] Tin nhắn mới nhất hiện dưới cùng, auto-scroll xuống
- [ ] **Realtime**: mở 2 tab cùng group → gửi từ tab 1, tab 2 nhận ngay không cần reload

### 2.4 Upload file/ảnh (Phase 2)
- [ ] Bấm 📎 → chọn ảnh → hiện preview trước gửi
- [ ] Bấm 📎 → chọn file PDF/Excel → hiện tên file preview
- [ ] Gửi → ảnh hiện inline trong bubble, có thể click để xem fullscreen
- [ ] Gửi → file hiện card "Tải về"
- [ ] File > 20MB → báo lỗi

### 2.5 AI Gấu Tổ (Phase 2)
- [ ] Group có AI bật: hiện nút 🤖 bên cạnh textarea
- [ ] Gõ câu hỏi → bấm 🤖 → AI trả lời bằng bubble gradient indigo/purple + icon 🤖
- [ ] AI nhớ context 20 tin nhắn gần nhất trong group
- [ ] Group tắt AI: nút 🤖 **không hiện**

### 2.6 @mention (Phase 4)
- [ ] Gõ `@` → dropdown xuất hiện danh sách member
- [ ] Gõ thêm ký tự → lọc theo tên/email
- [ ] Click/Enter chọn → mention được insert vào text
- [ ] Gửi → mention của mình highlight vàng, mention người khác highlight xanh

### 2.7 Tìm kiếm tin nhắn (Phase 4)
- [ ] Bấm 🔍 → search panel mở, input focus tự động
- [ ] Gõ từ khóa → debounce 300ms → hiện kết quả
- [ ] Click kết quả → scroll đến tin nhắn đó + flash highlight vàng
- [ ] Bấm ✕ → xóa query, bấm 🔍 lần 2 → đóng panel

### 2.8 Ghim tin nhắn (Phase 4)
- [ ] Hover tin nhắn → nút "Ghim" xuất hiện (creator/admin/manager)
- [ ] Bấm "Ghim" → strip ghim xuất hiện ở trên chat
- [ ] Strip hiện số lượng tin đã ghim, có thể expand/collapse
- [ ] Bấm "Bỏ ghim" → tin biến khỏi strip
- [ ] Member thường: **không thấy** nút Ghim

### 2.9 Sửa tin nhắn (Phase 5 #4)
- [ ] Hover tin nhắn của mình → nút "Sửa" xuất hiện
- [ ] Bấm "Sửa" → inline textarea thay thế bubble
- [ ] Chỉnh nội dung → Enter hoặc bấm "Lưu"
- [ ] Tin nhắn cập nhật + hiện label "(đã sửa)" nhỏ cạnh timestamp
- [ ] Bấm "Hủy" → form đóng, nội dung không đổi
- [ ] **Manager**: cũng thấy nút "Sửa" trên tin nhắn của member khác

### 2.10 Thu hồi tin nhắn (Phase 5 #4)
- [ ] Hover → nút "Thu hồi" xuất hiện
- [ ] Bấm → confirm dialog → xác nhận
- [ ] Tin nhắn đổi thành italic "Tin nhắn đã được thu hồi", attachment ẩn
- [ ] **Manager**: thu hồi được tin nhắn của member

### 2.11 Scroll-to-bottom (Phase 4)
- [ ] Scroll lên xem tin cũ → nút ⬇ xuất hiện góc dưới phải
- [ ] Bấm → scroll xuống tin mới nhất

---

## 3. Tab Docs — 📄 Docs

### 3.1 Upload tài liệu (Phase 3)
- [ ] Bấm "Tải lên" → form hiện
- [ ] Nhập tiêu đề + mô tả + chọn file + thêm tags (Enter/dấu phẩy) → "Lưu tài liệu"
- [ ] Card mới xuất hiện trong grid với đúng icon theo loại file (PDF/Excel/Word/Ảnh)
- [ ] File không có attachment: chỉ có text title/desc

### 3.2 Xem / Tải về
- [ ] Bấm nút ⬇ trên card → file download
- [ ] File ảnh → có thể click xem fullscreen

### 3.3 Xóa tài liệu
- [ ] Creator/admin/manager: thấy nút 🗑 → bấm → xóa
- [ ] Member thường: chỉ xóa được doc do mình upload

---

## 4. Tab Notes — 📌 Notes

### 4.1 Thêm ghi chú (Phase 3)
- [ ] Nhập nội dung textarea → bấm "Thêm ghi chú"
- [ ] Note mới xuất hiện đầu danh sách

### 4.2 Sửa ghi chú
- [ ] Bấm ✏ → textarea inline với nội dung hiện tại
- [ ] Sửa → "Lưu" → nội dung cập nhật + "(đã sửa)" label
- [ ] Creator/admin/manager sửa được note của bất kỳ ai

### 4.3 Xóa ghi chú
- [ ] Bấm 🗑 → confirm → xóa
- [ ] Creator/admin/manager xóa được note của bất kỳ ai

---

## 5. Cài đặt nhóm (⚙️ Settings Modal)

### 5.1 Ai thấy nút Settings?
- [ ] Creator/admin → thấy nút "Cài đặt" trong sidebar phải
- [ ] **Manager của group** → cũng thấy nút "Cài đặt" (Phase 5 #2)
- [ ] Member thường → **không thấy**

### 5.2 Thông tin nhóm (creator only)
- [ ] Đổi emoji + tên + mô tả → "Lưu thay đổi" → header group cập nhật
- [ ] Member/Manager vào Settings: **không thấy** form thông tin nhóm

### 5.3 Quản lý thành viên (creator + manager)
- [ ] Danh sách member hiện với role badge (Admin/Manager/Thành viên)
- [ ] **User search autocomplete (Phase 5 #3)**:
  - Gõ tên/email vào ô "Tìm theo tên hoặc email" → dropdown gợi ý xuất hiện sau 300ms
  - Gợi ý lọc bỏ người đã là member
  - Click gợi ý → email điền vào ô input
  - Bấm "Thêm thành viên" → thêm thành công
- [ ] Bấm 🗑 cạnh member → xóa member

### 5.4 Role dropdown (creator only, Phase 5 #2)
- [ ] Cạnh mỗi member (trừ admin) có dropdown "Manager / Thành viên"
- [ ] Đổi sang Manager → member đó được pin/sửa/thu hồi/add-remove member
- [ ] Đổi về Thành viên → mất quyền manager
- [ ] Creator không đổi được role của admin

### 5.5 Cài đặt AI (creator only)
- [ ] Toggle bật/tắt AI
- [ ] Textarea scope + 4 preset (Sale/BD/Ops/Full)
- [ ] Bấm "Lưu cài đặt AI" → áp dụng

---

## 6. Lark Notification (Phase 4)

- [ ] Group có `notify_lark = true`, member có lark_open_id
- [ ] Người A gửi tin → Người B nhận DM Lark: `[🐻 Tên nhóm] Người A: nội dung...`
- [ ] Người gửi **không tự nhận** DM của chính mình
- [ ] Group tắt notify_lark: không có DM nào

---

## 7. Edge cases

- [ ] Gửi tin khi mất mạng → error toast, nội dung restore vào input
- [ ] Thêm member email không tồn tại trong hệ thống → báo lỗi rõ ràng
- [ ] Thêm member đã là member → báo lỗi duplicate
- [ ] Thu hồi tin nhắn AI (msg_type=ai) → nút "Sửa" không hiện (chỉ "Thu hồi")
- [ ] Group archived: input bar ẩn, tabs Docs/Notes vẫn xem được

---

## Checklist tổng kết

| Nhóm tính năng | Số TC | Pass | Fail |
|---|---|---|---|
| 1. List Groups | 8 | | |
| 2. Chat Room | 16 | | |
| 3. Tab Docs | 4 | | |
| 4. Tab Notes | 4 | | |
| 5. Settings Modal | 10 | | |
| 6. Lark Notification | 3 | | |
| 7. Edge cases | 5 | | |
| **Tổng** | **50** | | |
