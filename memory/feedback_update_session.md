---
name: feedback_update_session
description: Cập nhật session_summary.txt + memory sau mỗi session (không cần nhắc)
metadata:
  type: feedback
---

**Rule**: Mỗi khi hoàn thành session → tự động cập nhật:
1. `docs/session_summary.txt` — ghi lại công việc đã làm
2. `memory/` files — track rules/learnings cho future sessions

**Why**: 
- Session summary giúp hiểu tiến độ dự án
- Memory files giúp lần sau không phải giải thích lại từ đầu
- Không cần user nhắc — tự động save knowledge

**How to apply**:

**Session summary**:
- Mở `docs/session_summary.txt`
- Thêm section `## Session N (ngày)` 
- Liệt kê công việc dạng: `N. [Tên fix/feature]: [chi tiết ngắn]`
- Giữ nguyên format cũ (dùng số thứ tự tiếp, không reset per session)

**Memory**:
- Nếu là feedback/rule → tạo `memory/feedback_<name>.md` hoặc update
- Nếu là business knowledge → update `memory/business_knowledge.md`
- Nếu là user profile → update `memory/user_profile.md`
- Cập nhật `memory/MEMORY.md` index

**Example từ session này**:
```
## Session 3 — tiếp (2026-06-06, lần 2)
48. Đọc chi tiết TaiLieuCongTy_Chung...
49. Chatbot: 5 rules mới...
50. Chatbot: fix cơ bản...
...

[Sau đó tạo chatbot_rules.md, business_knowledge.md, update MEMORY.md]
```

**Không cần user nhắc** — làm tự động mỗi khi kết thúc session
