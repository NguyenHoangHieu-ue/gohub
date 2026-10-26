# Plan: Trợ lý hợp nhất (Gấu Pro + Phòng Argon) + Kho tri thức Lark + sổ sự việc v2

File TẠM. Xoá khi xong hoặc Hiếu bỏ plan, chuyển kiến thức còn giá trị sang wiki `creator-argon-room.md` / `analytics-creator-ai.md`.
Soạn 2026-10-23 (s240) sau khi đọc code Gấu Pro + Argon + Bé Gấu và research ngoài. **Hiếu đã đọc đề xuất, sẽ làm phần còn lại sau** — chưa chốt 4 câu hỏi ở mục 5.

## 1. Mục tiêu (Hiếu)
Anh lưu tài liệu/thread/mail trên Lark (Drive, Wiki, Base); bot vào đọc, biết thông tin nằm ở đâu (graph/chỉ mục), tự cập nhật và tổng hợp thành file Lark dễ đọc; mail được phân loại + biết việc nào xong/chưa; DM Lark có tiêu đề rõ; agent tự học/nâng cấp nhưng KHÔNG nhầm sự kiện cũ với sự kiện mới thay thế; giao diện người dùng đơn giản, phần setup được phép phức tạp.

## 2. Hiện trạng (đã đọc)
- Gấu Pro: 43 công cụ (duyệt web, Bridge, localFiles, Lark, Google, trí nhớ, việc theo lịch, giọng nói, phiếu sửa code), chỉ Creator. Bé Gấu: chat team. Argon: Kho + sổ sự việc có hạn (`argon_facts`) + bối cảnh/kế hoạch + sql/run_code + bản đồ + cuộc gọi.
- Trùng lặp: Bé Gấu + Gấu Pro dùng chung `runAgentLoop`, Argon có `run-engine` riêng; 2 hệ trí nhớ (`assistant_memory` vs `argon_facts`); 3 nơi tri thức (`kb_wiki_pages`, `creator_kb`, Kho Argon); ~21 chỗ gửi DM Lark ~12 kiểu tin, đầu tin mỗi nơi một kiểu.

## 3. Kiến trúc đề xuất
- **Nguồn** (Lark Drive/Wiki/Thread/Mail = nơi anh lưu) → **Tri thức** (Turso: chunk + vector đã có, thêm bảng thực thể + quan hệ "graph-lite" + vị trí file; sổ sự việc v2) → **Agent** (MỘT vòng lặp, MỘT trí nhớ, MỘT Kho; Gấu Pro/Argon/Bé Gấu thành các chế độ hỏi nhanh / thao tác / sứ mệnh dài, quyền Creator khoá riêng công cụ nhạy cảm).
- Graph: KHÔNG dùng GraphRAG đầy đủ/Neo4j. RAG đủ cho câu một bước; graph chỉ đáng cho tầng thực thể (vendor, thị trường, nhóm SKU, khách, người) + "nằm ở đâu" (arXiv 2502.11371: graph giúp câu nhiều bước/tổng hợp nhưng dựng nhiễu, tốn công).
- Hướng đồng bộ MỘT CHIỀU: Turso là gốc, Lark Base/Wiki là bản để người đọc; anh sửa ở cột "Duyệt". Hai chiều sẽ xung đột.
- Chống nhầm sự kiện cũ/mới (mẫu Graphiti/Zep): mỗi sự việc có 2 trục thời gian (hiệu lực ngoài đời `valid_from/valid_to` + lúc hệ thống biết `recorded_at/expired_at`), dạng chủ thể–thuộc tính–giá trị (vd "3HK · Thái Lan · giá/GB = 3.5"), con trỏ `superseded_by`, KHÔNG xoá bản cũ; tin mới mâu thuẫn tin cũ → tạo bản ghi thay thế kèm câu nguyên văn; mục "Thay đổi hôm nay" cho anh xác nhận khi độ tin thấp/giá trị lớn; mọi câu trả lời ghi ngày của nguồn. Hiện `argon_facts` mới có khoá phụ vendor+loại+cùng ngày (yếu).
- Agent tự học: kỹ năng/playbook ở trạng thái ỨNG VIÊN → chấm trên bộ eval có sẵn → anh duyệt mới thành chính thức, có phiên bản + khôi phục (ACE ICLR 2026; Voyager; nghiên cứu NeurIPS 2026: trí nhớ kiểu Reflexion ít cải thiện thật, kỹ năng chạy được tốt hơn; SoK: kiểm soát chất lượng thư viện kỹ năng là khó khăn trung tâm). Tự sửa code vẫn qua phiếu + PR vào `staging`.
- Mail: chỉ ĐỌC + ĐỀ XUẤT (propose-only), mọi việc gửi qua duyệt (chống prompt injection). Trạng thái theo thread: Mới / Chờ mình / Chờ đối tác / Xong (không có mẫu chuẩn "waiting on" → tự dựng bảng trạng thái theo thread_id).
- Giao diện 4 màn: Hôm nay · Hỏi/Tìm (một ô) · Kho · Việc cần duyệt; phần phức tạp ở "Nâng cao".

