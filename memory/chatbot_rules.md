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

### 2. Tìm Kiếm Theo Nước

**Rule**: Context decode ISO code → tên nước (ví dụ: "RU(Russia)"). Khi user hỏi "đi Nga" → chatbot tìm "Russia" trong nước; hoặc "đi Mỹ" → tìm "United States"

**Why**: 
- ISO 3166-1 alpha-3 (RUS, USA) quá phức tạp, model hay nhầm
- Tên nước tiếng Anh là natural language → match dễ hơn
- Người dùng hỏi tiếng Việt (Nga, Mỹ) → cần mapping rõ

**How to apply**:
- `decodeCountries(codes)` function map code→name dùng ref_countries lookup (DONE in buildContext)
- SKU context rows: `nước: RU(Russia), BY(Belarus)` (DONE)
- System prompt: mapping tên VN→EN (Mỹ=United States, Nhật=Japan, Hàn=South Korea, Nga=Russia...) (DONE)
- Test: "tôi cần tìm sản phẩm đi Nga" → tìm thấy products có "Russia"

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
