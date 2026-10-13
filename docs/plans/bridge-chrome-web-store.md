# Bridge extension → Chrome Web Store (bản "Không công khai")

> File TẠM (s232). Xong thì xoá + chuyển điều còn giá trị sang wiki `analytics-creator-ai.md`.

Mục tiêu: mọi người được cấp Gấu Pro cài extension bằng link Chrome Web Store thay vì tải zip + giải nén.

## Chọn chế độ hiển thị: **Unlisted (Không công khai)**
- Chỉ người có link cài được, không tìm thấy trên store. Phù hợp công cụ nội bộ. Vẫn phải qua duyệt của Google.
- Cập nhật phiên bản = tải zip mới lên store, người dùng tự cập nhật (hết cảnh "giải nén đè + bấm ↻").

## Việc Hiếu làm (cần tài khoản Google của Hiếu / công ty, mình không làm thay được)
1. Đăng ký nhà phát triển: https://chrome.google.com/webstore/devconsole (phí một lần 5 USD, bật xác minh 2 bước).
2. Tạo "New item" → tải `GoHub-Bridge-<version>.zip` (đóng gói: `python web/scripts/pack_bridge_extension.py`).
3. Tab **Store listing**: chép nội dung ở mục "Nội dung điền form" bên dưới; thêm 1–2 ảnh chụp popup + ảnh thao tác (1280×800), biểu tượng 128×128.
4. Tab **Privacy**: chép "Lý do từng quyền" + "Single purpose"; khai báo **không bán, không dùng cho mục đích khác**; điền URL chính sách quyền riêng tư (cần 1 trang công khai — xem bên dưới).
5. Tab **Distribution**: chọn **Unlisted**, chọn quốc gia, gửi duyệt. Lần đầu thường 1–7 ngày, có thể bị hỏi lại về quyền `debugger` và `<all_urls>`.
6. Có link cài → em gắn vào thông báo DM + trang Bridge.

## Rủi ro bị từ chối (phải biết trước)
- Quyền **`debugger`** + **`<all_urls>`** là hai quyền Google soi kỹ nhất. Cần giải thích rõ: click/gõ thật qua giao thức Chrome DevTools, chỉ trên tab người dùng cho phép, có nút DỪNG, trang nhạy cảm bị chặn cứng.
- Mô tả cũ trong `manifest.json` ghi "cài tay, không publish Chrome Web Store" → phải đổi trước khi nộp.
- `content_scripts.matches` đang có `http://localhost:3000/*` và `https://stg-intel-v2.gohub.cloud/*` → bản nộp store nên bỏ localhost (giữ production; staging tuỳ).
- `identity`/`identity.email` dùng để ghi nhận thiết bị (`getProfileUserInfo`) → phải nêu trong mục lý do quyền, hoặc bỏ nếu không cần.
- Nếu bị từ chối: phương án dự phòng = giữ cách tải zip hiện tại.

## Nội dung điền form
**Tên:** GoHub Gấu Pro Bridge
**Mô tả ngắn (≤132 ký tự):** Cho trợ lý Gấu Pro của GoHub đọc và thao tác trên các tab Chrome bạn cho phép, có nút DỪNG bất cứ lúc nào.
**Mô tả chi tiết:** Extension dành cho nhân viên GoHub dùng Gấu Pro (https://intel-v2.gohub.cloud). Khi bạn nhờ Gấu Pro làm việc trên trình duyệt, extension nhận lệnh từ chính tài khoản của bạn, đọc nội dung trang, bấm nút, điền ô nhập trên tab được phép rồi báo kết quả. Mỗi người một mã ghép nối riêng. Trang ngân hàng, thanh toán, đổi mật khẩu và trình quản lý mật khẩu bị chặn cứng. Trang đang được điều khiển có khung viền cam và nút DỪNG; tắt công tắc trong popup là dừng hẳn. Cần tài khoản GoHub được cấp quyền Gấu Pro.
**Single purpose:** Cho phép trợ lý GoHub Gấu Pro, do người dùng đã đăng nhập điều khiển, đọc và thao tác trên các tab Chrome của chính người đó.

## Lý do từng quyền (mục Privacy)
- `tabs`, `tabGroups`: liệt kê, mở, đóng, nhóm tab "Gấu Pro" mà người dùng cho phép.
- `scripting`: đọc cấu trúc trang (snapshot có mã tham chiếu) và đặt khung viền/nút DỪNG trên trang đang điều khiển.
- `debugger`: gửi click, gõ phím, chụp ảnh "tin cậy" qua giao thức DevTools (nút/ô trên nhiều trang không nhận sự kiện giả lập). Tự tháo sau 30 giây không dùng.
- `host_permissions <all_urls>`: người dùng có thể nhờ Gấu thao tác trên bất kỳ trang làm việc nào; extension chặn trang nhạy cảm theo danh sách cố định và danh sách người dùng tự chặn/cho phép.
- `storage`: lưu máy chủ, mã ghép nối, công tắc, danh sách cho phép/chặn.
- `notifications`: báo khi Gấu vừa thao tác hoặc bị dừng.
- `alarms`: nhịp kiểm tra lệnh mới khi service worker ngủ.
- `identity`, `identity.email`: ghi nhận thiết bị đang dùng (tên hồ sơ Chrome) để người dùng thấy và thu hồi thiết bị lạ.

## Dữ liệu gửi đi (cho mục khai báo dữ liệu)
- Nội dung trang/ảnh chụp chỉ gửi về máy chủ GoHub khi người dùng nhờ Gấu Pro đọc tab đó; không bán, không chia sẻ bên thứ ba ngoài nhà cung cấp AI của GoHub xử lý yêu cầu.
- Không thu lịch sử duyệt web ngầm. Không đọc tab khi công tắc tắt.

## Chính sách quyền riêng tư (cần URL công khai)
Chưa có trang. Em có thể thêm `/privacy-bridge` (trang tĩnh, không cần đăng nhập) trên production — Hiếu duyệt nội dung trước khi lên.
