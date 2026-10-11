# Plan: Nâng cấp browser của Gấu Pro (Bridge extension 1.3.0)

> File TẠM. Xong hết mốc (hoặc Hiếu bỏ plan) thì xoá file + dòng trong CLAUDE.md, chuyển kiến thức sang wiki `analytics-creator-ai.md`.
> Lập 2026-10-11 (s230). Hiếu: BỎ phần tự cài extension (anh hướng dẫn mọi người cài tay); làm các phần còn lại.

## Vấn đề hiện tại (v1.2.2)
Click/gõ giả (`el.click()`, event tự tạo) bị nhiều trang bỏ qua; không có mắt (chỉ innerText 12k + 150 phần tử, không ảnh); selector CSS dễ gãy, không xuyên iframe/shadow DOM;
thiếu thao tác (dropdown, tick, phím, hover, chờ tải, tab mới/đóng); poll 15s khi rảnh; không cô lập tab; quyền <all_urls> không giới hạn.

## Hướng làm (mặc định đã chọn, Hiếu chưa phản đối)
- **B1 mắt + tay:** `chrome.debugger` (CDP) cho click/gõ/phím TIN CẬY + chụp ảnh; `snapshot` có mã tham chiếu (ref) xuyên shadow DOM + iframe cùng origin; chờ (`wait_for`); quản lý tab (mở nền trong nhóm "🐻 Gấu Pro", chỉ đóng tab do Gấu mở); điều hướng chờ tải xong. Tool cũ `readMyBrowser`/`controlMyBrowser` MỞ RỘNG action (tương thích ngược).
- **B2 nhanh:** trang web báo "wake" cho extension (content script ↔ postMessage) ngay khi Gấu bắt đầu gọi tool browser → lệnh chạy ~1s thay vì chờ poll 15s. Không tăng tải server.
- **B3 an toàn:** danh sách trang nhạy cảm CHẶN mặc định (ngân hàng, thanh toán, đổi mật khẩu, trình quản lý mật khẩu, chrome://, file://) ở cả extension lẫn server; người dùng thêm trang chặn/cho phép trong popup; khung viền + nút DỪNG khẩn cấp trên trang khi Gấu đang thao tác; list_tabs ẩn tiêu đề/URL tab nhạy cảm.
- **B5 đo:** trang thử `/bridge-lab.html` (dropdown, tick, chờ nội dung, iframe, shadow DOM, canvas, form) + checklist đo thành công/số bước/thời gian bản cũ vs mới.
- **B4 (hoãn):** tải/tải lên file, ghi-và-chạy-lại quy trình, chạy theo lịch — làm sau khi B1–B3 chạy ổn.
- **Bỏ:** tự động cài extension (B0).

## Giới hạn khi làm (cần ghi rõ)
Môi trường dev không cài được extension vào Chrome thật → server test bằng unit test; extension chỉ kiểm cú pháp + logic thuần. **Hiếu cần tải bản 1.3.0, giải nén đè, reload, bấm cho phép quyền mới (debugger, tabGroups)**, rồi QA bằng trang thử.

## Tiến độ (2026-10-11, staging)
- [x] B1 mắt+tay (extension 1.3.0), [x] B2 wake, [x] B3 an toàn (chặn trang nhạy cảm, overlay+Dừng, allow/block trong popup, gỡ cổng duyệt từng click), [x] B5 trang Bridge Lab + `pageOp` kiểm trong Chrome thật.
- [ ] **Hiếu cài 1.3.0 và QA bằng `/bridge-lab.html` (T1–T10)** — phần `chrome.debugger`/tab group/overlay chưa kiểm được ở môi trường dev.
- [ ] B4: tải/tải lên file, ghi-chạy-lại quy trình, chạy theo lịch (hoãn).
- [ ] So bản cũ/mới bằng bộ T1–T10 (tỉ lệ thành công, số bước, thời gian) sau khi QA.
