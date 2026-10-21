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

## Việc 3 — Workflow bot (đã đo baseline, chưa đổi code)
Baseline Bé Gấu (eval 40 câu trên staging 2026-10-21, `web/eval/results/s238-base.*`):
- Chất lượng 9,93/10 (bản 2026-10-08: 8,72) → hết chỗ cải thiện đo được; đòn bẩy còn lại là TỐC ĐỘ.
- Thời gian TB 41s (trung vị 36s, p90 79s, tối đa 121s); token vào TB 191k/câu, ra 2,6k. TB 6,2 lượt model/câu.
- 87% thời gian là lượt model, chỉ 13% là chạy tool (mỗi tool ~1s). Câu chậm nhất đều là câu HIGH thinking nhiều lượt (3: 121s, 40: 109s, 14: 96s).
- Đã có sẵn: HIGH thinking chỉ lượt đầu, tool song song mỗi lượt, gộp truy vấn trong prompt (`business-facts.ts`), nén lịch sử, cache ngữ cảnh. Vẫn còn 75 lượt "1 executeSQL rồi lại 1 executeSQL" nối tiếp và 51 lượt querySupabase đơn lẻ (câu 19: 10 lượt liên tiếp, nhiều lượt trả kết quả rất nhỏ = thử sai cột).
- updatePlan đứng riêng chỉ chiếm 3% thời gian (không đáng sửa).
Kết quả thí nghiệm (cùng 40 câu, staging; mỗi lần chạy lệch nhau ~±0,1 điểm và ~±3s nên chỉ tin khi lặp lại):
| Bản | Điểm | Thời gian TB | Lượt model | Token vào |
|---|---|---|---|---|
| baseline | 9,93 | 41,0s | 6,15 | 191k |
| E1 (khối cột thật bảng catalog) lần 1 | 9,70 | 37,3s | 6,17 | 176k |
| E1 lần 2 | 9,80 | 37,6s | 6,50 | 184k |
| E1 + E2 (kpiSummary) | 9,68 | 37,5s | 6,17 | 164k |
- E1 GIỮ: nhanh hơn ~8% ở cả hai lần chạy, câu 19 (sản phẩm có số điện thoại) từ 11 xuống 5 lượt; điểm thấp hơn baseline 0,1–0,2 nhưng các câu tụt điểm là câu không liên quan catalog (20, 21, 27, 30), nghi dao động giám khảo.
- E2 BỎ (đã revert `73d6bea9`): model chỉ gọi kpiSummary 2/40 câu, không nhanh hơn, và câu 27 lệch Q2 26,03 vs 25,7 tỷ (tool mặc định tính phí ship + đơn nội bộ như tab BOD, còn đáp án chuẩn và SQL của bot thì không) → hai nguồn số khác định nghĩa, dễ làm bot tự mâu thuẫn. Muốn làm lại thì phải thống nhất định nghĩa "doanh thu" mặc định trước.
- Chưa làm E3 (model nhẹ cho lượt gọi tool): rủi ro chất lượng, cần eval riêng.

## Việc 2 — Tối giản Admin/Creator (chưa bắt đầu)
Lượt xem 60 ngày: `/admin` 77 lượt/3 người; `creator/ai` 783/13; `my-metrics` 66/2; `creator/devtools` 39/1; `creator/argon` 28/1; `scheduled` 27/2; `users` 18/2; `market` 15/1; `creator` 13/1; `bridge` 11/6; `settings` 10/2; `creator/usage`, `data-health`, `bc-datapool` ~1. Đề xuất: gom Admin thành Thêm dữ liệu / Soát / Quyền; Creator Settings gom quyền Gấu Pro thành 1 ma trận; gộp nav trùng `sidebar.tsx` + `lib/nav.ts`.

## Việc 4 — Argon tối giản (chưa bắt đầu)
Đã duyệt: bỏ 4 pha và Bàn làm việc, giữ Kho nguồn, 1 ô chat + cột "đề xuất hôm nay", giao diện hiện đại hơn. Luật viết: câu ngắn, mỗi đề xuất có số kèm nguồn, ghi rõ "chưa chắc" khi thiếu dữ liệu; giữ sổ dự đoán tự chấm.
