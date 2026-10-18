# Kiểm kê dữ liệu: Scheduled Messages

> Sinh bởi `web/scripts/qa/queries.mjs`. Ký hiệu «ᴸ» = nguồn nằm trong thư viện (lib) mà route import (một cấp). Mỗi route phải được QA ở G1: tham số → SQL → số, với nguồn đối chiếu độc lập.

Route quét: 2

| Route | Phương thức | Tham số đọc | Bảng gohub_dw | Supabase | Turso | Nguồn ngoài | Hàm lọc | Hàm chi phí/pro-rata | Cache (nocache) | Quyền |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/admin/scheduled-messages` | GET, POST |  |  | app_settings, lark_scheduled_messages, usersᴸ |  |  |  |  | 0× (không nocache) | getServerSession, getDbRole |
| `/api/user/me` | GET |  |  | users, app_settings, app_settingsᴸ |  |  |  |  | 0× (không nocache) | getServerSession |

## Khoá cache khai báo

_(không)_

## Điểm cần chú ý khi QA (tự phát hiện từ quét)

_(không có)_
