---
name: chatbot_rules
description: 5 rules core của chatbot — nguồn data, tìm nước, giá USD/VND, ưu tiên VN, nhất quán role
metadata:
  type: feedback
---

## 5 Rules Core Chatbot

### 1. Nguồn Data Ưu Tiên

**Rule**: Đọc theo thứ tự: (1) products+skus, (2) listings chỉ khi hỏi tên/activation, (3) items chỉ khi hỏi giá kênh

**Why**: products+skus là source chính có đủ tech specs (data, throttle, kyc); listings/items là chi tiết phụ. Nếu chatbot đọc cả 3 cùng lúc thì context quá lớn, model bỏ qua entries quan trọng.

**How to apply**: 
- Mô tả ưu tiên trong system prompt (DONE in route.ts)
- Bỏ listing_code, item_code khỏi context data (DONE)
- Test: hỏi "gói đi Mỹ" → chỉ dùng products.supported_countries + SKU detail, không lôi item price ra

---

### 2. Tìm Kiếm Theo Nước (Database-Driven)

**Rule**: Context **PHẢI** decode từ ref_countries table (custom codes của Gohub, không phải ISO standard).
Khi user hỏi "đi Nga" → lookup ref_countries → tìm tên English → match trong context

**Why**: 
- Gohub dùng country codes riêng (RU, US, JPN, CHM...), không phải ISO 3166
- Nếu hardcode mapping → khi công ty thay đổi codes, chatbot vẫn dùng cũ
- Đọc database → tự động cập nhật, không cần sửa code

**How to apply**:
- `products.supported_countries` lưu 3-ký-tự GROUP codes (RUS, EU1, W04...) từ `ref_support_countries`
  → Đây là cùng code với ký tự 3-5 trong SKU code (vd: SKU "1CRUS..." → country group = RUS)
  → KHÔNG phải ISO 2-ký-tự (RU, US) từ ref_countries
- `decodeCountries(codes)` function: lookup `ref_support_countries.code` → `support_country` (FIXED 2026-06-06)
- SKU context rows: `nước: RUS(Russia), EU1(United Kingdom, Denmark, ...)` 
- System prompt: mapping tên VN→EN dùng để user hỏi tiếng Việt (Nga=Russia...) → tìm trong mô tả group (DONE)
- Chatbot workflow:
  1. User: "tôi cần sản phẩm đi Nga"
  2. Model: map "Nga" → "Russia"
  3. Match trong context: tìm SKU có "Russia" trong MÔ TẢ của trường "nước:"
  4. Trả về SKU có "RUS(Russia)" hoặc "EU1(...Russia...)" hoặc group nào chứa Russia

---

### 3. Giá: Hiển thị USD + VND

**Rule**: Luôn xuất cả 2 giá **không làm tròn**, dùng `latest_cogs` làm gốc + quy đổi tỷ giá

**Why**:
- Admin/user cần xem 2 đơn vị để quyết định
- Làm tròn → mất precision, sai khi tính lợi nhuận
- `latest_cogs` là giá nhập gốc; `final_cogs_*` là giá sau VAT (khác product → product)

**How to apply**:
- Logic: 
  - Nếu latest_cogs_currency=USD → Giá USD=latest_cogs, Giá VND=latest_cogs × 26,394
  - Nếu latest_cogs_currency=VND → Giá VND=latest_cogs, Giá USD=latest_cogs ÷ 26,394
  - Nếu latest_cogs_currency=TWD (WM) → Giá USD=latest_cogs ÷ 31.452, Giá VND=Giá USD × 26,394
- System prompt: ghi rõ "không làm tròn" (DONE)
- Test: xem giá WM product (gốc TWD) → hiện cả USD + VND, số thập phân không mất

---

### 4. Ưu Tiên Tenant VN

**Rule**: Sort context SKU: tenant=VN trước US. Khi đề xuất, nếu có VN phù hợp → dùng VN; chỉ dùng US nếu không có VN phù hợp

**Why**: 
- Gohub JSC (VN) là pháp nhân chính bán ra; Gohub Inc (US) là supplier
- VN sản phẩm đã chuẩn hóa, giá rõ ràng
- US thường là parent → giá USD → cần convert

**How to apply**:
- fullSkus sort: (a, b) => a.tenant==='VN' ? -1 : (b.tenant==='VN' ? 1 : 0) (DONE)
- System prompt: rule ưu tiên VN (DONE)
- Test: hỏi "gói đi Mỹ" → nếu cả VN+US có → liệt kê VN trước, hoặc chỉ suggest VN (tuỳ số lượng)

---

### 5. Nhất Quán Admin/Standard

**Rule**: Cả 2 role nhận **cùng cấu trúc câu trả lời**. COGS chỉ hiển thị khi được hỏi rõ. Standard không nói "không có thông tin giá" vì nó chỉ không thấy COGS, không phải không có giá.

**Why**:
- Standard chỉ không thấy COGS (giá nhập) trong context, nhưng vẫn thấy dữ liệu khác
- Nếu trả lời khác nhau → user bị nhầm, loss of trust
- COGS là internal cost → chỉ hỏi rõ mới cần

**How to apply**:
- System prompt: một lối (DONE)
- Code: canSeeCost=admin||manager để enrich context (không thay đổi structure)
- Test: admin + standard hỏi "gói này giá bao nhiêu" → cùng format trả lời, chỉ khác COGS visible/không

---

## Liên kết

[[business_knowledge]] — 3HK rule, tỷ giá, COGS formula  
[[feedback_autonomous]] — hoàn toàn tự do fix/test/push
