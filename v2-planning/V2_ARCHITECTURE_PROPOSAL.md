# V2_ARCHITECTURE_PROPOSAL.md — Đề xuất Kiến trúc & Giải pháp Công nghệ (V2 Tech Stack Spec)

> **Báo cáo Thẩm định & Thiết kế Hệ thống**: Được lập bởi Hội đồng Chuyên gia Cao cấp (Staff System Architect, Lead AI & Data Engineer, Head of Security & DevOps). Báo cáo phân tích sâu sắc các lựa chọn công nghệ, đánh giá ưu nhược điểm, và đưa ra giải pháp mở rộng, bảo mật và khắc phục giới hạn hệ thống v2.

---

## PHẦN I: KHẢO SÁT & CHỌN LỰA FRAMEWORK CHO AI AGENT & SECOND BRAIN

### 1. Phân tích Các Lựa Chọn Framework Tác Nhân (Agent Frameworks)

Để tái thiết kế hệ thống **7 Agents ("Bé Gấu Thông Thái")** và trợ lý riêng **"Gấu Pro"**, chúng tôi đặt lên bàn cân 3 hướng đi công nghệ:

#### Phương án A: Sử dụng LangChain / LangGraph (Sử dụng Thư viện bên thứ ba)
*   *Ưu điểm*: Hỗ trợ cực mạnh cho việc thiết kế luồng đồ thị phức tạp (Stateful Multi-Agent), có sẵn hàng nghìn connectors tích hợp.
*   *Nhược điểm*: Quá nặng (Overhead lớn), tài liệu cập nhật liên tục dễ bị break bản cũ, tốn nhiều bộ nhớ đệm, thời gian cold start rất chậm trên môi trường serverless (Vercel).
*   *Đánh giá*: **KHÔNG PHÙ HỢP**. GoHub cần tốc độ phản hồi cực nhanh dưới 3 giây trên Lark và Web, LangChain sẽ kéo dài thời gian khởi tạo hàm không đáng có.

#### Phương án B: Sử dụng Vercel AI SDK (Bộ công cụ của Next.js)
*   *Ưu điểm*: Tích hợp sâu với React/Next.js Server Actions, hỗ trợ stream UI và render components phía client mượt mà, tối ưu hóa tối đa cho Vercel.
*   *Nhược điểm*: Bị ràng buộc chặt chẽ với hệ sinh thái Vercel, khó bọc logic chạy ngầm độc lập cho webhook Lark.
*   *Đánh giá*: **KHÁ PHÙ HỢP** cho lớp giao diện Web Chatbot, nhưng chưa tối ưu cho các tiến trình nền chạy webhook hoặc các cron job đồng bộ.

#### Phương án C: Mô hình State Machine Thuần (Gemini Native API + Clean Architecture)
*   *Ưu điểm*: 
    *   Tốc độ khởi tạo (cold start) gần như bằng 0.
    *   Toàn quyền kiểm soát luồng hoạt động (Zero-magic code).
    *   Dễ dàng vá lỗi và tối ưu hóa prompt thô.
    *   Không sợ bị ảnh hưởng bởi sự thay đổi phiên bản (breaking changes) của bên thứ ba.
*   *Nhược điểm*: Phải tự tay viết các hàm bọc (Wrappers) xử lý function calling và lưu trữ ngữ cảnh hội thoại.
*   *Đánh giá*: **PHƯƠNG ÁN ĐƯỢC CHỌN**. Chúng tôi đề xuất xây dựng hệ thống tác nhân dựa trên việc gọi trực tiếp **Google Gemini SDK (`@google/genai`)** kết hợp với kiến trúc **State Machine** thuần bằng TypeScript để đảm bảo tính ổn định tối đa và tốc độ phản hồi chớp nhoáng.

---

### 2. Kiến trúc Second Brain Hợp nhất (Knowledge Base Integration)

Second Brain của GoHub hoạt động dựa trên tri thức Obsidian đồng bộ hóa trực tiếp từ `docs/wiki/` lên cơ sở dữ liệu vector.

