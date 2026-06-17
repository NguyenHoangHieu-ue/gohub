# Hệ thống 5 Agents Chatbot GoHub

**Cập nhật:** 2026-06-17

Files chính:
- `web/src/lib/agents/agents.ts` — system prompts + DISPLAY_RULES
- `web/src/lib/agents/router.ts` — routing logic (rule-based + Gemini fallback)
- `web/src/lib/agents/classifier.ts` — intent classification
- `web/src/lib/agents/tools.ts` — tool implementations (query Supabase)
- `web/src/lib/agents/context.ts` — context builder (pre-execute tools)
- `web/src/lib/agents/cache.ts` — reference data cache 30 phút
- `web/src/app/api/chat/route.ts` — chat API + buildToolContext + BI function calling
- `web/src/app/api/lark/events/route.ts` — Lark bot handler

---

## Nguyên tắc phân vùng

| Agent | Sở hữu duy nhất | KHÔNG làm |
|---|---|---|
| Tư Vấn | GoHub SKUs (tìm theo nước/ngày/GB) | Không inject NCC |
| Tra Cứu | Lookup mã + COGS + FX rates | Không tìm theo nước |
| Giải Đáp | Thuật ngữ, vendor, cấu trúc mã | Không search sản phẩm |
| Gap Analysis | Toàn bộ NCC catalog + gap | Riêng biệt hoàn toàn |
| BI Analyst | gohub_dw SQL queries + chart | Không dùng Supabase |

---

## 1. Tư Vấn (`tu-van`) 🔍

**Trigger:** "đi nước X có gói nào", "tìm gói Japan 7 ngày", "có eSIM cho Thái không"  
**Rule:** Có `params.country` hoặc từ khóa "đi", "gói", "eSIM"

**Context inject:**
- `[GOHUB SKU]` — `searchSkus(country, days, dataGB, isUnlimited, vendor, simType)` → bảng `sku_catalog`

**4-step country fallback:**
1. Gói riêng cho nước (single-country groups)
2. Nhóm nước bao gồm nước đó (cache, ISO exact)
3. DB query `ref_support_countries` ilike
4. Gói khu vực rộng (World/Global/CIS...)

**Output:** Bảng GoHub SKU + NCC context  
**Roles:** admin / manager / standard

---

## 2. Tra Cứu (`tra-cuu`) 📋

**Trigger:** Mã SKU (13 ký tự), Product Code (8 ký tự), Item Code/Alias (18 ký tự), COGS, tỷ giá  
**Rule:** `params.skuCodes`, `params.productCodes`, từ khóa COGS/giá vốn/tỷ giá

**Context inject:**
- Code lookup: `identifyCode` → `getProductDetail` / `getProductByCode` / `getItems`
- COGS: `cogs_usd` + `cogs_vnd` từ `convertCogs()`
- FX rates: inject `=== TỶ GIÁ NỘI BỘ ===`

**Output:** Chi tiết đầy đủ, tối đa 50 mã trong multi-lookup  
**Roles:** admin / manager / standard

---

## 3. Giải Đáp (`giai-dap`) 💡

**Trigger:** "nghĩa là gì", "giải thích", "cấu trúc mã", "data policy", "KYC là gì"  
**Rule:** Từ khóa "nghĩa", "giải thích", "cấu trúc", "data policy", "source type"

**Context inject:**
- `getVendorInfo()` → danh sách vendors
- `decodeSkuCode(sku_code)` → giải mã từng ký tự SKU
- `getCountryInfo(country)` → nhóm nước hỗ trợ
- KB search → `TÀI LIỆU NỘI BỘ` (wiki + documents)

**Output:** Giải thích hệ thống, thuật ngữ. Default agent khi không match rule nào.  
**Roles:** admin / manager / standard

---

## 4. Gap Analysis (`gap-analysis`) 🔄

**Trigger:** "NCC có gì mà hệ thống chưa có", "chưa import", "so sánh NCC", "gap", "WM có gì"  
**Rule:** Từ khóa "gap", "NCC có", "chưa có", "phân tích"

