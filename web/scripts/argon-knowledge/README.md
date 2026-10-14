# Sổ tay tri thức công ty cho Phòng Argon

Dựng lại file `GoHub-So-Tay-Tri-Thuc-Cong-Ty-cho-Argon.docx` từ Supabase (`creator_kb` + `kb_wiki_pages`).

1. `node pull.mjs <thư-mục-tạm>` — kéo 2 bảng ra JSON (cần `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` trong `web/.env.local`).
2. `python build_docx.py <thư-mục-tạm> <file-docx-ra>` — dựng docx (python-docx). Danh sách mục theo phần ở biến `PARTS`; mục "Giả định HIỆN HÀNH" là chuỗi `LIVE_MD` — sửa tay khi giả định/tỷ giá đổi.
3. Mở bằng Word, cập nhật mục lục (F9), tải lại vào dự án "Tri thức công ty GoHub" ở Phòng Argon.

Bảo mật: `sanitize()` bỏ dòng tài khoản/mật khẩu và email dùng chung. KB Gấu Pro vẫn còn 2 mục lưu mật khẩu portal vendor dạng chữ rõ ("Danh sách Tài khoản Portal Vendor", "Danh sách Account vendor") — không đưa vào docx; nên chuyển sang nơi quản lý mật khẩu.
