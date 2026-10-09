# Plan: Agent cá nhân cho từng người (Personal Agent) — trí nhớ v2

> File TẠM. Xong hết mốc (hoặc Hiếu bỏ plan) thì xoá file + xoá dòng trong CLAUDE.md, chuyển kiến thức còn giá trị sang wiki
> `docs/wiki/system/tabs/analytics-creator-ai.md`.
> Lập 2026-10-09 (s229), Hiếu duyệt hướng thu gọn. CHƯA bắt đầu code.

## 1. Mục tiêu
Mỗi người một agent riêng, trí nhớ lớn lên theo thời gian, nhớ đúng cái đang còn hiệu lực. Hiếu test trước, sau đó mở cho mọi người trong công ty muốn dùng.
Ý tưởng lấy từ khoá luận `D:\Khoa_Luan` (PKG-Mem: hybrid retrieval, temporal supersedence, retention) nhưng CHỈ dùng lại thiết kế, prompt, bộ eval —
KHÔNG ghép codebase (khoá luận: Python + Neo4j; sản phẩm: TypeScript + Supabase).

## 2. Hiện trạng đo thật (2026-10-09, chỉ đếm)
- `assistant_memory` 31 mục (cả hệ thống); `gp_conversation_memory` 6 dòng / 537 hội thoại (tầng Recall gần như chưa chạy).
- `conversation_messages` 578 dòng (đầy đủ chỉ từ v68); `app_usage_events` 8.134 dòng giữ phần lớn lịch sử thật; `gp_runs` 196.
- Quy mô mỗi người vài chục → vài trăm mục: graph 2 bước chưa có lợi. Khoá luận cũng ghi graph thuần (F1 0,417) kém vector thuần (0,468).

## 3. Kiến trúc chốt
- **3 tầng kiểu MemGPT/Letta**: Core (luôn trong prompt, ≤1.500 token: hồ sơ, vai trò, dự án đang làm, sở thích) · Recall (tóm tắt hội thoại) · Archival (bảng fact + vector).
- **Postgres (Supabase), KHÔNG Neo4j** (Vercel serverless không có chỗ host). Dùng pgvector (đã có, `gemini-embedding-001` 768 chiều).
- **Bảng fact có 2 mốc thời gian**: `valid_from`/`valid_to` (đúng ngoài đời) + `recorded_at` (lúc ghi nhận), kèm nguồn (tin nhắn nào), độ tin cậy,
  `superseded_by`. Đây là phiên bản tối giản của graph; multi-hop làm kiểu agentic (agent gọi `recallMemory` nhiều lần), không viết truy vấn đệ quy.
- **Tìm kiếm lai**: Postgres full-text (`unaccent`) + vector + RRF. Mã SKU, tên riêng, tiếng Việt không dấu khớp kém nếu chỉ embedding.
- **Tool `recallMemory(query, as_of?)`**; job gộp ban đêm (gộp trùng, đóng mục hết hiệu lực, viết lại khối core).
- **`agent_profiles(username)`**: persona, mục tiêu, kênh (web, Lark DM), tool được dùng (lấy từ bảng tính năng theo vai trò đã có), namespace trí nhớ.
  Agent kế thừa ĐÚNG quyền của người dùng, không rộng hơn. RLS theo `username`; Creator/admin mặc định KHÔNG đọc trí nhớ người khác.
- **Quyền người dùng**: xem, sửa, xoá, xuất, tắt trí nhớ; ghi rõ "nhớ vì sao" (nguồn tin nhắn).
- Giữ nguyên: rút trí nhớ CHỈ từ tin nhắn người dùng (chống đầu độc), cổng duyệt, trace `gp_runs`, `@google/genai`.
- Phương án đo cùng: **trí nhớ dạng markdown** (kiểu memory tool của Claude) — mỗi người 1 tài liệu core tự sửa được; P0 so 2 phương án, chọn cái thắng.

## 4. Bỏ / hoãn (có chủ đích)
Neo4j · truy vấn graph 2 bước + centrality · giao diện đồ thị · MCP · LLM local (Vercel không gọi được máy Hiếu) · agent tự học skill
(skill lưu lâu dài là điểm cài prompt injection). Graph/UI/MCP chỉ vào lại nếu eval chứng minh cần.

## 5. Lộ trình (ước lượng thô)
| Bước | Việc | Cỡ |
|---|---|---|
| P0 | Bộ 30–50 câu hỏi trí nhớ trên dữ liệu của Hiếu (Hiếu duyệt đáp án) + chấm hệ thống hiện tại + so với markdown; đo chi phí thật/lượt (`est_cost_usd`) | 1–2 ngày |
| P1 | Migration v72 (bảng fact), supersedence, tìm kiếm lai, `recallMemory`, job gộp ban đêm | 2–4 ngày |
| P2 | Sửa lỗ hổng nền (Recall chưa chạy, Lark DM chưa tóm tắt, "nhiễm" chỉ tính 1 lượt, cron-job.org trỏ staging) + quyền người dùng | 2–3 ngày |
| P3 | `agent_profiles`, mở cho vài người test rồi cả công ty (cờ `gp_personal_features` theo người, hiện chỉ "all hoặc creator") | 2–3 ngày |
| Sau | Graph, UI đồ thị, MCP — chỉ khi P1 đo ra câu nhiều bước hỏng | — |

**Cổng:** P1 chỉ làm tiếp nếu P0 cho thấy khoảng cải thiện; mỗi bước so A/B với cái cũ trên bộ eval P0.

## 6. Rủi ro cần xử lý
- **Race**: rút trí nhớ chạy trong `waitUntil` có thể đè lên lượt kế tiếp → ghi idempotent, đóng mục cũ trong 1 transaction.
- **Dữ liệu cá nhân của ~47 người** (Nghị định 13/2023): cần thông báo, đồng ý, thời hạn lưu; hỏi pháp chế trước khi mở cho cả công ty.
- **Eval bằng LLM có thiên lệch**: Hiếu tự duyệt đáp án.
- **Chi phí**: thêm 1 lệnh gọi rút trí nhớ mỗi lượt; đo ở P0.
- **Khoá luận**: bảng ở mục 7.5 đề cương là giả thuyết, không phải kết quả; dữ liệu sản phẩm đưa vào khoá luận phải ẩn danh.

## 7. Câu hỏi còn mở
- Tên sản phẩm cho người dùng: lớp agent cá nhân dùng chung lõi với Bé Gấu (Gấu Pro vẫn là bản siêu tập của Hiếu) — chốt khi tới P3.
- Thời hạn lưu trí nhớ và nội dung thông báo cho nhân viên.
