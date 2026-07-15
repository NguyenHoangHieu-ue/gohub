---
title: "Knowledge Base (Cơ Sở Tri Thức & Wiki)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, kb, wiki]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# Knowledge Base (Cơ Sở Tri Thức & Wiki)

Quy trình tải lên tài liệu tri thức, xử lý cắt nhỏ (chunking), tạo vector embedding, tìm kiếm ngữ nghĩa và quản lý trang Wiki nội bộ.

> **Mục đích & vai trò**: bộ não tri thức nội bộ — lưu tài liệu/quy trình/thuật ngữ để (1) nhân viên tra cứu, (2) chatbot agent "Giải Đáp" lấy ngữ cảnh trả lời. **Tại sao dùng embedding + pgvector**: tìm theo Ý NGHĨA (semantic) chứ không chỉ khớp từ khoá → hỏi cách nào cũng ra đúng tài liệu. **Tại sao trang ẩn dùng role DB tươi (s81)**: tránh lỗ hổng JWT cũ làm rò trang ẩn cho người vừa bị hạ quyền.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện người dùng**: `/kb` (`web/src/app/(dashboard)/kb/page.tsx`)
- **API Documents**: `/api/kb/documents` (`web/src/app/api/kb/documents/route.ts`)
- **API Wiki**: `/api/kb/wiki` (`web/src/app/api/kb/wiki/route.ts`)
- **API Tìm kiếm**: `/api/kb/search` (`web/src/app/api/kb/search/route.ts`)
- **API Xử lý (MRP ingestion)**: `/api/kb/process` (+`/[id]`) — cắt chunk + embed, theo dõi job.
- **Sync wiki → Supabase (embed)**:
  - `backend/seeding/import/import_wiki.py` — quét `docs/wiki/**/*.md`, upsert theo title (mới→insert; đổi→lưu version cũ + update + re-embed; không đổi→skip).
  - **Bản Node thay thế** (khi python build lỗi trên Windows): `web/scripts/sync_wiki.mjs` — cùng logic, chạy `cd web && node scripts/sync_wiki.mjs`. ⚠️ Xử lý line-ending CRLF khi parse frontmatter (nếu không sẽ tạo bản trùng title = tên file).

---

## 2. Kiến Trúc Kỹ Thuật & Schema Cơ Sở Dữ Liệu
Hệ thống lưu trữ dữ liệu tri thức trên Supabase thông qua tiện ích mở rộng `pgvector` phục vụ tìm kiếm ngữ nghĩa:

- **Bảng `kb_documents`**: Lưu trữ thông tin metadata của file được upload (PDF, DOCX, TXT).
- **Bảng `kb_chunks`**: Lưu từng phân đoạn văn bản đã được cắt nhỏ kèm vector embedding:
  - `id`: UUID khóa chính.
  - `document_id`: Khóa ngoại liên kết bảng `kb_documents`.
  - `content`: Nội dung phân đoạn (text).
  - `embedding`: Vector 3072 chiều sinh bởi `gemini-embedding-001`.
- **Bảng `kb_wiki_pages`**: Wiki Markdown (title, content, `page_type`, `department`, `is_hidden`, `tags`, `version`, `embedding`). Upsert theo **title**.
- **Bảng `kb_wiki_versions`**: lịch sử phiên bản wiki (mỗi lần update lưu bản cũ trước khi ghi đè).
- **Bảng `kb_processing_jobs`**: trạng thái job ingestion (upload → chunk → embed).

**Tất cả bảng KB**: `kb_documents`, `kb_chunks`, `kb_wiki_pages`, `kb_wiki_versions`, `kb_processing_jobs`.

---

## 3. Quy Trình Vận Hành & Xử Lý Dữ Liệu

### A. Quy trình nạp tài liệu (Ingestion Pipeline)
1. **Tải lên**: Người dùng tải lên tệp tin định dạng `.pdf`, `.docx` hoặc `.txt`.
2. **Trích xuất nội dung (Parsing)**:
   - Định dạng PDF: Dùng thư viện `pdf-parse` để giải mã văn bản.
   - Định dạng Word: Dùng thư viện `mammoth` chuyển đổi cấu trúc tài liệu sang văn bản.
3. **Cắt đoạn (Chunking)**:
   - Sử dụng thuật toán cắt văn bản theo giới hạn độ dài `800` ký tự, độ gối đầu (overlap) `100` ký tự.
   - Các đoạn văn ngắn hơn `60` ký tự sẽ bị lọc bỏ để tránh nhiễu dữ liệu.
4. **Hóa Vector (Embedding)**:
   - Từng phân đoạn được gửi đến Google Gemini Embedding API sử dụng model `gemini-embedding-001`.
   - Lưu trữ đoạn văn và vector kết quả vào bảng `kb_chunks`.

### B. Tìm kiếm Ngữ nghĩa (Semantic Search)
- Khi người dùng tìm kiếm tại giao diện hoặc chatbot hỏi về chính sách, truy vấn được vector hóa bằng cùng mô hình.
- Thực thi truy vấn khoảng cách cosine trong PostgreSQL bằng hàm `match_documents`:
  ```sql
  SELECT content, 1 - (embedding <=> query_embedding) AS similarity
  FROM kb_chunks
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC LIMIT match_count;
  ```

### C. Quản lý Wiki nội bộ
- Wiki được biên soạn trực tiếp bằng Markdown, phân quyền theo phòng ban (`department`).
- Admin/Creator có thể chuyển đổi nhanh trạng thái ẩn/hiện (`is_hidden`) hoặc đổi quyền phòng ban trực tiếp trên dòng danh sách.
- **Trang ẩn (`is_hidden`)**: chỉ Admin/Creator mới thấy trong danh sách, thấy nút Ẩn/Hiện, và mở được bằng id trực tiếp. Quyền được kiểm bằng **role lấy tươi từ DB** (`getDbRole` ở server, `/api/user/me` ở client) — không dùng role trong JWT (JWT có thể CŨ nếu admin vừa đổi role mà user chưa đăng nhập lại → role cũ "admin" sẽ rò trang ẩn).

---

## 4. Phân Quyền Truy Cập
- **Standard**: Chỉ đọc các tài liệu và trang Wiki thuộc phòng ban của mình (hoặc các trang công cộng `department = 'all'`).
- **Manager**: Upload tài liệu, tạo/sửa/xóa Wiki. KHÔNG bật/tắt trạng thái ẩn (chỉ Admin/Creator).
- **Admin / Creator**: Toàn quyền upload tài liệu, tạo/sửa/xóa Wiki, **bật/tắt trạng thái ẩn** + xem trang ẩn.\n