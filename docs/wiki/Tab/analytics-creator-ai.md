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

-- 3HK vendor: CHUẨN toàn hệ thống = '3HKDATAPOOL' (KHÔNG dùng LIKE '3HK%' — gồm dư 61 SKU vendor "3HK")
WHERE REPLACE(UPPER(TRIM(sk.vendor)),' ','') = '3HKDATAPOOL'

-- Loại tài khoản hệ thống (phân tích B2B theo tier)
AND c.name NOT IN ('B2C Customer US','B2C Customer VN','B2B Ops')
```

## Chuẩn nghiệp vụ trong system prompt (2026-08-02, đồng bộ audit s125/s126)

- **3HK** = `REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'` (không LIKE) → số 3HK của Gấu Pro khớp mọi tab.
- **CM1 / Op Cost**: phí `amount` pro-rata theo ngày + phí `percent` **CỘNG HẾT (SUM, không MAX)** — nhất quán BOD/Channels/B2B/B2C/Quarterly.
- **Total GP ≠ B2B GP + B2C GP**: nhóm order source `Internal-Transaction` (kênh "Misc.") = SIM tiêu dùng nội bộ (COGS thật, revenue 0 → GP âm). Total GP cộng nhóm này; prompt yêu cầu Gấu Pro giải thích khoản chênh khi người hỏi đối chiếu.

## Ổn định (stability)

- `genWithRetry` (creator-ai.ts): bọc mọi `model.generateContent` (initial + 20 vòng loop + fallback) → retry 3× backoff 0.8s/1.6s cho lỗi TẠM THỜI (429/quota/5xx/overload/timeout/network). Lỗi thật (prompt/schema) ném ngay. Trước đây 1 lỗi transient là hỏng cả request.

## Xuất dữ liệu & báo cáo (2026-08-02)

- **Excel FULL data từ SQL (fix "data cut >200 dòng")**: model chỉ THẤY 200 dòng đầu của executeSQL → nếu tự gõ lại vào \`\`\`csv thì cắt + sai. Nay model đặt \`sql:\` (câu SELECT gốc, đặt CUỐI marker \`\`\`export) → nút Excel gọi `POST /api/creator-ai/export {format:"xlsx", sql}` chạy lại query server-side → xuất TOÀN BỘ dòng. Guard: chỉ SELECT/WITH, 1 statement, creator/admin. Verify: query 146 KH → xlsx đủ 146 dòng.
  - \`\`\`csv giờ chỉ là PREVIEW (~20 dòng) hiển thị inline; dữ liệu Supabase (không SQL) vẫn dùng \`\`\`csv đầy đủ.
- **Báo cáo chi tiết (fix "hời hợt")**: SYSTEM_PROMPT thêm mục "Report depth" — khi hỏi báo cáo/phân tích: bối cảnh+kỳ → bảng số liệu (+chart) → 3-5 phát hiện chính → đối chiếu (Internal-Transaction/exclude/3HK) → đề xuất gắn mục tiêu Q3. Ép cụ thể, sâu.
- **Chính xác**: dùng định nghĩa chuẩn (3HK=3HKDATAPOOL, op-cost SUM percent, exclude NOT IN) → số khớp các tab.
- Word (.docx) server-side markdown→docx; PDF client html2canvas+jsPDF (giữ nguyên).

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

## Tab liên quan: Usage Analytics (`/analytics/creator/usage`)

Thống kê ai vào tab nào + Bé Gấu hỏi gì (chỉ creator). Nguồn: Supabase `app_usage_events` (ghi qua `/api/analytics/track`), đọc qua `/api/analytics/usage-stats`.

**Fix 2026-08-02:**
- **Định danh user** — trước dùng `session.user.email` nhưng nhiều user KHÔNG có email trong DB (auth `email: user.email || ""`) → mọi event gom vào 1 user rỗng, "Theo User"/top user hỏng. Nay `track/route.ts` + `chat/route.ts` dùng `email || username` (username luôn có).
- **Chat event không lưu** — `logChat` trong `chat/route.ts` trước fire-and-forget (`void`); serverless không có waitUntil → insert bị cắt khi handler trả stream → 0 chat event. Nay `await logChat(...)` (thêm user_name) → tab Chatbot (phân bố agent/top câu hỏi/log) mới có dữ liệu.
- **Export** — thêm nút Export (.xlsx) xuất toàn bộ event trong kỳ (thời gian/loại/user/role/tab/agent/câu hỏi).
- LƯU Ý: 156 event lịch sử vẫn user rỗng (không backfill); event MỚI mới có định danh.
