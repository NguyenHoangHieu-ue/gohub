# Hệ thống 4 Agents Chatbot GoHub

File: `web/src/lib/agents/agents.ts`  
Router: `web/src/lib/agents/router.ts`  
Classifier: `web/src/lib/agents/classifier.ts`  
Tools: `web/src/lib/agents/tools.ts`  
API: `web/src/app/api/chat/route.ts`  
Cache: `web/src/lib/agents/cache.ts`

---

## Nguyên tắc phân vùng

| Agent | Sở hữu duy nhất | KHÔNG làm |
|---|---|---|
| Tư Vấn | GoHub SKUs (tìm theo nước/ngày/GB) | Không inject NCC |
| Tra Cứu | Lookup mã + COGS + FX rates | Không tìm theo nước |
| Giải Đáp | Thuật ngữ, vendor, cấu trúc mã | Không search sản phẩm, không NCC |
| Gap Analysis | Toàn bộ NCC catalog + gap | Riêng biệt hoàn toàn |

---

## 1. Tư Vấn (`tu-van`) 🔍

**Trigger:** "đi nước X có gói nào", "tìm gói Japan 7 ngày", "có eSIM cho Thái không"  
**Rule:** Có `params.country` hoặc từ khóa "đi", "gói", "eSIM"

**Context được inject:**
- `[GOHUB SKU]` — `searchSkus(country, days, dataGB, isUnlimited, vendor, simType)` → bảng `sku_catalog`, 4-step fallback

**4-step country search fallback (searchSkus):**
- Phase 1: Gói riêng cho nước (single-country groups)
- Phase 2: Nhóm nước bao gồm nước đó (cache, ISO exact match)
- Phase 3: DB query `ref_support_countries` ilike (bắt cache miss)
- Phase 4: Gói khu vực rộng World/Global/CIS/Europe... (last resort)

**Output:** Bảng GoHub SKU — nếu không có → "GoHub chưa có sản phẩm cho nước này"  
**Roles:** admin / manager / standard

---

## 2. Tra Cứu (`tra-cuu`) 📋

**Trigger:** Mã SKU (13 ký tự), Product Code (8 ký tự), Item Code/Alias (18 ký tự), Listing Code; hoặc từ khóa COGS/giá vốn/tỷ giá  
**Rule:** `params.skuCodes`, `params.productCodes`; từ khóa listing/item/giá bán/APN/activation/COGS/tỷ giá

**Context được inject:**
- Code lookup: `identifyCode` → `getProductDetail` / `getProductByCode` / `getItems` / `searchListings`
- COGS enrichment: `cogs_usd` + `cogs_vnd` tính sẵn từ `convertCogs()`
- FX rates: `=== TỶ GIÁ NỘI BỘ ===` inject luôn (dùng cho COGS display và query tỷ giá thuần)

**Output:** Chi tiết đầy đủ — note bắt buộc đọc. Khi nhiều mã: bảng MULTI LOOKUP (tối đa 50 mã).  
**Roles:** admin / manager / standard

---

## 3. Giải Đáp (`giai-dap`) 💡

**Trigger:** "nghĩa là gì", "giải thích", "cấu trúc mã", "data policy", "KYC là gì", "throttle"  
**Rule:** Từ khóa "nghĩa", "giải thích", "cấu trúc", "data policy", "source type", "ký tự"

**Context được inject:**
- `getVendorInfo()` → danh sách vendors
- `decodeSkuCode(sku_code)` → giải mã từng ký tự SKU (nếu có skuCode)
- `getCountryInfo(country)` → nhóm nước hỗ trợ (nếu có country)

**Output:** Giải thích hệ thống, thuật ngữ, cấu trúc mã. Default agent khi không match rule nào.  
**Roles:** admin / manager / standard

---

## 4. Gap Analysis (`gap-analysis`) 🔄

**Trigger:** "NCC có gì mà hệ thống chưa có", "chưa import", "so sánh NCC", "gap", "WM có gì", "3HK"  
**Rule:** Từ khóa "gap", "NCC có", "chưa có", "chưa import", "so sánh ncc", "phân tích"

**Context được inject:**
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
| nccWmInSystem | — | Set built từ `exist='Yes'` |
| ncc3hk | ncc_3hk | 45 zones |
| groupMap | — | code → support_country name (dùng cho searchNccWm fallback) |

**ncc_worldmove.exist** (cột tự động): `Yes/No`, auto-update bởi `sync.py` sau mỗi sync daily.

---

## Luồng xử lý

```
User message
  → router.ts: extractParams() → classify() (Gemini) → agentId + params
  → route.ts: buildToolContext(agentId, params) → pre-execute tools → context string
  → agents.ts: agent.systemPrompt + context → Gemini stream
  → UI: agent badge + streaming text
```

## Chỉnh sửa nhanh

| Muốn thay đổi | File |
|---|---|
| System prompt của agent | `web/src/lib/agents/agents.ts` |
| Logic routing rule-based | `web/src/lib/agents/router.ts` — `classifyAgent()` |
| Logic routing AI (Gemini classifier) | `web/src/lib/agents/classifier.ts` |
| Tool implementations (query DB) | `web/src/lib/agents/tools.ts` |
| Context building (pre-execute tools) | `web/src/app/api/chat/route.ts` — `buildToolContext()` |
| Cache dữ liệu tham chiếu (30 phút) | `web/src/lib/agents/cache.ts` |
| Thuật ngữ / display rules | `web/src/lib/agents/agents.ts` — const `DISPLAY_RULES` |
| Country search fallback logic | `web/src/lib/agents/tools.ts` — `getCountryCodes()` + `searchSkus()` |
