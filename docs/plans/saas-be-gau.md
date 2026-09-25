# PLAN — Bé Gấu SaaS (đa khách hàng)

> ⚠️ **FILE TẠM — TỰ XOÁ KHI XONG.** Khi mọi mốc M0–M6 bên dưới đã hoàn tất (hoặc Hiếu chốt bỏ plan),
> Claude PHẢI: (1) chuyển kiến thức còn giá trị sang `docs/wiki/system/` (kiến trúc SaaS thực tế) +
> `docs/session_summary.txt`, (2) `git rm docs/plans/saas-be-gau.md`, (3) xoá dòng trỏ tới file này trong
> `CLAUDE.md`. Không để plan cũ tồn tại sau khi việc đã xong.
>
> Tạo: 2026-09-25. Trạng thái: **chưa bắt đầu code** (mới chốt hướng). Cập nhật tick ở mục "Tiến độ".

---

## Mục tiêu

Bé Gấu vừa phục vụ GoHub (tenant #1) vừa bán được cho công ty khác, **bất kỳ ngành nào có DB**. Một hệ
thống dùng chung, mỗi khách chỉ thấy dữ liệu của họ. Khách có thể dùng key AI của Hiếu hoặc tự gắn key riêng.

## Quyết định đã chốt (Hiếu, 2026-09-25)

1. Khách mục tiêu: bất kỳ công ty nào có DB, không giới hạn ngành.
2. Dữ liệu: linh hoạt nhiều nguồn (xem "Kiến trúc").
3. Key AI: mặc định dùng key của Hiếu; khách muốn thì tự gắn key riêng (BYO).
4. Triển khai: 1 hệ thống dùng chung, cô lập theo tenant.
5. Thời gian: làm tranh thủ, chia mốc nhỏ merge được độc lập. Chi phí công cụ nâng cấp (Vercel Pro,
   Supabase Pro…) Hiếu xem xét sau, tuỳ mức độ.
6. Giữ Gemini (không dùng Claude API), đi qua `lib/ai-models.ts`.

## Kết quả khảo sát hiện trạng (2026-09-25)

- Web hiện tại là analytics riêng của GoHub: 120 file gọi `supabaseAdmin.from(...)` (276 chỗ), 57 file dùng
  `cachedQuery`, 66 file chạm `gohub_dw`, 51 migration, 55 biến env. **Không migration nào có `tenant_id`.**
- Hardcode GoHub trong agent: `BE_GAU_PROMPT` (`web/src/lib/agents/be-gau.ts`, bối cảnh sim/eSIM, 3HKDATAPOOL,
  B2B tier, ngưỡng doanh thu), `SUPABASE_TABLES` (`data-explorer.ts`), `creator_kb`, `app_settings`, `users`,
  một `GEMINI_KEY` chung, Lark app duy nhất, role cứng `admin/creator/manager/bod/staff`.
- Vercel Hobby chỉ cho phi thương mại → phải lên Pro trước khi có khách trả tiền (kiểm lại điều khoản Vercel).

## Hướng kiến trúc

**KHÔNG tenant hoá cả app GoHub** (sửa hàng trăm chỗ, rủi ro rò dữ liệu cao, khách ngành khác không cần các
tab đó). Thay vào đó dựng **lõi Bé Gấu SaaS** = module/Vercel project riêng trong cùng repo, chỉ gồm agent,
connector dữ liệu, semantic layer, kênh chat, admin. GoHub là tenant #1 của lõi, chỉ cho phần chatbot. Các
dashboard analytics GoHub giữ nguyên.

**Ngoài phạm vi SaaS:** Gấu Pro (`localFiles`, Bridge, `browseWeb`, `googleWorkspace`, `assistantMemory`) —
công cụ cá nhân của Hiếu, không đưa ra cho khách (rủi ro bảo mật/pháp lý).

**Dữ liệu — 1 tool SQL duy nhất `runSQL(datasource)`, cắm nhiều nguồn:**
- A. Kết nối DB sống read-only: Postgres trước, sau đó MySQL/BigQuery/Snowflake qua cùng interface connector.
- B. Upload CSV/Excel → nạp vào schema riêng của tenant trong Postgres do mình quản (cho khách chưa có DB).
- C. API/Google Sheets (sau này) → đồng bộ về B.
- Semantic layer: tự đọc schema → LLM soạn mô tả bảng/cột + gợi ý chỉ số → khách chỉnh. Chỉ số như
  CM1/GP thành "định nghĩa chỉ số" lưu theo tenant, thay chữ viết cứng trong prompt.

**Key AI:** ưu tiên key của tenant nếu có, không thì key nền tảng. Key khách lưu mã hoá; mỗi lượt gọi ghi rõ
dùng key nào để tính phí đúng.

**Cô lập tenant:**
- Mọi truy cập dữ liệu đi qua MỘT hàm truy cập duy nhất, `tenant_id` bắt buộc; RLS là lớp chặn thứ hai.
- DB khách dùng user chỉ SELECT, giới hạn dòng, timeout; SQL guard (chỉ SELECT/WITH, thêm LIMIT, chặn cross-schema).
- Cache key có tenant (`cachedQuery` hiện không có tenant → không dùng lại nguyên xi).
- Test tự động chứng minh tenant A không đọc được tenant B.
- Chống prompt injection qua nội dung dữ liệu của khách.

## Lộ trình (mỗi mốc merge được độc lập; GoHub luôn chạy bình thường)

Thời gian là ước tính thô, chưa có căn cứ đo.

- **M0 — Tách lõi (~1–2 tuần).** Lấy vòng lặp agent từ `be-gau.ts` thành package độc lập không nhắc GoHub;
  prompt thành template có biến; GoHub gọi lõi này, hành vi không đổi.
- **M1 — Tenancy và cô lập.** Bảng `tenants`, `members`; hàm truy cập dữ liệu có tenant; RLS; test cô lập.
  Project mới, auth riêng (chưa dùng chung bảng `users` GoHub).
- **M2 — Nguồn dữ liệu.** Connector Postgres + SQL guard + credential mã hoá; sau đó upload CSV/Excel.
- **M3 — Semantic layer + onboarding.** Tự đọc schema, LLM soạn mô tả, khách chỉnh. Chuyển bối cảnh GoHub
  sang cấu hình tenant #1 làm bài kiểm tra đầu tiên.
- **M4 — Kênh chat.** Web chat trước; Lark theo tenant (bot credentials từng khách); Slack/Teams sau.
- **M5 — Đo lường, quota, key BYO.** Đo token theo tenant (mở rộng `app_usage_events`), quota theo gói, gắn key khách.
- **M6 — Hardening + thanh toán.** Bộ eval theo tenant, audit log, xoá/xuất dữ liệu theo tenant, thanh toán
  (chỉ làm khi đã có khách thật).

**Mốc MVP:** GoHub (tenant #1) + 1 tenant thử nghiệm kết nối Postgres riêng, hỏi được số liệu của chính họ,
có test chứng minh hai bên không thấy dữ liệu của nhau. Xong M0–M3 là đạt.

## Nguyên tắc

- Tìm 1–2 design partner (ưu tiên ngành gần GoHub: sim/eSIM/telecom) trước khi làm self-serve/billing.
- Staging-first; không merge `main` khi Hiếu chưa yêu cầu; tsc + build + lint + vitest PASS trước khi push.
- Sau mỗi mốc: cập nhật wiki + `session_summary.txt` + tick bên dưới.
- Luôn check N+1 và xác minh field DB bằng SQL thật (rule chung của repo).

## Việc còn mở cần Hiếu

- [ ] Xác nhận: module mới trong cùng repo, Vercel project riêng (Claude đề xuất cách này).
- [ ] Quyết định khi nào lên Vercel Pro / Supabase Pro (trước khi có khách trả tiền).
- [ ] Tên gọi/định vị sản phẩm SaaS (Claude chưa đề xuất).

## Tiến độ

- [ ] M0 Tách lõi
- [ ] M1 Tenancy và cô lập
- [ ] M2 Nguồn dữ liệu
- [ ] M3 Semantic layer + onboarding
- [ ] M4 Kênh chat
- [ ] M5 Đo lường, quota, key BYO
- [ ] M6 Hardening + thanh toán
- [ ] **Xong hết → xoá file này (xem cảnh báo đầu file)**
