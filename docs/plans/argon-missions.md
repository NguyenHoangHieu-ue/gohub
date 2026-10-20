# Plan: Phòng Argon remake — Sứ mệnh + workspace (A1–A4)

File TẠM. Xong hết hoặc Hiếu bỏ plan thì xoá file + dòng trong CLAUDE.md, chuyển kiến thức sang wiki `creator-argon-room.md`.

## Mục tiêu
Argon thành Agent Assistant theo **Sứ mệnh** (khác Gấu Pro làm theo lệnh, Bé Gấu tra nhanh): có mục tiêu dài hạn, workspace thư mục/file, tự chạy code/SQL, hỏi cho rõ rồi mới chạy khi Hiếu bấm **Chốt**.
Mockup đã duyệt: claude.ai/artifact/NBDYq1W1afsLgRLFzuiabq (3 cột: Sứ mệnh+workspace | chat chỉ kết quả | Bàn làm việc live).

## Đã chốt (Hiếu, 2026-10-20)
- Dự án cũ giữ làm **kho nguồn**; thư mục `sources/` của workspace chỉ hiện nguồn ĐÃ GẮN vào sứ mệnh.
- Thay hẳn trang cũ bằng trang mới; chức năng quản lý nguồn (upload, Lark, mail, thread, gói số liệu, tự chạy đêm, Kho báo cáo) thành màn "Kho nguồn" trong trang mới, không bỏ chức năng nào.
- KHÔNG đặt ngân sách $ cho Argon (token Gemini). Chi tiêu chỉ hiện để xem. Giữ trần kỹ thuật việc nền có sẵn (40 đoạn, $10) chống chạy vô hạn. Sandbox: đồng hồ quota CPU Hobby (5 giờ/tháng) ở Bàn làm việc — làm ở A2.
- Hàng rào: ghi DB production + gửi tin người khác luôn hỏi; không đụng secret; chỉ PR vào `staging`; nhật ký đầy đủ; nút Dừng.
- Argon tự làm hết sau khi Chốt; trước Chốt chỉ đọc (trừ ghi `brief.md`).
- KHÔNG dùng dataset Nemotron-Personas-Vietnam.
- `run_code`: Vercel Sandbox (Hobby), cần snapshot có sẵn pandas/openpyxl/matplotlib (đo A0: pip ~12s mỗi lần). Cần VERCEL_TOKEN mới cho SDK từ local.

## Ý cốt lõi: tái dùng
Mỗi sứ mệnh có MỘT dự án nền (`argon_projects`, cột mới `kind`) → dùng nguyên nguồn, lượt chạy SSE, việc nền, worker, Kho báo cáo, đồng bộ Lark/mail. Lớp mới đặt lên trên.

## A1 — khung (migration v74)
Bảng: `argon_missions` (project_id UNIQUE, name, goal, phase clarify|plan|run|done|paused, committed_at, archived), `argon_workspace_files` (mission_id, path UNIQUE, content ≤1MB hoặc storage_path, author user|argon, version), `argon_mission_sources` (gắn nguồn). Thêm `argon_projects.kind` ('project'|'mission'). RLS chỉ service_role. Hạn mức 300 file/sứ mệnh. Thư mục ảo suy từ path.
API `/api/creator/argon/missions` (+ `[id]`, `phase`, `files`, `sources`); chạy lượt dùng lại `/projects/[nền]/runs` thêm `missionId`.
Server `lib/argon/missions.ts` (thuần: đường dẫn, cây, chuyển pha), `missions-db.ts`, `context.ts` (khối sổ tay sứ mệnh + chỉ dẫn theo pha), `tools.ts` (docFile/ghiFile/lietKeFile, chỉ trong sứ mệnh đang mở, pha làm rõ chỉ ghi brief.md).
UI thay trang `/analytics/creator/argon`: shell 3 cột, danh sách sứ mệnh, cây workspace, xem/sửa file, chat + thanh pha + nút Chốt, Bàn làm việc (bước công cụ từ SSE), màn Kho nguồn (tái dùng sources-panel, source-viewer, reports-modal, autorun).
Thứ tự commit: (1) migration + missions.ts + test · (2) API · (3) context + tools workspace · (4) shell + list + tree + file viewer · (5) chat sứ mệnh + pha + Chốt + bàn làm việc · (6) Kho nguồn + QA sống + wiki + CLAUDE.md.

## A2 — sql + run_code + Bàn làm việc đầy đủ + nguồn gốc con số
`sql` chỉ đọc gohub_dw/Supabase (trần dòng, timeout; gohub_dw chạy tuần tự → việc nặng để ban đêm). `run_code` Vercel Sandbox + snapshot. Mỗi số trong câu trả lời bấm ra câu SQL/code tạo ra nó. Đồng hồ quota Sandbox.

## A3 — Làm rõ → Chốt → Chạy hoàn chỉnh
Phỏng vấn làm rõ, kế hoạch có ước tính, Chốt, tự chạy, dừng hỏi khi mơ hồ, DM Lark khi xong.

## A4 — vòng lặp & tự lớn
Vòng lặp đêm (kiểm toán chéo các tab, dò lỗi dữ liệu), thư viện script, `propose_patch` (PR vào staging), tự chấm độ chính xác đề xuất.

## Rủi ro
Ngữ cảnh to thêm (chỉ nạp brief/decisions nguyên văn, còn lại qua công cụ). Hai bảng nền cạnh nhau (CASCADE + UNIQUE, API xoá cả hai). Thay trang cũ phải giữ đủ chức năng Kho nguồn — QA đối chiếu từng chức năng.

## Việc Hiếu
Chạy `v74_argon_missions.sql` trong Supabase (em không có DDL) rồi Reload schema; tạo VERCEL_TOKEN mới cho A2.
