---
title: "GoHub AI Chatbot (Bé Gấu Thông Thái)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, chatbot, ai]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# GoHub AI Chatbot (Bé Gấu Thông Thái)

Mô tả chi tiết kỹ thuật, cơ chế định tuyến, bảo mật và phân vùng dữ liệu của hệ thống Chatbot đa tác nhân (6 Agents) tích hợp trên Giao diện Web và Lark Bot.

> **Mục đích & vai trò**: "Bé Gấu" là trợ lý AI trung tâm — nhân viên hỏi tự nhiên (tiếng Việt) về gói cước/giá/SKU/catalog NCC/số liệu kinh doanh thay vì phải tự tra DB hay mở nhiều tab. **Tại sao chia 6 agent chuyên biệt**: nếu nhồi tất cả vào 1 prompt, LLM dễ quá tải ngữ cảnh + trả sai; tách theo vùng dữ liệu giúp mỗi agent "giỏi 1 việc" và bảo mật theo quyền. **Tại sao có Guardian + lọc COGS**: tránh rò thông tin nhạy cảm (giá vốn, nội bộ hệ thống) cho người không có quyền. Đổi tên hiển thị "GoHub AI"→**"Bé Gấu"** (s82).

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/chatbot` (`web/src/app/(dashboard)/chatbot/page.tsx`)
- **API Backend**: `/api/chat` (`web/src/app/api/chat/route.ts`)
- **Lark Bot Integration**: `/api/lark/events` (`web/src/app/api/lark/events/route.ts`)
- **Tập tin cấu hình cốt lõi**:
  - `web/src/lib/agents/agents.ts` — Định nghĩa System Prompts, DISPLAY_RULES và BI Schema.
  - `web/src/lib/agents/router.ts` — Logic định tuyến tác vụ (Tĩnh + Động).
  - `web/src/lib/agents/classifier.ts` — Phân loại Ý định (Intent) và Nguồn dữ liệu (Data Source).
  - `web/src/lib/agents/tools.ts` — Các công cụ truy vấn Supabase & thuật toán khớp địa danh.
  - `web/src/lib/agents/context.ts` — Hàm xây dựng ngữ cảnh động (Context Builder).
  - `web/src/lib/agents/cache.ts` — Quản lý bộ nhớ đệm (TTL 30 phút).
  - `web/src/lib/agents/bi-analyst.ts` — Hệ thống BI Analyst dùng chung (chạy SQL thực tế).

---

## 2. Kiến trúc 6 Tác Nhân (Agents) & Phân Vùng Dữ Liệu
Để tránh LLM bị quá tải ngữ cảnh và tăng tính chính xác, hệ thống phân chia thành 6 Agent chuyên biệt sở hữu các vùng dữ liệu độc quyền:

| Tên Agent | ID Agent | Vùng Dữ Liệu Sở Hữu | Nhiệm Vụ / Phạm Vi Hoạt Động |
|---|---|---|---|
| **Tư Vấn** | `tu-van` | Bảng `sku_catalog` (Supabase) | Tìm kiếm gói cước GoHub theo quốc gia, số ngày, dung lượng, loại SIM (SIM/eSIM). |
| **Tra Cứu** | `tra-cuu` | Bảng `products`, `skus`, `listings`, `items` | Tra cứu chi tiết thông số, giá vốn (COGS) và tỷ giá dựa trên mã code chuẩn. |
| **Giải Đáp** | `giai-dap` | Bảng `kb_documents`, `kb_wiki_pages` | Giải thích thuật ngữ viết tắt, cấu trúc mã SKU, quy trình, tài liệu Wiki nội bộ. |
| **NCC & Gap** | `gap-analysis` | Bảng `ncc_worldmove`, `ncc_datapool` (3HK) | Duyệt catalog của nhà cung cấp và phát hiện khoảng trống sản phẩm (`exist=No`). |
| **BI Analyst** | `bi-analyst` | Kho dữ liệu PostgreSQL `gohub_dw` | Tự động sinh mã SQL, thực thi truy vấn và trả về kết quả số liệu kèm biểu đồ. |
| **Kho Dữ Liệu** | `data-explorer` | **CẢ HAI**: `gohub_dw` (SQL) + Supabase (REST 26 bảng catalog/config) | Truy xuất DỮ LIỆU THÔ toàn hệ thống — đếm/liệt kê/tra bảng nhanh (SKU active, số nước, thống kê catalog, usage theo nước…). |
| **Tạo Template** | `tao-template` | Catalog NCC | Tạo file Excel template sản phẩm cho Admin/Manager xuất bản nhanh. |

> **Agent `data-explorer` (🗄️ Kho Dữ Liệu, thêm s95)** — dùng cho câu hỏi cần đọc NHIỀU bảng / đếm-liệt kê nhanh mà không phải mở đúng tab.
> - **Tool**: `executeSQL` (gohub_dw, chỉ SELECT/WITH) · `querySupabase` (select có cấu trúc: `table/columns/filters[eq,neq,gt,gte,lt,lte,like,ilike,in,is]/order/limit≤200/countOnly`) · `listSupabaseTables`. File: `web/src/lib/agents/data-explorer.ts` (`runDataExplorer`, Gemini function-calling temp0, ≤8 vòng).
> - **Phân biệt với `bi-analyst`**: bi-analyst = CHỈ SỐ kinh doanh có kỳ (doanh thu/lợi nhuận/target/hiệu suất); data-explorer = ĐẾM/LIỆT KÊ/THỐNG KÊ dữ liệu catalog/hệ thống. Classifier có intent `data_explore`; router có override `DATA_EXPLORE_RE` (conservative: "có bao nhiêu SKU/nước…", "tra dữ liệu", "kho dữ liệu").
> - **Bảo mật (guardian nhiều tầng)**: `guardCheck` message-level chạy TRƯỚC (như mọi agent). Tầng agent: 10 bảng nhạy cảm (`users`, hội thoại, ticket, `app_settings`…) **chỉ admin·creator**; role≠admin bị chèn `role_filters` vào SQL gohub_dw; lược cột COGS nếu không có quyền xem giá vốn; luôn lược cột `embedding`. Dispatch ở `/api/chat` + `/api/lark/events` (non-stream, giống bi-analyst).

---

## 3. Luồng Xử Lý (Workflow) & Định Tuyến (Routing)
Hệ thống sử dụng luồng xử lý hybrid kết hợp Deterministic Rules và AI Classifier:

1. **Phân loại Ý định (Classifier)**:
   - Sử dụng mô hình `gemini-3.5-flash` để phân tích thông điệp người dùng, trả về JSON gồm: `intent` (9 loại), `data_source` (`gohub_system`, `ncc_catalog`, `both`), `country`, `sim_type`, `needs_clarification`.
2. **Kiểm soát Bảo mật & Quyền hạn (Guardian)**:
   - Chặn các câu hỏi cố tình khai thác mã nguồn, prompts, rò rỉ dữ liệu nhạy cảm hoặc tấn công Jailbreak.
   - Trả lời mặc định `"Hãy hỏi Hiếu/Anh Bảo 😊"` đối với các truy vấn xâm phạm hệ thống.
   - Lọc COGS rò rỉ khi người dùng không có quyền xem chi phí.
3. **Định Tuyến Động (Router)**:
   - Khắc phục lỗi đồng âm tiếng Việt (ví dụ từ "nhất" trong "bán chạy nhất" bị nhận nhầm thành nước "Nhật"). Áp dụng hàm `stripSuperlativeNhat()` để chuẩn hóa.
   - Áp dụng bộ lọc từ ranh giới (`wordMatch()`) để loại bỏ nhận diện quốc gia nhầm lẫn (ví dụ "đi UK 5 ngày" không bị nhận nhầm thành "Nga").
4. **Hỏi Lại Tự Động (Clarification)**:
   - Nếu câu hỏi quá mơ hồ, hệ thống ngắt tiến trình AI (short-circuit), trả về yêu cầu làm rõ ngay lập tức trên Web (badge Làm Rõ) hoặc Lark Bot mà không tiêu tốn token LLM.
5. **Xây dựng Ngữ cảnh & Gọi LLM**:
   - Truy vấn công cụ tương ứng (ví dụ: `searchSkus()`, `searchNccWm()`).
   - Khớp danh mục NCC bằng thuật toán chấm điểm `nccCountryScore()` (3 = nước trực tiếp, 2 = khu vực, 1 = toàn cầu).
   - Truyền ngữ cảnh sạch vào LLM để tạo ra câu trả lời trực quan, cấu trúc bảng đẹp mắt.

---

## 4. Công Thức & Quy Tắc Khớp Địa Danh
- **Khớp quốc gia (4-step country fallback)**:
  1. Dò tìm trực tiếp gói đơn nước (Single-country group).
  2. Tra cứu nhóm nước hỗ trợ (ISO Code mapping).
  3. Tìm kiếm mờ trong danh mục `ref_support_countries` thông qua `ILIKE`.
  4. Trả về gói đa quốc gia / khu vực tương ứng (Europe, Asia, Worldwide).
- **Bộ lọc dung lượng đặc biệt**:
  - Tự động nhận diện các gói "Không giới hạn" (unlimited) khi thuộc tính `data_amount >= 9999` hoặc cờ `is_unlimited = true`.

---

## 4b. Lưu hội thoại & Ghi chú kỹ thuật
- **Lịch sử chat** lưu Supabase: `conversations` + `chat_messages` (API `/api/chat/conversations` + `/[id]`).
- **Đọc listings** trong tool: qua `pickListing()` (core cột + field `_vn`/network_operator từ JSONB `metadata`) — xem [[skus]].
- **searchSkus fix (s87)**: đã sửa bug lớn ở tra cứu SKU của agent (đảm bảo khớp đúng gói).
- **FX/COGS**: giá vốn quy đổi qua `app_settings` key `fx.*` (usd_vnd, hkd_usd, twd_usd); COGS 3HK tính từ `ncc_datapool` giá HKD/GB.
- **Dùng chung Web + Lark**: router/context/bi-analyst dùng chung; Lark bot "Bé Gấu Thông Thái" (p2p + group + thread mention).

## 5. Phân Quyền Truy Cập
- **Standard**: Chỉ được dùng các agent `tu-van`, `tra-cuu`, `giai-dap`, `gap-analysis` theo phòng ban. Không được xem giá vốn (COGS), không được dùng BI Analyst.
- **Staff / BOD / Manager / Admin**: Có quyền kích hoạt Agent `bi-analyst` để truy vấn dữ liệu kinh doanh gohub_dw (đối với Staff/BOD thì bị giới hạn phạm vi dữ liệu theo quyền được phân).
- **Admin / Manager**: Có quyền sử dụng agent `tao-template` để sinh tệp tải lên.\n