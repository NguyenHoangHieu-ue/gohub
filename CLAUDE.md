# CLAUDE.md — GoHub Intel · START HERE

> File này auto-load mỗi session. Đọc hết trước khi làm bất cứ thứ gì.

---

## Trạng thái hiện tại (2026-08-09)

| | |
|---|---|
| Branch làm việc | `staging` |
| main | `22e71b4` (s138 Gấu Pro Wave 1 đã merge) |
| Staging mới nhất | `3ed8372` (OOP Priority 1 refactor) |
| tsc | PASS |

**Hiếu cần làm (chưa xong):**
- [ ] Chạy `web/db/migrations/v31_chatbot_learning_log.sql` trên Supabase SQL Editor
- [ ] Set ENV `LARK_CREATOR_USER_ID` = `ou_e5af3c7f447984052c1c5a5c2f594127` trên Vercel
- [ ] Nhập Cost T8 B2C ≠ 0 trong Manage Costs (hiện tất cả = 0)
- [ ] Nhập target T7/T8 cho scheduled reports
- [ ] Đăng ký Kling AI API key (`KLING_API_KEY`) cho video generation Gấu Pro
- [ ] Liên hệ DB owner gohub_dw cho Looker Studio / Power BI connector

**AI làm tiếp (backlog):**
- Fix bug Staff: FE không pass `includeShip`/`includeInternalOps` vào `/api/analytics/staff-report/customers`
- Update `docs/wiki/Tab/analytics-staff.md` (nội dung lỗi thời từ trước s124)
- OOP Priority 2: `channels/performance`, `b2b/strategic-performance`, `b2c/monthly`, `b2c/performance`
- Gấu Pro Wave 2: cải thiện prompt ảnh Pollinations (đã thêm enhance=true), video Kling AI

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