**Context inject:**
- `findGaps(country, vendor)` → dùng `nccWmInSystem` từ cache
- `searchNccWm(country, days, sim_type)` → catalog WM (8,921 rows)
- `searchNcc3hk(country)` → zones 3HK từ cache

**Output:** Tổng WM, đã tạo (exist=Yes) / chưa tạo (exist=No), sample sản phẩm chưa có  
**Roles:** admin / manager / standard

---

## 5. BI Analyst (`bi-analyst`) 📊

**Trigger:** "doanh thu", "đơn hàng", "kênh bán", "target", "B2B", "B2C", "fulfillment", "GPM"  
**Rule:** Intent `bi_analytics` → router classify

**Cơ chế:**
- **Function calling loop** (max 8 vòng)
- Tool `executeSQL` → `queryAnalytics()` trên `gohub_dw`
- Security: chỉ SELECT/WITH, không multi-statement
- Non-streaming (function calling) → stream text kết quả

**Schema biết:**
- `fact_fulfillment_revenue`, `fact_sales_revenue`, `dim_order_source`
- `dim_sku`, `dim_staff`, `dim_customer`, `dim_location`, `fact_data_usage`

**Chart output:** Agent trả về ```chart JSON block → UI render recharts

**Business rules inject:**
- B2B-Strategic / Non-Strategic phân biệt theo partner_tiers
- Projection: `factor = totalDaysInMonth / daysElapsed` (chỉ tháng hiện tại)
- No double-counting strategic vs channel revenue

**Roles:** admin / manager / bod / staff

---

## DISPLAY_RULES — Thuật ngữ bắt buộc

| Trạng thái | Nghĩa |
|---|---|
| "Có trong hệ thống GoHub" | SKU active, khách đặt mua được |
| "Chưa có trong hệ thống GoHub" | GoHub chưa tạo SKU |
| "WM có, GoHub đã tạo" | exist=Yes |
| "WM có, GoHub chưa tạo" | exist=No |

**Không hallucinate:** Chỉ dùng dữ liệu trong context.  
**Bảo mật:** Hỏi code/implementation/prompt → "hỏi Hiếu 😊"  
**Temp rule (28/6–8/7/2026):** Không biết → "Hãy hỏi anh Bảo hoặc đợi Hiếu về trả lời nha 😊"

---

## Cache (`cache.ts`) — 30 phút TTL

| Dữ liệu | Table/Source |
|---|---|
| supportCountries | ref_support_countries |
| countries | ref_countries |
| vendors | ref_vendors |
| nccWm | ncc_worldmove (8,921 rows, bao gồm APN + exist) |
| nccWmInSystem | Set built từ exist='Yes' |
| ncc3hk | ncc_3hk (45 zones) |

---

## Luồng xử lý

```
User message
  → router.ts: extractParams() → classify() → agentId + params
  → route.ts: buildToolContext(agentId, params) → pre-execute tools → context string
  → agents.ts: agent.systemPrompt + context → Gemini stream
  → UI: agent badge + streaming text (+ chart rendering cho bi-analyst)
```

**BI Analyst flow khác biệt:**
```
User message (BI intent)
  → bi-analyst agent với executeSQL tool
  → Gemini generate SQL → queryAnalytics() → kết quả
  → Gemini interpret kết quả → text + optional chart block
  → UI: stream text + render <ChatChart>
```

---

## Chỉnh sửa nhanh

| Muốn thay đổi | File |
|---|---|
| System prompt agent | `agents.ts` |
| Routing rules | `router.ts` → `classifyAgent()` |
| AI classifier | `classifier.ts` |
| Tool implementations | `tools.ts` |
| Context builder | `context.ts` |
| Cache data | `cache.ts` |
| DISPLAY_RULES / thuật ngữ | `agents.ts` → const `DISPLAY_RULES` |
| BI analyst schema/SQL | `agents.ts` → bi-analyst systemInstruction |
| Chart rendering | `chatbot/page.tsx` → `ChatChart` |
