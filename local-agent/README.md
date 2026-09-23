# GoHub local agent

Tiến trình chạy nền trên máy creator để Gấu Pro đọc và sửa file cục bộ (tool `localFiles`). Nó poll hàng đợi Bridge,
chỉ nhận lệnh `fs_*`, và chỉ làm việc trong các thư mục `roots`.

## Chạy

1. Cần Node >= 18. Không cần `npm install`.
2. `node local-agent/daemon.mjs` — lần đầu tạo `%USERPROFILE%\.gohub-agent\config.json` rồi thoát.
3. Mở config: dán token Bridge (trang `/analytics/creator/bridge`), chỉnh `baseUrl` (staging/production) và `roots`.
4. Chạy lại `node local-agent/daemon.mjs` (hoặc `start-agent.cmd`). Log ở `%USERPROFILE%\.gohub-agent\agent.log`.

## Tự chạy khi mở máy

- `powershell -ExecutionPolicy Bypass -File local-agent\install-autostart.ps1` — tạo shortcut "GoHub Agent" trong
  Startup (tự chạy ẩn khi đăng nhập Windows) + trên Desktop (bấm đúp để bật tay nếu đã tắt). Gỡ: thêm `-Uninstall`.
- Chỉ 1 bản chạy (khoá `agent.pid`) — bấm shortcut khi daemon đang chạy thì bản mới tự thoát.
- Tắt: Task Manager → `node.exe` có dòng lệnh chứa `daemon.mjs`.

## An toàn

- Chỉ đọc/ghi trong `roots`; chặn `..`, symlink trỏ ra ngoài, thư mục `.git`/`node_modules`.
- Không bao giờ đọc/ghi file bí mật: `.env*`, `*.pem|key|pfx|p12|kdbx`, `id_rsa*`, tên chứa `secret`/`credentials`.
- Mỗi lần ghi/sửa đều backup bản cũ vào `%USERPROFILE%\.gohub-agent\backups\<thời điểm>\...`. Không có lệnh xoá.
- File text ≤ 256KB. File nhị phân (docx/xlsx/pdf) chưa hỗ trợ.
- Thu hồi quyền: xoá thiết bị ở `/analytics/creator/bridge` hoặc tắt tiến trình.

Poll 10s khi rảnh, 2s trong 3 phút sau mỗi lệnh (giữ số lần gọi Vercel thấp).
