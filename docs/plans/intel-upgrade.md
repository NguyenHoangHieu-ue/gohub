# Plan: Nâng cấp GoHub Intel (2026-10-21)

File TẠM. Xoá khi xong cả 5 việc, chuyển kiến thức còn giá trị sang wiki `docs/wiki/system/`.
Thứ tự Hiếu đã duyệt: 5 → 1 → 3 → 2 → 4. Làm trên `staging`, chỉ merge `main` khi Hiếu nói rõ.

## Việc 5 — Tốc độ và phiên đăng nhập
Xong (staging `e3cef557`, `me-client`):
- Phiên trượt: không hoạt động 4h thì hết (`maxAge` 4h, `updateAge` 10 phút), tab đang dùng tự gia hạn mỗi 5 phút, hết phiên về `/login` rồi quay lại đúng trang. Role/department đọc lại từ DB mỗi 5 phút. Chưa kiểm sống 4h.
- Sidebar, top-bar, command-palette dùng chung 1 lần gọi `/api/user/me` (`lib/me-client.ts`).

Đo trên staging (Quarter Report, Q3/Q4 2026, ALL):
- Cache nóng: `quarterly-report` 78ms, `quarterly-b2b-customers` 83ms.
- Cache nguội: 3–6s mỗi endpoint; mở tab nguội ~25s vì nhiều request chen nhau vào gohub_dw.
- `squad-progress` nóng vẫn 2,6s: phần sau cache gọi tuần tự Supabase/Turso (target, chi phí, group cost, lifecycle) + payload 190–430KB.
- Mỗi lần tải trang gọi `/api/user/me` 3 lần và `heartbeat` 2 lần (đã gộp `me`).

Còn làm:
- [ ] `squad-progress`: gom/cache phần sau cache (config + target + chi phí), giảm payload.
- [ ] Đo thêm các tab hay dùng nhất (xem bảng lượt xem bên dưới), tìm endpoint nguội > 5s.
- [ ] Bảng tổng hợp sẵn theo ngày/tháng: hỏi bên giữ gohub_dw (Hiếu không có DDL), hoặc đặt ở Supabase qua ETL.
- [ ] Rate-limit Upstash, thu hồi `VERCEL_TOKEN` cũ.

## Việc 1 — UI/UX lowtech
- Skill `ui-ux-pro-max` đã đọc mã nguồn (chỉ dữ liệu + search.py, không mạng/subprocess), chép vào `.claude/skills/ui-ux-pro-max` (gitignored, local).
- Mockup tab BOD + menu mới: Artifact `claude.ai/artifact/BSiJAZA6jwAFn3cNKqRJuL`. **Chờ Hiếu duyệt trước khi làm thật.**
- Đã có sẵn `components/dashboard-kit.tsx` (StatTile, Panel, DataTable...) từ s190, nên redesign = nâng cấp kit + token, không viết mới.
- Đo lượt xem 60 ngày (`app_usage_events`, page_view): Quarter Report 753 lượt/19 người, Channels 285, B2C 281, B2B 271, Staff 181, Orders 105; BOD chỉ 36 lượt/10 người. **Đề xuất làm thật ở Quarter Report + Channels trước, không phải BOD.**
- Thứ tự: token + kit → 2 tab thử → duyệt → lan ra theo nhóm (tiền, khách, sản phẩm, creator).

## Việc 3 — Workflow bot (chưa bắt đầu)
Baseline có sẵn: `web/scripts/eval-memory.mjs`, bộ eval Bé Gấu (9,88/10), bảng `gp_runs`. Đo trước rồi mới sửa: phân loại câu hỏi bằng model nhỏ, prompt cache, tool song song, truy xuất lai + xếp hạng lại, số liệu luôn từ SQL, hỏi lại đúng 1 câu khi thiếu ý.

## Việc 2 — Tối giản Admin/Creator (chưa bắt đầu)
Lượt xem 60 ngày: `/admin` 77 lượt/3 người; `creator/ai` 783/13; `my-metrics` 66/2; `creator/devtools` 39/1; `creator/argon` 28/1; `scheduled` 27/2; `users` 18/2; `market` 15/1; `creator` 13/1; `bridge` 11/6; `settings` 10/2; `creator/usage`, `data-health`, `bc-datapool` ~1. Đề xuất: gom Admin thành Thêm dữ liệu / Soát / Quyền; Creator Settings gom quyền Gấu Pro thành 1 ma trận; gộp nav trùng `sidebar.tsx` + `lib/nav.ts`.

## Việc 4 — Argon tối giản (chưa bắt đầu)
Đã duyệt: bỏ 4 pha và Bàn làm việc, giữ Kho nguồn, 1 ô chat + cột "đề xuất hôm nay", giao diện hiện đại hơn. Luật viết: câu ngắn, mỗi đề xuất có số kèm nguồn, ghi rõ "chưa chắc" khi thiếu dữ liệu; giữ sổ dự đoán tự chấm.
