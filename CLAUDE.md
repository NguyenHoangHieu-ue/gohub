# CLAUDE.md — GoHub HeThong

Auto-loaded by Claude Code. Full details in `.ai/CLAUDE.md`, `.ai/RULES.md`, `.ai/FESkill.md`, `.ai/agents/AGENTS.md`.

---

## Quy tắc vận hành bắt buộc

1. **Staging-first**: Mọi thay đổi lên `staging` trước. KHÔNG push thẳng `main`. Chỉ merge khi Hiếu yêu cầu rõ ràng.
2. **UI Strict Lock**: Không tự ý đổi màu/bố cục/font/chart các tab Analytics — phải có chỉ thị từ Hiếu/anh Bảo.
3. **Wiki sync bắt buộc**: Sửa bất kỳ tab nào → cập nhật `docs/wiki/Tab/<tên-tab>.md` ngay trong cùng lần làm.
4. **Commit + push sau mỗi task** xong (không batch nhiều task thành 1 commit lớn).
5. **KHÔNG tự merge staging → main** dù staging đã PASS.

## Coding

- Simplicity first: minimum code giải quyết đúng vấn đề, không thêm abstraction/feature ngoài yêu cầu.
- Surgical: chỉ touch những gì cần, không refactor code không liên quan.
- Đọc `new_info.txt` ở đầu mỗi session — tick ✅ items đã làm xong.
- `npx.cmd tsc --noEmit` (không phải `npx tsc`) do PowerShell execution policy trên máy này.

## Ghi tài liệu — thêm vào file có sẵn, KHÔNG tạo file mới

| Nội dung | File đích |
|---|---|
| Session log | `docs/session_summary.txt` (append `## Session N (YYYY-MM-DD)`) |
| Bug mới / fix | `Bug.txt` |
| Phase/milestone | `WORK.md` |
| Agent/prompt changes | `.ai/agents/AGENTS.md` |
| Wiki tab | `docs/wiki/Tab/<tên-tab>.md` |

## Checklist cuối session

1. Append session log vào `docs/session_summary.txt`
2. Tick ✅ bugs đã fix trong `Bug.txt`
3. Update `WORK.md` nếu phase thay đổi trạng thái
4. Commit + push staging

## Stack / môi trường

- Next.js 14 App Router · Vercel · Supabase (products/KB) · gohub_dw GCP Postgres (analytics) · Turso (config)
- Analytics DB read-only — Hiếu không có quyền DDL trên gohub_dw
- Vercel env: TURSO_URL, TURSO_AUTH_TOKEN, SUPABASE_SERVICE_KEY, CRON_SECRET, ANALYTICS_DB_* (phải tick scope Preview)
- Chatbot: 6 agents (tu-van · tra-cuu · giai-dap · gap-analysis · bi-analyst · template) + Guardian + Gấu Pro (CreatorAI)
- FE design: xem `.ai/FESkill.md` khi làm UI mới
