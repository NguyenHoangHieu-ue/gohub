# V2_AI_MERGE_BLUEPRINT.md — Đặc tả Hợp nhất Hệ thống Trợ lý AI (Unified AI Agent Spec)

> **Tài liệu Đặc tả Giao vận & Bảo mật AI (AI Consolidation & Security Guard)**: Biên soạn bởi Trưởng bộ phận Nghiên cứu Trí tuệ Nhân tạo (Lead AI Research Engineer). Tài liệu đặc tả kế hoạch hợp nhất "Gấu Pro" vào "Bé Gấu Thông Thái" thành một thực thể duy nhất, đồng thời thiết lập rào chắn bảo mật và phân quyền truy cập thông tin hệ thống tuyệt đối.

---

## I. THẨM ĐỊNH LÝ DO HỢP NHẤT (THE RATIONALE FOR MERGING)

Trong hệ thống v1, việc duy trì song song 2 Agent Chatbot tạo ra nhiều sự dư thừa và rắc rối:
*   **Sự phân mảnh (Fragmentation)**: Phải duy trì 2 giao diện (`/chatbot` và `/analytics/creator/ai`), 2 API Routes (`/api/chat` và `/api/creator-ai/chat`), lặp lại prompt hệ thống, và nhân đôi nỗ lực bảo trì các connectors DB/Tools.
*   **Giải pháp v2**: Hợp nhất toàn bộ sức mạnh, bộ công cụ (Tools), và tri thức của "Gấu Pro" vào một thực thể duy nhất: **"Bé Gấu Thông Thái"**. Bé Gấu v2 sẽ là siêu trợ lý, tự động mở khóa các "siêu năng lực" nâng cao dựa trên vai trò (Role) của tài khoản đang đăng nhập.

---

## II. SƠ ĐỒ ĐỊNH TUYẾN & PHÂN QUYỀN HỢP NHẤT (UNIFIED ROUTING PIPELINE)

Khi người dùng gửi tin nhắn tới Bé Gấu v2, luồng định tuyến và lọc quyền hạn sẽ hoạt động nghiêm ngặt như sau:

```
                          [Tin nhắn gửi tới Bé Gấu]
                                      │
                                      ▼
                        [Lọc Ý định & Tri thức (Classifier)]
                          - Xác định: is_technical_query?
                                      │
                ┌─────────────────────┴─────────────────────┐
                │ (Có hỏi về Code/Quy trình/System)        │ (Hỏi về nghiệp vụ/số liệu bán)
                ▼                                           ▼
      [Kiểm tra Quyền hạn]                         [Lọc Quyền dữ liệu (Guard)]
  - Role == 'creator' ?                            - Role == 'staff' ?
        │                                           ├── Có: Lược bỏ cột COGS/GP
        ├─────────────────────┐                     └── Không: Giữ nguyên
        ▼ (Có)                ▼ (Không)                     │
  [Toàn quyền truy cập]   [Chặn và Phản hồi]                ▼
  - Mở khóa Gấu Pro-Tools - "Hãy hỏi Hiếu nha 🐻"   [Thực thi Đa tác nhân (Gemini)]
  - Cho phép hỏi Code     (Ngắt tiến trình AI)      - Gọi executeSQL (đối với role phù hợp)
  - Xem bảng nhạy cảm                               - Tìm kiếm web grounding
```

---

## III. CHẾ ĐỘ BẢO VỆ ĐỘC QUYỀN CHO CREATOR (TECHNICAL QUERY GATEKEEPER)

Để bảo vệ tuyệt đối lõi công nghệ, câu lệnh mẫu (Prompts), cấu trúc cơ sở dữ liệu, và quy trình vận hành nội bộ:

### 1. Phân loại Ý định Kỹ thuật (`is_technical_query`)
Khi Classifier AI (`classifier.ts`) phân tích tin nhắn đầu vào, hệ thống tự động gắn thêm cờ trạng thái boolean `is_technical_query = true` nếu câu hỏi có chứa các từ khóa hoặc mang ý đồ khai thác:
*   *Từ khóa kích hoạt*: `code`, `bản thiết kế`, `system prompt`, `cấu trúc bảng`, `database schema`, `quy trình`, `API`, `token`, `webhook`, `lập trình`, `file cấu hình`...

### 2. Logic Chặn Thân thiện (Polite Guard Check)
Tại đầu API `/api/chat`, hệ thống thực thi kiểm tra bảo mật:
```typescript
if (isTechnicalQuery && session.user.role !== "creator") {
  return NextResponse.json({
    text: "Bé Gấu không được phép tiết lộ cấu trúc mã nguồn và quy trình hệ thống cho các tài khoản khác đâu ạ, hãy hỏi anh Hiếu nha! 🐻",
    sources: []
  });
}
```
*Ghi chú: Lớp chặn này nằm hoàn toàn ở phía server-side của API Router, ngăn chặn triệt để mọi hành vi tấn công kỹ thuật xã hội (Social Engineering) hoặc bẻ khóa prompt (Jailbreak) từ phía client.*

---

## IV. BẢN ĐỒ PHÂN QUYỀN BỘ CÔNG CỤ (V2 UNIFIED TOOL PERMISSIONS)

Khi Bé Gấu v2 hoạt động, bộ công cụ (Tools Declarations) truyền vào Gemini API sẽ được lọc động dựa trên vai trò của người dùng:

| Tên công cụ (Tool) | Phạm vi hoạt động | Quyền truy cập tối thiểu | Cơ chế Bảo mật bổ sung (Security Shield) |
| :--- | :--- | :---: | :--- |
| **`searchSkus`** | Tra cứu cước GoHub | **MỌI ROLE** | Ẩn cột `latest_cogs` đối với vai trò `staff`. |
| **`webSearch`** | Tìm kiếm Google Search | **MỌI ROLE** | Cite nguồn URL đầy đủ dưới chân tin nhắn. |
| **`queryGA4` / `queryGSC`** | Truy vết Web SEO | **MANAGER** | Không áp dụng cho các tài khoản bán hàng. |
| **`executeSQL`** | Chạy SQL trên `gohub_dw` | **MANAGER** | • Chỉ thực thi câu lệnh `SELECT` hoặc `WITH`.<br>• Tự động chèn `role_filters` lọc bớt dữ liệu nhạy cảm.<br>• Thay thế thông tin cá nhân khách hàng thành `***`. |
| **`querySupabase`** | Truy xuất cấu trúc bảng | **CREATOR / ADMIN** | Chặn hoàn toàn quyền đọc các bảng nhạy cảm (`users`, `conversations`, `app_settings`) đối với tài khoản không phải `creator`. |
