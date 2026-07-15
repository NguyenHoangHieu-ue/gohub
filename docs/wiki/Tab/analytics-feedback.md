---
title: "User Feedback (Ý Kiến Đóng Góp Người Dùng)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, feedback]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# User Feedback (Ý Kiến Đóng Góp Người Dùng)

Nơi mọi user gửi phản hồi/góp ý về hệ thống; admin/creator xem & xử lý.

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/feedback` — `web/src/app/(dashboard)/analytics/feedback/page.tsx` |
| API | `/api/feedbacks`, `/api/feedbacks/[id]` |
| Nguồn | **Supabase `feedbacks`** |

## 2. Nội dung
- Ai cũng gửi được phản hồi (mọi role).
- Admin/creator xem danh sách, cập nhật trạng thái, phản hồi.

## 3. Gotchas
- Nguồn Supabase, không phải gohub_dw.
