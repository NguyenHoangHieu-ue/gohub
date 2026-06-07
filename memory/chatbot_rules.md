---
name: chatbot_rules
description: Kiến trúc + rules chatbot GoHub — Option 3 always-inject, 1 Gemini call, streaming
metadata:
  type: feedback
---

## Kiến Trúc Hiện Tại (Option 3 — Always Inject)

**File**: `web/src/app/api/chat/route.ts`  
**Model**: `gemini-3.5-flash` — systemInstruction + history + sendMessageStream  
**Cache TTL**: 30 phút (in-memory, reset khi Vercel cold start)

### Flow mỗi request:
1. `getRawData()` — lấy cache hoặc fetch Supabase
2. `detectCountry(lastMessage)` — nếu tìm thấy tên nước → inject NCC catalog
3. `buildSystemPrompt()` — ghép toàn bộ context vào system instruction
4. 1 Gemini call stream → trả về text từng chunk

---

## Context Sections (luôn inject)

| Section | Nội dung | Điều kiện |
|---------|----------|-----------|
| `SAN PHAM GOHUB` | Tất cả SKU active, type C/E/1/2, sort VN trước | Luôn có |
| `NCC CATALOG` | WM (max 15 SP) + 3HK matching nước | Chỉ khi detectCountry() tìm được |
| `NHOM NUOC HO TRO` | ref_support_countries (code, tên, danh sách nước) | Luôn có |
| `MA NUOC` | ref_countries (code → name) | Luôn có |
| `VENDOR` | ref_vendors (vendor_code → name) | Luôn có |
| `TY GIA` | app_settings (tỷ giá từ DB) | Chỉ admin/manager |

---

## Rule 1: Lọc & Sort SKU

**FULL_TYPES** = `{ C, E, 1, 2 }` — chỉ sản phẩm hoàn chỉnh (eSIM Full, SIM Full)

**Sort**: tenant=VN trước → rồi sort theo sku_code alphabetically

**Filter**: chỉ `status=Active` từ bảng skus

**product_type fallback**: nếu join products thất bại → dùng `sku_code[1]`

**Listings/Items**: KHÔNG còn trong context (đã xóa từ session 2)

---

## Rule 2: Tìm Nước — Server-side (chỉ cho NCC)

Server chạy `detectCountry()` để quyết định có inject NCC catalog không.  
**Gemini tự tìm** SKU GoHub trong context đã inject sẵn (không cần server filter).

### detectCountry() — 3 bước:
1. Map tên VN → EN (`VN_TO_EN` hardcode ~40 entries): "nga"→"Russia", "mỹ"→"United States"...
2. Map thành phố → nước (`CITY_TO_COUNTRY` ~50 entries): "tokyo"→"Japan", "dubai"→"UAE"...
3. Fallback: tìm trong `ref_support_countries.support_country` (lowercase match, >3 ký tự)

### Gemini tìm SKU theo nước — workflow (encode trong system prompt):
1. Tra `NHOM NUOC HO TRO` → tìm tất cả mã nhóm có chứa tên nước
   - VD: "Nga"/Russia → RUS, MLB, EU1, SCA, W04, W30...
2. Lọc SKU có ký tự 3-5 của sku_code khớp với mã nhóm
3. Chỉ giữ ký tự 2 = C hoặc E (eSIM/SIM Full)
4. product_code = 8 ký tự đầu → lấy thêm thông tin; ưu tiên tenant=VN

**Why**: `products.supported_countries` dùng 3-ký-tự GROUP codes (RUS, EU1, W04...)  
không phải ISO 2-ký-tự — Gemini phải dùng context `NHOM NUOC HO TRO` để decode đúng.

---

## Rule 3: Giá

**Trong context**: `latest_cogs` + `latest_cogs_currency` (giá gốc, chưa quy đổi)  
**Columns**: `latest_cogs|currency` — chỉ xuất hiện với admin/manager (`isCost=true`)  
**Standard/sale**: không thấy cột giá trong context → không đề cập COGS

**Quy tắc hiển thị**:
- Chỉ xuất `latest_cogs` + đơn vị tiền tệ (VD: `5.68 USD`, `31.45 TWD`)
- Nếu user hỏi quy đổi → dùng `TY GIA` section để tính, không làm tròn
- Các trường khác (`final_cogs_included_vat_vnd`, `final_cogs_usd`) KHÔNG xuất trừ khi có yêu cầu đặc biệt rõ ràng

**Why**: `latest_cogs` là giá gốc nhập — source of truth. Final COGS sau VAT là bước tính toán riêng, chỉ cần khi có context cụ thể.

**Tỷ giá**: lấy từ `app_settings` table (editable qua Admin → Cài đặt), inject vào section `TY GIA`

---

## Rule 4: Ưu Tiên VN

**Sort code**:
```typescript
.sort((a, b) => {
  if (a.tenant === "VN" && b.tenant !== "VN") return -1
  if (b.tenant === "VN" && a.tenant !== "VN") return 1
  return (a.sku_code ?? "").localeCompare(b.sku_code ?? "")
})
```

System prompt ghi rõ rule ưu tiên VN trước US.

---

## Rule 5: Cost Visibility

`isCost = role === "admin" || role === "manager"`

- `isCost=true` → inject `skuCtxCost` (có gia_vnd|gia_usd) + NCC giá + TY GIA section
- `isCost=false` → inject `skuCtx` (không có giá) + NCC không có giá

**Xử lý server-side** → không thể xem qua DevTools

---

## NCC Catalog (buildNccSection)

Chỉ inject khi `detectCountry()` trả về tên nước (không null).

**WorldMove**: filter theo `region.toLowerCase().includes(countryEn)` → max 15 SP  
Mỗi row: `vendor_id|region|sim_type|days|data|throttle|trang_thai[|gia]`  
`trang_thai`: CO_TRONG_HT (vendor_sku match WM-*) hoặc CHUA_NHAP

**3HK**: filter theo `country.toLowerCase().includes(countryEn)` → tất cả match  
Mỗi row: `zone|country|network[|HKD/GB]|KYC`  
3HK chỉ thông tin tham khảo — KHÔNG tự tính gói, Gemini chỉ báo zone/network/giá_HKD/GB/KYC

---

## SKU Context Format

```
=== SAN PHAM GOHUB (N SKU active — chi eSIM Full va SIM Full) ===
Cau truc SKU code 13 ky tu: [source(1)][type(1)][country_group(3)][vendor(2)][data_policy(1)][data_amount(3)][day(2)]
sku_code|tenant|sim|data|days|throttle|operator|kyc|nuoc|vendor_sku[|latest_cogs|currency]
1CVNM...  |VN|eSIM|5GB|30d|5Mbps|...|No|VNM(Vietnam)|WM-e-...[|5.68|USD]
```

`nuoc` field = `products.supported_countries` — GROUP codes, Gemini decode qua `NHOM NUOC HO TRO`

---

## Liên kết

[[business_knowledge]] — 3HK formula, tỷ giá, product type codes  
[[feedback_autonomous]] — tự fix/test/push
