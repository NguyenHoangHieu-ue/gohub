# Hệ thống 5 Agents Chatbot GoHub

File: `web/src/lib/agents/agents.ts`  
Router: `web/src/lib/agents/router.ts`  
Tools: `web/src/lib/agents/tools.ts`  
API: `web/src/app/api/chat/route.ts`  
Cache: `web/src/lib/agents/cache.ts`

---

## 1. Tư Vấn (`tu-van`) 🔍

**Trigger:** User hỏi "đi nước X có gói nào", "tìm gói Japan 7 ngày", "có eSIM cho Thái không"  
**Rule:** Có `params.country` hoặc từ khóa "đi", "gói", "eSIM"

**Context được inject (3 nguồn):**
1. `[GOHUB SKU]` — `searchSkus(country, days, dataGB, isUnlimited, vendor)` → bảng `sku_catalog`, 4-step fallback
2. `[WM CATALOG]` — `searchNccWm(country, days)` → catalog WM từ cache, kèm `exist=Yes/No`
3. `[3HK ZONES]` — `searchNcc3hk(country)` → zones 3HK từ cache

**4-step country search fallback (searchSkus):**
- Phase 1: Gói riêng cho nước (single-country groups)
- Phase 2: Nhóm nước bao gồm nước đó (cache, ISO exact match)
- Phase 3: DB query `ref_support_countries` ilike (bắt cache miss)
- Phase 4: Gói khu vực rộng World/Global/CIS/Europe... (last resort, chỉ khi có ISO code)

**Output:** Hiển thị GoHub SKU trước → WM catalog (đã/chưa tạo) → 3HK zones  
**Roles:** admin / manager / standard

---

## 2. Tra Cứu (`tra-cuu`) 📋

**Trigger:** User đưa mã SKU (13 ký tự), Product Code (8 ký tự), Item Code/Alias (18 ký tự), Listing Code  
**Rule:** `params.skuCode` hoặc `params.productCode`; từ khóa listing/item/giá bán/APN/activation  
**Tools:**
- `identifyCode(code)` → nhận dạng loại mã
- `getProductDetail(sku_code)` → SKU + Product + Listings + Items
- `getProductByCode(product_code)` → Product + all SKUs + Listings
- `getItems(sku_code / listing_code)` → danh sách items
- `searchListings(product_code / name)` → listings chi tiết
**Output:** Toàn bộ thông tin chi tiết, bao gồm trường **note** (lưu ý đặc biệt)  
**Roles:** admin / manager / standard

---

## 3. Giải Đáp (`giai-dap`) 💡

**Trigger:** User hỏi "nghĩa là gì", "giải thích", "cấu trúc mã", "data policy", "KYC là gì"  
**Rule:** Từ khóa "nghĩa", "giải thích", "cấu trúc", "data policy", "source type", "ký tự"  
**Tools:**
- `getVendorInfo()` → danh sách vendors
- `decodeSkuCode(sku_code)` → giải mã từng ký tự SKU
- `getCountryInfo(country)` → nhóm nước hỗ trợ
- `searchNccWm(country)` → inject NCC nếu hỏi về nước cụ thể hoặc WM (mới)
**Output:** Giải thích hệ thống, thuật ngữ, cấu trúc mã. Default agent khi không match rule nào.  
**Roles:** admin / manager / standard

---

## 4. Giá & COGS (`gia-cogs`) 💰

**Trigger:** User hỏi "COGS", "giá vốn", "giá nhập", "lợi nhuận", "tỷ giá", "chi phí"  
**Rule:** Từ khóa COGS/giá vốn/lợi nhuận/tỷ giá  
**Tools:**
- `getFxRates()` → tỷ giá nội bộ (USD/VND, HKD/USD, TWD/USD)
- `getSkuCogs(sku_code)` → COGS chi tiết 1 SKU
- `calculate3hkCogs(zone, days, data_type, data_gb)` → tính COGS 3HK theo formula
**Output:** Tỷ giá + COGS USD + COGS VND đã quy đổi  
**Roles:** admin / manager / standard

---

## 5. Gap Analysis (`gap-analysis`) 🔄

**Trigger:** User hỏi "NCC có gì mà hệ thống chưa có", "chưa import", "so sánh NCC", "gap"  
**Rule:** Từ khóa "gap", "NCC có", "chưa có", "chưa import", "so sánh ncc", "phân tích"  
**Tools:**
- `findGaps(country, vendor)` → dùng `nccWmInSystem` từ cache (built từ cột `exist`)
- `searchNccWm(country, days, sim_type)` → catalog WM từ cache (8921 rows đầy đủ)
- `searchNcc3hk(country)` → zones 3HK từ cache
**Output:** Tổng WM, đã tạo (exist=Yes) / chưa tạo (exist=No), sample sản phẩm chưa có  
**Roles:** admin / manager / standard

---

## DISPLAY_RULES — Thuật ngữ bắt buộc

| Trạng thái | Nghĩa |
|---|---|
| "Có trong hệ thống GoHub" | Có SKU active trong GoHub — khách hàng đặt mua được |
| "Chưa có trong hệ thống GoHub" | GoHub chưa tạo SKU |
| "WM có, GoHub đã tạo" | exist=Yes — WM product đã thành SKU GoHub |
| "WM có, GoHub chưa tạo" | exist=No — WM có nhưng GoHub chưa nhập |

**Không hallucinate:** Chỉ dùng dữ liệu trong context. Không suy đoán, không ước tính.  
**Không dùng từ mơ hồ** "có sẵn", "tồn tại" mà không nói rõ đang nói về GoHub hay NCC.

---

## Cache (`cache.ts`) — 30 phút TTL

| Dữ liệu | Table | Ghi chú |
|---|---|---|
| supportCountries | ref_support_countries | group codes + country_codes |
| countries | ref_countries | ISO codes + tên nước |
| vendors | ref_vendors | vendor_code + name |
| nccWm | ncc_worldmove | **8921 rows** (pagination loop), bao gồm APN, notification, exist |
| nccWmInSystem | — | Set built từ `exist='Yes'` (không query skus riêng) |
| ncc3hk | ncc_3hk | 45 zones |
| groupMap | — | code → support_country name (dùng cho searchNccWm fallback) |

**ncc_worldmove.exist** (cột mới): `Yes/No`, auto-update bởi `sync.py` sau mỗi sync daily.

---

## Luồng xử lý

```
User message
  → router.ts: extractParams() → classifyAgent() → agentId + params
  → route.ts: buildToolContext(agentId, params) → pre-execute tools → context string
        tu-van: GoHub SKUs + WM catalog (exist flag) + 3HK zones
  → agents.ts: agent.systemPrompt + context → Gemini stream
  → UI: agent badge + streaming text
```

## Chỉnh sửa nhanh

| Muốn thay đổi | File |
|---|---|
| System prompt của agent | `web/src/lib/agents/agents.ts` |
| Logic nhận diện route đến agent nào | `web/src/lib/agents/router.ts` |
| Tool implementations (query DB) | `web/src/lib/agents/tools.ts` |
| Context building (pre-execute tools) | `web/src/app/api/chat/route.ts` — hàm `buildToolContext` |
| Cache dữ liệu tham chiếu (30 phút) | `web/src/lib/agents/cache.ts` |
| Thuật ngữ / display rules | `web/src/lib/agents/agents.ts` — const `DISPLAY_RULES` |
| Country search fallback logic | `web/src/lib/agents/tools.ts` — hàm `getCountryCodes` + `searchSkus` |
| NCC injection trong chatbot | `web/src/app/api/chat/route.ts` — `buildToolContext` → tu-van section |