```
 [Tài liệu Wiki .md] ─► [Hệ thống Parser & Chunker] ─► [Gemini Embedding] ─► [Supabase pgvector]
                                                                                   ▲
                                                                                   │ (Vector Search)
                                                                           [Bé Gấu / Gấu Pro]
```

*   **Lớp Lưu trữ (Vector DB)**: Sử dụng **Supabase PostgreSQL** tích hợp extension **`pgvector`** (bảng `kb_wiki_pages` và `kb_chunks`). Sắp xếp trường vector sử dụng khoảng cách Cosine (`<=>`) hoặc khoảng cách Inner Product (`<#>`).
*   **Hàm tạo Vector (Embedding)**: Sử dụng mô hình `text-embedding-004` của Google thông qua API Native giúp đồng nhất hóa công nghệ AI, giảm thiểu việc kết nối đa nhà cung cấp.

---

## PHẦN II: GIẢI PHÁP KHẮC PHỤC GIỚI HẠN & BẢO MẬT (OPERATIONAL SCALABILITY)

### 1. Giải pháp chống nghẽn và Limit Rate (Rate Limiting & Transient Errors)

Để bảo vệ hệ thống khỏi việc bị khóa API (Quota exceeded) và xử lý mượt mà các lỗi từ phía Google Cloud:

*   **Cơ chế Thử lại Tự động với Giãn cách Lũy tiến (Exponential Backoff Retry)**:
    Mọi lời gọi tới Gemini API bắt buộc phải bọc trong helper `genWithRetry`:
    ```typescript
    export async function genWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 800): Promise<T> {
      try {
        return await fn();
      } catch (error: any) {
        // Chỉ thử lại với các lỗi tạm thời (Transient Errors: 429, 503, 500, timeout)
        const isTransient = [429, 500, 503, 504].includes(error.status) || error.message?.includes("overloaded");
        if (retries > 0 && isTransient) {
          await new Promise(res => setTimeout(res, delay));
          return genWithRetry(fn, retries - 1, delay * 2); // Giãn cách gấp đôi sau mỗi lần thử
        }
        throw error; // Ném ra lỗi thật lập tức nếu là lỗi sai cú pháp/mô hình
      }
    }
    ```
*   **Hạn chế hao hụt Token (Token Optimization)**:
    *   *System Prompt Cohort*: Đưa các schema BI cồng kềnh ra khỏi Prompt hệ thống tổng, chỉ nhúng động sơ đồ cấu hình bảng SQL khi Agent `bi-analyst` được kích hoạt.
    *   *In-memory Session Memory*: Giới hạn lịch sử trò chuyện tối đa 10 tin nhắn gần nhất để tránh phình to Context Window.

### 2. Giải pháp Bảo mật & Phân quyền Đa tầng (Robust RBAC & Data Masking)

Để đảm bảo an toàn dữ liệu doanh thu nhạy cảm và giá vốn:

*   **Bảo vệ tầng API (Route Guards)**:
    Sử dụng lớp bọc `analyticsGuard` kiểm tra JWT Token tươi trực tiếp từ Database ở mỗi lượt request API, tuyệt đối không tin tưởng hoàn toàn vào cookie Client-side.
*   **Mặt nạ Dữ liệu Nhạy cảm (PII & Cost Masking)**:
    *   *Ẩn danh tính khách hàng*: Agent `bi-analyst` và `data-explorer` khi sinh mã SQL bắt buộc phải áp dụng điều kiện loại bỏ thông tin cá nhân. Chỉ hiển thị cột `customer_code`, tuyệt đối tự động lược bỏ hoặc thay thế trường `customer_name`, `phone`, `email` thành ký tự mã hóa (`***`).
    *   *Lọc giá vốn COGS*: Nếu vai trò người dùng là `staff`, lớp dữ liệu trung gian tại `src/core/formulas/` sẽ tự động lọc bỏ (strip) toàn bộ thông tin cột `cogs_amount_vnd` và `gross_profit_vnd` ra khỏi JSON trả về, trả về giá trị `null` hoặc ẩn hoàn toàn cột đó trên bảng hiển thị.
