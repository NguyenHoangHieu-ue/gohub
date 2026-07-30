---
title: "Gấu Pro (Creator AI)"
page_type: tab_guide
is_hidden: true
---

# Gấu Pro — Creator AI

**Route:** `/analytics/creator/ai`  
**API:** `POST /api/creator-ai/chat`  
**Agent:** `web/src/lib/agents/creator-ai.ts`

## Mục đích

AI riêng dành độc quyền cho role **creator** (Hiếu). Không phục vụ team — không có guardian, không role filter, toàn quyền truy cập mọi dữ liệu. Dùng để:

- Query trực tiếp gohub_dw + Supabase mà không cần vào DB console
- Phân tích dữ liệu, vẽ chart, tạo bảng thống kê
- Hỏi về code, kiến trúc hệ thống, quy trình kỹ thuật
- Tìm kiếm web với trích dẫn nguồn uy tín
- Tư vấn kinh doanh, chiến lược, tài chính theo vai trò chuyên gia

## Phân quyền

- **Chỉ creator** (403 với bất kỳ role nào khác)
- Không guardian, không role_filter, không COGS restriction
- Có thể truy cập bảng SENSITIVE (users, app_settings, conversations, v.v.)

## Luồng xử lý

```
POST /api/creator-ai/chat { messages: [{role, content}] }
  ↓ (creator-only check)
  ↓ Convert to Gemini history
  ↓ runCreatorAI(history, lastMsg)
      ↓ Load partner tiers + GA4 sites (parallel)
      ↓ Gemini 3.6 Flash với 7 tools (max 20 iterations)
          executeSQL     → gohub_dw PostgreSQL
          querySupabase  → Supabase (ALL tables incl. sensitive)
          listSupabaseTables
          queryGA4       → Google Analytics 4
          queryGSC       → Google Search Console
          queryProduct   → Supabase product/sku lookup
          webSearch      → Gemini Google Search grounding (separate call)
      ↓ Collect web sources from webSearch calls
      ↓ Return { text, sources[] }
  ↓ NextResponse.json({ text, sources })
```

## Tools

| Tool | Nguồn dữ liệu | Mô tả |
|------|--------------|-------|
| `executeSQL` | gohub_dw (Postgres) | SELECT/WITH query tự do |
| `querySupabase` | Supabase REST | Tất cả bảng (bao gồm sensitive) |
| `listSupabaseTables` | - | Liệt kê bảng có thể query |
| `queryGA4` | Google Analytics 4 | Traffic, conversion, revenue website |
| `queryGSC` | Google Search Console | SEO, keyword, click data |
| `queryProduct` | Supabase skus/products | Lookup chi tiết 1 SKU/product |
| `webSearch` | Google Search (Gemini grounding) | Tìm kiếm web với citation |

## Web Search

- Tách thành 1 Gemini call riêng với `tools: [{ googleSearch: {} }]`
- Không thể kết hợp googleSearch với functionDeclarations trong cùng 1 call → dùng 2 model instance
- Kết quả gồm text + `groundingMetadata.groundingChunks` (sources với title + URL)
- Sources được thu thập và trả về trong response.sources[] để FE hiển thị
- Nếu grounding thất bại: trả error message, agent tiếp tục từ knowledge training

## System prompt

Vai trò: "Gấu Pro" — private AI của Hiếu  
Expert personas tự động theo domain:
- Data/BI: Senior Data Scientist 15+ năm
- Software Engineering: Staff Engineer / System Architect
- Business Strategy: ex-McKinsey Principal (eCommerce/telecom)
- Financial Analysis: CFA, ex-investment banking
- Marketing/Growth: Growth Lead tại Series B/C startup
- Product: ex-PM at tech unicorns

Rules cứng:
1. Data queries → LUÔN query DB thật, không ước tính
2. Suggestions → dựa trên data thật + expert persona
3. Web search → LUÔN cite source URL
4. Cho phép hỏi code/system/prompt/schema (không có guardian)

## UI

- Route: `/analytics/creator/ai`
- Màu theme: violet (#7c3aed) để phân biệt với Bé Gấu (brand-600 blue)
- Không lưu conversation lên Supabase — in-memory state only
- Show elapsed timer khi loading (có thể 30-60s)
- Hiển thị web sources dưới mỗi assistant message (có link)
- Chart rendering: reuse `ChatChart` component (```chart JSON block)
- Auto-resize textarea (Shift+Enter = xuống dòng)
- maxDuration = 300s (Vercel Pro)

## SQL rules quan trọng (trong system prompt)

```sql
-- fulfiled_date (1 chữ l) là TEXT → phải cast
WHERE f.fulfiled_date::DATE >= '2026-01-01'
AND   f.fulfiled_date::date <= CURRENT_DATE - 1

-- dim_sku dùng cột "sku" (không phải sku_code)
JOIN dim_sku sk ON TRIM(f.sku) = TRIM(sk.sku)

-- 3HK vendor có khoảng trắng không nhất quán
WHERE REPLACE(UPPER(TRIM(sk.vendor)),' ','') LIKE '3HK%'

-- Loại tài khoản hệ thống
AND c.name NOT ILIKE '%B2C Customer%'
AND c.name NOT ILIKE '%B2B Ops%'
```

## Vận hành

- Timeout: 300s (cấu hình `export const maxDuration = 300` trong route)
- Iterations: tối đa 20 (nhiều hơn bi-analyst (12) và data-explorer (10))
- Không có caching (mỗi request mới query DB fresh)
- Error: trả `{ error: message }` với status 500, FE hiển thị lỗi thật (creator role)

## Thêm/sửa

| Muốn thay đổi | File |
|---|---|
| System prompt / persona | `web/src/lib/agents/creator-ai.ts` → `SYSTEM_PROMPT` |
| Thêm/sửa tool | `web/src/lib/agents/creator-ai.ts` → tool declarations + switch case |
| Phân quyền | `web/src/app/api/creator-ai/chat/route.ts` → role check |
| UI / quick prompts | `web/src/app/(dashboard)/analytics/creator/ai/page.tsx` |
| Nav label/icon | `web/src/lib/nav.ts` → `CREATOR_GROUP` |