## 4. Lộ trình
| Giai đoạn | Việc | Ước lượng | Trạng thái |
|---|---|---|---|
| P0a | Dọn Supabase: bỏ `lark_cs_tickets`, `b2b_customers_cache`; log cũ sang Turso | 1–2 ngày | **XONG (s240, đã merge, v80 đã chạy)** |
| P0b | `notify({loại, tiêu đề, nội dung, link, ưu tiên})` chuẩn hoá DM, đầu tin `[Loại · Nguồn] Tiêu đề — ngày`, gom tin, giờ yên lặng (thay ~21 chỗ `sendLarkDM`) | 0,5–1 ngày | **XONG (s241, staging)** |
| P1 | Sổ sự việc v2 (hai trục thời gian, chủ thể–thuộc tính, thay thế, "Thay đổi hôm nay"); sổ trạng thái mail theo thread | 1 tuần | chưa làm |
| P2 | Graph-lite cho Kho; ghi ra Lark Base + Wiki theo vendor (một chiều); tự tổng hợp thread | 1–2 tuần | chưa làm |
| P3 | Gộp Gấu Pro + Argon thành "Trợ lý", 4 màn giao diện | 2 tuần | chưa làm |
| P4 | Kỹ năng ứng viên + eval + duyệt; siết thao tác máy | 1–2 tuần | chưa làm |
Còn trong danh sách dọn Supabase (cần Hiếu quyết riêng vì thuộc catalog): `listings` ~62MB, `ncc_worldmove` ~17MB, `skus` ~16MB, `sku_catalog` ~10MB, `argon_source_versions` ~9MB (giữ 3 bản gần nhất).

## 5. Câu hỏi Hiếu cần chốt
1. Gói Lark đang dùng? Hạn mức API (nguồn bên thứ ba ghi gói miễn phí 10.000 lần/tháng — CHƯA xác minh; giới hạn bản ghi/bảng của Lark Base cũng chưa xác minh)?
2. Đồng ý hướng một chiều (Turso là gốc, Lark để xem + duyệt)?
3. Mail: chế độ chỉ đọc + đề xuất, mọi việc gửi qua duyệt?
4. Thứ tự: em đề xuất P0b rồi P1.

## 6. Rủi ro / chưa kiểm chứng
- Tên quyền (scope) mail của Lark chưa xác minh; `lark-cli` (github.com/larksuite/cli, 200+ lệnh, mail/wiki/base/minutes) chạy dưới danh tính người dùng nên lỗi hoặc tiêm chỉ dẫn có thể lộ dữ liệu → giữ nguyên tắc đọc tự do, ghi/gửi qua duyệt.
- Số liệu so sánh Mem0/Zep/Letta là của chính các hãng, đang bị tranh cãi → tự đo trên dữ liệu thật bằng bộ eval trí nhớ có sẵn (`web/eval/memory-cases.json`).
- Chi phí: lượt đêm Argon ~$0,45 (+$0,13 khi cần sửa); thêm tóm tắt mail/thread sẽ tăng → đo trước khi bật.
- Dữ liệu cá nhân của ~47 người (Nghị định 13/2023): thông báo + đồng ý + thời hạn lưu trước khi mở rộng trí nhớ.

## 7. Nguồn
Graphiti README (github.com/getzep/graphiti) · Zep "beyond static knowledge graphs" · arXiv 2502.11371 (RAG vs GraphRAG) · lark-cli (github.com/larksuite/cli) · arXiv 2510.04618 (ACE) · arXiv 2602.20867 (SoK Agentic Skills) · neurips.cc/virtual/2026/165628 · Turso pricing · Vexa email triage · Gartner 2025-08-26 (40% app doanh nghiệp có agent theo tác vụ cuối 2026; nhiều agent phối hợp 2027; giao diện agent 2028; nửa nhân viên tri thức tự lập agent 2029).
