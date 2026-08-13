# CLAUDE.md — GoHub Intel · START HERE

> File này auto-load mỗi session. Đọc hết trước khi làm bất cứ thứ gì.

---

## Trạng thái hiện tại (2026-08-13, s147)

| | |
|---|---|
| Branch làm việc | `staging` |
| staging ahead main | ~44 commit (s147 — Inventory Management + Staff Target) |
| tsc | PASS |

**Migrations & ENV — đã xong:**
- [x] ✅ v31 `chatbot_learning_log` · v32 `ai_response` · ENV `LARK_CREATOR_USER_ID`
- [x] ✅ v22 `staff_targets` (staff_code + month PK)
- [x] ✅ v23 `inventory_items` + `inventory_snapshots`
- [x] ✅ v24 `vendor_balances`

**Hiếu cần làm (còn lại):**
- [ ] Liên hệ DB owner gohub_dw cho Looker Studio / Power BI
- [ ] **Portal Affiliate**: nhập App ID + Secret Shopee Affiliate Open API (trang Portal → mục "Affiliate Open API") → chạy introspection để xác định query khả dụng

**s147 — đã làm (2026-08-13):**
- ✅ **Ẩn tab Tổ Gấu** với mọi role trừ creator (sidebar collapsed + expanded)
- ✅ **Staff tab — CM1 Target + 3HK Target**: lưu theo (staff_code × tháng), edit mode Sửa/Lưu/Hủy, lưu người sửa
- ✅ **Fulfillment tab rebuild → Inventory Management**: OPS nhập tồn kho, vendor balance, DOI alert, history snapshot, Sold auto từ gohub_dw
- ✅ **Quarter Report — target CM1 KH**: bỏ × 3, target nhập là target QUÝ trực tiếp
- ✅ **Quyền chỉnh sửa**: thêm `quarterly`/`staff`/`fulfillment` vào Users tab + helper `writable-tabs.ts` + enforce 6 API routes

**s145 — đã xong (ghi lại):**
- ✅ **Scheduled Daily report**: mục 【3】 đổi MTD → QTD, lấy target quý Turso `target_planning_quarter`, tách B2B/B2C.
- ✅ **Tổ Gấu**: AI reply ngay, @mention Lark DM, fix nút Test scheduled 403.
- ✅ **Portal Access** tab `/analytics/portal`: Hướng C (console interceptor) CHẠY; Hướng A (SHA256 Open API) đang test.

**Ghi chú:**
- Quarter Report: target CM1 KH nhập là target QUÝ (không nhân × 3). % Target CM1 = PR CM1 / target_quý.
- Daily 【3】 theo QUÝ; nếu hiện "Chưa nhập target quý" → Hiếu nhập ở tab Quarter Report.
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
