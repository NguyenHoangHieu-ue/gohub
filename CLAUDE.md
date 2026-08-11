# CLAUDE.md — GoHub Intel · START HERE

> File này auto-load mỗi session. Đọc hết trước khi làm bất cứ thứ gì.

---

## Trạng thái hiện tại (2026-08-11, s142)

| | |
|---|---|
| Branch làm việc | `staging` |
| staging = main | `7b9ac65` |
| tsc | PASS · vitest 125/125 |

**Migrations & ENV — đã xong:**
- [x] ✅ v31 `chatbot_learning_log` · v32 `ai_response` · ENV `LARK_CREATOR_USER_ID`

**Hiếu cần làm (còn lại):**
- [x] ✅ Set `PORTAL_CRED_KEY` trên Vercel (2026-08-10)
- [x] ✅ Nhập Cost T8 B2C (2026-08-10)
- [x] ✅ Nhập target T7/T8 cho scheduled reports (2026-08-10)
- [x] ✅ Đăng ký Kling AI API key (`KLING_API_KEY`) — đã có key (2026-08-10)
- [ ] Liên hệ DB owner gohub_dw cho Looker Studio / Power BI
- [x] ✅ Setup **cron-job.org** cho Scheduled Messages (2026-08-10): every 15 min, Header `Authorization: Bearer <CRON_SECRET>`

**AI làm tiếp (backlog):**
- ✅ Gấu Pro: Stability AI image gen (code xong, cần Hiếu set `STABILITY_API_KEY` Vercel + tạo bucket `creator-images` public trong Supabase Storage)
- ✅ Semantic KB search: code xong, **Hiếu cần chạy `web/db/migrations/v33_creator_kb_embedding.sql` trong Supabase SQL Editor**
- ✅ C2. Product Win Rate Dashboard (tab "Win Rate" trong analytics/products — xong)
- ✅ C3. B2B Bulk Cost Import (Template + Import Excel trong Quarter Report — xong)
- ✅ **Tổ Gấu** group chat — 4 phase XONG (Phase 1 602a553 · 2 663d874 · 3 d9ef52c · 4 staging)
  - **Hiếu cần chạy `web/db/migrations/v34_to_gau.sql`** trong Supabase SQL Editor (5 bảng: chat_groups, chat_group_members, chat_messages, chat_docs, chat_notes)

**Ghi chú:**
- Báo cáo Daily/Weekly/Monthly dùng Scheduled Messages có sẵn (KHÔNG tạo cron riêng). s139: fix timing (Vercel */5), daily=1 ngày, target luôn hiển thị.
- Nếu target vẫn hiện "Chưa nhập target tháng này" → Hiếu cần nhập target ở tab Targets cho tháng đó.
- Bé Gấu: Lark slow (skip — giới hạn kiến trúc), schema auto-refresh (thấp priority)

---

## Đọc theo thứ tự khi bắt đầu session mới

1. **CLAUDE.md** (file này) — trạng thái + rules
2. **`new_info.txt`** — tick ✅ items chưa xong
3. **`docs/ERRORS.md`** — lỗi hay gặp, đọc để tránh lặp lại
4. **`docs/SYSTEM.md`** — khi cần biết file nào làm gì, DB schema, tab nào route nào
5. **`Bug.txt`** — khi user báo có bug
6. **`docs/CHANGELOG.md`** — khi cần context lịch sử s130+

---

## Rules bắt buộc

1. **Staging-first** — mọi thay đổi lên `staging`. KHÔNG push thẳng `main`.
2. **KHÔNG tự merge** staging → main dù staging PASS, chờ Hiếu yêu cầu rõ ràng.
3. **UI Strict Lock** — không đổi màu/bố cục/font/chart analytics mà không có chỉ thị từ Hiếu/Bảo.
4. **Wiki sync** — sửa tab nào → cập nhật `docs/wiki/Tab/<tên-tab>.md` ngay cùng lần.
5. **Commit + push sau mỗi task** — không batch nhiều task thành 1 commit lớn.
6. **tsc trước khi push** — `npx.cmd tsc --noEmit` (PowerShell, không phải `npx tsc`).

---

## Coding rules

- Minimum code giải quyết đúng vấn đề — không thêm abstraction/feature ngoài yêu cầu.
- Chỉ touch những gì cần — không refactor code không liên quan.
- Không comment giải thích "what" — chỉ comment "why" khi thật sự không rõ.
- Tự test/fix/push, chỉ hỏi khi thao tác web hoặc chưa rõ ý tưởng.
- Mọi lỗi UI hiện: "Hiếu đang fix, vui lòng đợi".

---

## Ghi tài liệu

| Nội dung | File đích |
|---|---|
| Lỗi gặp + cách fix + lesson learned | `docs/ERRORS.md` |
| Lịch sử session / thay đổi lớn | `docs/CHANGELOG.md` |
| Bug tracker (danh sách thô) | `Bug.txt` |
| Session log chi tiết | `docs/session_summary.txt` (append) |
| Kiến trúc hệ thống | `docs/SYSTEM.md` |
| Wiki từng tab | `docs/wiki/Tab/<tên-tab>.md` |
| Audit số analytics | `docs/AUDIT_ANALYTICS.md` (local, gitignored) |
| Agent/prompt changes | `.ai/agents/AGENTS.md` |

---

## Stack nhanh

- **Next.js 14** App Router · **Vercel** · **Supabase** (products/KB/config) · **gohub_dw** GCP Postgres (analytics, read-only) · **Turso** (b2b costs, config)
- Analytics DB: Hiếu không có quyền DDL trên gohub_dw
- Vercel env: `TURSO_URL`, `TURSO_AUTH_TOKEN`, `SUPABASE_SERVICE_KEY`, `CRON_SECRET`, `ANALYTICS_DB_*` (phải tick scope Preview)
- Chatbot chính: **Bé Gấu** (`be-gau.ts`, single function-calling agent, s131+) — pipeline 6-agent cũ = legacy
- Creator AI: **Gấu Pro** (`creator-ai.ts`, 16+ tools, Wave 1: trend + image gen)
- FE design: xem `.ai/FESkill.md`
- Coding rules chi tiết: `.ai/CLAUDE.md`
