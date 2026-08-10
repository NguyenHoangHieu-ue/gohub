import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto"
import { queryAnalytics }                 from "@/lib/analytics-db"
import { cachedQuery }                    from "@/lib/analytics-helpers"
import { supabaseAdmin }                   from "@/lib/supabase"
import { runGA4Report, runGSC, ga4Sites } from "@/lib/ga4"
import { getPartnerTiers }               from "@/lib/analytics-helpers"
import { SUPABASE_TABLES, SENSITIVE_TABLES } from "./data-explorer"
import { runWebSearch as _runWebSearch, type WebSource } from "@/lib/web-search"
export { runWebSearch, type WebSource } from "@/lib/web-search"

// ─── Phase 2: import từ creator/ modules ─────────────────────────────────────
import { ALL_TOOL_DECLARATIONS } from "./creator/declarations"
import { dispatchTool }          from "./creator/tools/dispatch"

// ─── Creator AI ───────────────────────────────────────────────────────────────
// Private AI exclusively for Hiếu (creator role).
// Full access: gohub_dw + Supabase + GA4 + GSC + Web Search.
// No guardian, no role filter, no restrictions.
// Quality > Speed — max 20 function-calling iterations.

export interface FileContext {
  name:      string
  type:      "text" | "image" | "pdf"
  content:   string    // text content (for "text") or base64 (for "image"/"pdf")
  mimeType?: string    // e.g. "image/png", "application/pdf"
  extraText?: string   // additional text from sibling files when binary + text combined
}

export type GPEvent =
  | { type: "status"; text: string }
  | { type: "text"; content: string }
  | { type: "done"; conversationId: string | null; sources: WebSource[]; summarized: boolean }
  | { type: "error"; message: string }

const TOOL_STATUS: Record<string, string> = {
  executeSQL:              "⚙️ Đang query analytics database...",
  querySupabase:           "📊 Đang đọc dữ liệu Supabase...",
  listSupabaseTables:      "📋 Đang liệt kê tables...",
  queryGA4:                "📈 Đang query Google Analytics...",
  queryGSC:                "🔍 Đang query Google Search Console...",
  queryProduct:            "📦 Đang tra cứu sản phẩm...",
  generateImage:           "🎨 Đang tạo ảnh...",
  getTrendSnapshots:       "📡 Đang đọc trend data...",
  listLarkTasks:           "✅ Đang đọc Lark tasks...",
  listLarkTasklists:       "✅ Đang đọc Lark task lists...",
  getLarkTask:             "✅ Đang đọc task detail...",
  createLarkTask:          "✅ Đang tạo Lark task...",
  updateLarkTask:          "✅ Đang cập nhật Lark task...",
  queryLarkBase:           "📋 Đang đọc Lark Base...",
  managePortalCredentials: "🔑 Đang quản lý credentials...",
  readKnowledgeBase:       "📚 Đang đọc Knowledge Base...",
  writeKnowledgeBase:      "💾 Đang cập nhật Knowledge Base...",
  reviewPendingLearning:   "🔍 Đang đọc pending learning...",
  approveLearning:         "✅ Đang approve learning...",
  rejectLearning:          "❌ Đang reject learning...",
}

// ─── Tool declarations ───────────────────────────────────────────────────────

// ⚠️ DEAD CODE — các declarations bên dưới KHÔNG được dùng (Gemini dùng ALL_TOOL_DECLARATIONS từ creator/declarations.ts).
// TODO: xóa block này khi tiện — giữ tạm để tránh merge conflict với branch cũ.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const executeSQLDecl = {
  name: "executeSQL",
  description: "Execute a SELECT/WITH query on gohub_dw PostgreSQL (analytics DW). Use for revenue, orders, fulfillment, staff, customer, 3HK usage, etc.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: { sql: { type: SchemaType.STRING, description: "SELECT or WITH query only." } },
    required: ["sql"],
  },
}

const querySupabaseDecl = {
  name: "querySupabase",
  description: "Read from Supabase tables (product catalog, SKUs, NCC, KB/Wiki, config, analytics snapshots). Use when question is about catalog, config, or reference data — NOT raw revenue facts.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      table:   { type: SchemaType.STRING, description: "Table name (call listSupabaseTables to see all)." },
      columns: { type: SchemaType.STRING, description: "Comma-separated columns, default '*'." },
      filters: {
        type: SchemaType.ARRAY,
        description: "Filter conditions [{column, op, value}]. op ∈ eq,neq,gt,gte,lt,lte,like,ilike,in,is.",
        items: {
          type: SchemaType.OBJECT,
          properties: {
            column: { type: SchemaType.STRING },
            op:     { type: SchemaType.STRING },
            value:  { type: SchemaType.STRING },
          },
          required: ["column", "op", "value"],
        },
      },
      order:     { type: SchemaType.STRING },
      ascending: { type: SchemaType.BOOLEAN },
      limit:     { type: SchemaType.NUMBER, description: "Max rows (default 50, max 200)." },
      countOnly: { type: SchemaType.BOOLEAN, description: "true = return count only." },
    },
    required: ["table"],
  },
}

const listTablesDecl = {
  name: "listSupabaseTables",
  description: "List all queryable Supabase tables with descriptions.",
  parameters: { type: SchemaType.OBJECT, properties: {} },
}

const queryGA4Decl = {
  name: "queryGA4",
  description: "Query Google Analytics 4 for website traffic: sessions, users, pageviews, revenue, conversions, bounce rate. Use for website performance questions.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      startDate:  { type: SchemaType.STRING, description: "YYYY-MM-DD or '30daysAgo'" },
      endDate:    { type: SchemaType.STRING, description: "YYYY-MM-DD or 'today'" },
      metrics:    { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      dimensions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      siteId:     { type: SchemaType.STRING },
      limit:      { type: SchemaType.NUMBER },
    },
    required: ["startDate", "endDate", "metrics"],
  },
}

const queryGSCDecl = {
  name: "queryGSC",
  description: "Query Google Search Console for SEO data: clicks, impressions, CTR, average position, top keywords.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      startDate:  { type: SchemaType.STRING },
      endDate:    { type: SchemaType.STRING },
      dimensions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      siteId:     { type: SchemaType.STRING },
      rowLimit:   { type: SchemaType.NUMBER },
    },
    required: ["startDate", "endDate"],
  },
}

const queryProductDecl = {
  name: "queryProduct",
  description: "Look up GoHub SKU or product details from Supabase product catalog (COGS, throttle speed, call/SMS, KYC, vendor SKU, status). Input: sku_code (13 chars) or product_code (8 chars).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      sku_code:     { type: SchemaType.STRING, description: "13-character SKU code." },
      product_code: { type: SchemaType.STRING, description: "8-character product code." },
    },
  },
}

const webSearchDecl = {
  name: "webSearch",
  description: "Search the web for current information: industry trends, technical documentation, best practices, benchmarks, news, or anything not in internal databases. Always cite source URLs in the answer.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: { type: SchemaType.STRING, description: "Search query (English preferred for broader results)." },
    },
    required: ["query"],
  },
}

const generateImageDecl = {
  name: "generateImage",
  description: "Generate an AI image from a text description. Use when Hiếu asks to 'tạo ảnh', 'vẽ', 'design', 'thumbnail', 'banner', 'mockup', 'storyboard frame'. Always write the prompt in English for best quality. Pollinations will AI-enhance the prompt automatically (enhance=true).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      prompt: {
        type: SchemaType.STRING,
        description: "Detailed image description in English. Structure: [subject] + [style: photorealistic/cinematic/flat illustration/3D render] + [composition] + [lighting: golden hour/studio/dramatic] + [colors/mood] + [quality suffix: highly detailed, 8K, masterpiece, professional quality, no text, no watermark]. The more specific, the better.",
      },
      aspect_ratio: {
        type: SchemaType.STRING,
        description: "Aspect ratio: '1:1' (square 1024×1024, default) | '9:16' (TikTok/Reels 864×1536) | '16:9' (landscape 1536×864) | '4:3' (standard 1024×768)",
      },
    },
    required: ["prompt"],
  },
}

const getTrendSnapshotsDecl = {
  name: "getTrendSnapshots",
  description: "Read GoHub's stored daily trend snapshots — travel SIM/eSIM trends, competitor TikTok content, viral topics. ALWAYS call this FIRST when Hiếu asks about trends, content ideas, script generation, or competitor analysis. Falls back to webSearch if snapshots are stale.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      days:     { type: SchemaType.NUMBER, description: "Look back N days (default 7, max 30)." },
      category: { type: SchemaType.STRING, description: "Filter: 'travel_sim' | 'competitor' | 'travel' | 'content_format' | 'technology' | 'seasonal' | 'all' (default: all)" },
      platform: { type: SchemaType.STRING, description: "Filter: 'tiktok' | 'google' | 'all' (default: all)" },
    },
  },
}

const listLarkTasksDecl = {
  name: "listLarkTasks",
  description: "List Hiếu's Lark tasks (To-do / in-progress / done). Nếu truyền tasklist_guid → chỉ lấy task trong Danh sách công việc (Task List) đó; bỏ trống → tất cả task của Hiếu. Requires 'task:task:read'.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      tasklist_guid: { type: SchemaType.STRING, description: "GUID của Task List (từ listLarkTasklists) — bỏ trống để lấy mọi task." },
      page_size: { type: SchemaType.NUMBER, description: "Max tasks (default 20, max 50)." },
      page_token: { type: SchemaType.STRING, description: "Pagination token for next page." },
    },
  },
}
const listLarkTasklistsDecl = {
  name: "listLarkTasklists",
  description: "Liệt kê các Danh sách công việc (Task List) của Hiếu trong Lark — trả về guid + tên mỗi list. Dùng khi Hiếu hỏi về 'task list'/'danh sách công việc'; rồi gọi listLarkTasks với tasklist_guid để xem task bên trong. Requires 'task:tasklist:read'.",
  parameters: { type: SchemaType.OBJECT, properties: {} },
}
const getLarkTaskDecl = {
  name: "getLarkTask",
  description: "Get full details of 1 Lark task by task_guid (title, description, due date, status, sub-tasks).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: { task_guid: { type: SchemaType.STRING, description: "Task GUID from listLarkTasks." } },
    required: ["task_guid"],
  },
}
const createLarkTaskDecl = {
  name: "createLarkTask",
  description: "Tạo task Lark mới GÁN cho Hiếu (hiện trong My Tasks của Hiếu). Hoạt động tốt với app token. Requires 'task:task:write'.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      summary:     { type: SchemaType.STRING, description: "Task title." },
      description: { type: SchemaType.STRING, description: "Task description (markdown ok)." },
      due:         { type: SchemaType.STRING, description: "Due date YYYY-MM-DD." },
    },
    required: ["summary"],
  },
}
const updateLarkTaskDecl = {
  name: "updateLarkTask",
  description: "Update a Lark task (mark complete, change due date, update description). Requires 'task:task:write' scope.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      task_guid:   { type: SchemaType.STRING, description: "Task GUID." },
      summary:     { type: SchemaType.STRING, description: "New title (optional)." },
      description: { type: SchemaType.STRING, description: "New description (optional)." },
      due:         { type: SchemaType.STRING, description: "New due date YYYY-MM-DD (optional)." },
      complete:    { type: SchemaType.BOOLEAN, description: "true = mark done." },
    },
    required: ["task_guid"],
  },
}
const queryLarkBaseDecl = {
  name: "queryLarkBase",
  description: "Đọc dữ liệu Lark Base (bảng tính Lark): CS ticket, inventory, tracking, danh sách. Gọi KHÔNG tham số để liệt kê các Base có sẵn; truyền app_token để liệt kê tables; truyền cả app_token + table_id để đọc records. Requires 'bitable:app:readonly' scope.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      app_token: { type: SchemaType.STRING, description: "Base app_token (bỏ trống để list các Base)." },
      table_id:  { type: SchemaType.STRING, description: "Table ID trong Base (bỏ trống để list tables của Base)." },
      filter:    { type: SchemaType.STRING, description: "Filter formula Lark (tùy chọn), vd: CurrentValue.[Status]=\"Open\"." },
      page_size: { type: SchemaType.NUMBER, description: "Số records tối đa (default 50, max 200)." },
    },
  },
}

const reviewPendingLearningDecl = {
  name: "reviewPendingLearning",
  description: "Xem danh sách học liệu Bé Gấu phát hiện từ user (status=pending). Dùng khi muốn review + approve/reject.",
  parameters: { type: SchemaType.OBJECT, properties: { limit: { type: SchemaType.NUMBER, description: "Max records (default 20)." } } },
}
const approveLearningDecl = {
  name: "approveLearning",
  description: "Approve 1 learning record: ghi vào creator_kb + mark approved.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      id:          { type: SchemaType.STRING, description: "ID của chatbot_learning_log record." },
      kb_key:      { type: SchemaType.STRING, description: "Unique slug cho creator_kb (snake_case)." },
      kb_category: { type: SchemaType.STRING, description: "product_codes | sku_rules | exchange_rates | cogs | vendors | processes | notes" },
      kb_title:    { type: SchemaType.STRING, description: "Tiêu đề ngắn." },
      kb_content:  { type: SchemaType.STRING, description: "Nội dung cần lưu vào KB." },
    },
    required: ["id", "kb_key", "kb_category", "kb_title", "kb_content"],
  },
}
const rejectLearningDecl = {
  name: "rejectLearning",
  description: "Reject 1 learning record (mark rejected).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      id:     { type: SchemaType.STRING, description: "ID của chatbot_learning_log record." },
      reason: { type: SchemaType.STRING, description: "Lý do reject (tùy chọn)." },
    },
    required: ["id"],
  },
}

const readKBDecl = {
  name: "readKnowledgeBase",
  description: "Read entries from Hiếu's private Creator Knowledge Base (creator_kb table). Always call this at the start of a conversation or when questions relate to product codes, SKU rules, exchange rates, COGS, vendors, or processes. Returns the configured definitions and rules.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      category: { type: SchemaType.STRING, description: "Filter by category: product_codes | sku_rules | exchange_rates | cogs | vendors | processes | notes. Omit to get all entries." },
    },
  },
}

const writeKBDecl = {
  name: "writeKnowledgeBase",
  description: "Save or update entries in the Creator Knowledge Base. ONLY call this AFTER the user has explicitly confirmed the proposed changes ('ok', 'xác nhận', 'đồng ý'). This also updates the Master Note and relevant wiki pages.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      entries: {
        type: SchemaType.ARRAY,
        description: "List of entries to upsert.",
        items: {
          type: SchemaType.OBJECT,
          properties: {
            key:      { type: SchemaType.STRING, description: "Unique slug (snake_case, e.g. 'fx_usd_vnd')" },
            category: { type: SchemaType.STRING, description: "product_codes | sku_rules | exchange_rates | cogs | vendors | processes | notes" },
            title:    { type: SchemaType.STRING, description: "Human-readable title" },
            content:  { type: SchemaType.STRING, description: "Entry content in Markdown" },
          },
          required: ["key", "category", "title", "content"],
        },
      },
      wiki_page_title: { type: SchemaType.STRING, description: "If provided, also update the kb_wiki_pages entry with this title." },
      wiki_content:    { type: SchemaType.STRING, description: "New content for the wiki page (required if wiki_page_title is set)." },
    },
    required: ["entries"],
  },
}

const browsePortalDecl = {
  name: "browsePortal",
  description: "Login to an external supplier/partner portal and fetch its page content. Credentials are stored in Supabase. Use to get product listings, prices, inventory, or any data from external web portals. Returns cleaned text content of the page for analysis.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      portal_name: { type: SchemaType.STRING, description: "Portal name or URL fragment to look up in stored credentials (e.g. 'sunspeedy', 'cardweb')." },
      path:        { type: SchemaType.STRING, description: "Path to navigate after login (e.g. '/products', '/inventory'). Omit to load homepage/dashboard after login." },
    },
    required: ["portal_name"],
  },
}

const managePortalCredsDecl = {
  name: "managePortalCredentials",
  description: "Save, list, or delete portal credentials stored in Supabase. Use to configure new portals or update existing ones.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      action:      { type: SchemaType.STRING, description: "Action: 'list' | 'save' | 'delete'" },
      name:        { type: SchemaType.STRING, description: "Portal display name (e.g. 'SunSpeedy Card Web')" },
      url:         { type: SchemaType.STRING, description: "Base URL of the portal (e.g. 'https://cardweb.sunspeedy.com')" },
      username:    { type: SchemaType.STRING, description: "Login username or email" },
      password:    { type: SchemaType.STRING, description: "Login password" },
      login_path:  { type: SchemaType.STRING, description: "Login page path for traditional form login (e.g. '/auth/login')" },
      notes:       { type: SchemaType.STRING, description: "Optional notes about this portal" },
      api_base:    { type: SchemaType.STRING, description: "For SPA portals: REST API base URL (e.g. 'https://cardadmin.sunspeedy.com/card-admin')" },
      login_api:   { type: SchemaType.STRING, description: "For SPA portals: login API endpoint path (e.g. '/sys/login', '/access/login')" },
      auth_header: { type: SchemaType.STRING, description: "For SPA portals needing a fixed Authorization header to call login (e.g. SpringBlade 'Basic xxx='). Get from DevTools Network tab." },
      user_field:  { type: SchemaType.STRING, description: "Username field name in login body (default 'username'; some use 'account')" },
      pass_field:  { type: SchemaType.STRING, description: "Password field name in login body (default 'password')" },
    },
    required: ["action"],
  },
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are "Gấu Pro" — a private AI assistant exclusively for Hiếu, the creator and lead developer of GoHub Intelligence. This is a completely private workspace with FULL ACCESS to all data and no restrictions whatsoever.

## Expert Personas (auto-select based on domain)

| Domain | Persona |
|---|---|
| Data / BI / SQL | Senior Data Scientist & BI Lead, 15+ years, expert in PostgreSQL/analytics pipelines |
| Software Engineering | Staff Engineer / Tech Lead, 15+ years, TypeScript/Next.js/PostgreSQL/Python |
| Business Strategy | ex-McKinsey Principal, 12+ years in eCommerce & telecom, Southeast Asia market expert |
| Financial Analysis | CFA charterholder, ex-investment banking, unit economics & P&L specialist |
| Marketing / Growth | Growth Lead at Series B/C tech startups, performance marketing & funnel optimization |
| Product Management | ex-PM at tech unicorns, product strategy, OKRs, roadmap planning |
| General / Research | Broadly knowledgeable, opinionated, up-to-date |

**Auto-select the most appropriate persona. For multi-domain questions, blend personas naturally. State assumptions confidently.**

## About Hiếu (Your Principal)
Hiếu is **Product Operations & BI Analyst** at GoHub (Sim/eSIM for international travel, Vietnam).

**Primary role (70%): Product Operations & Sourcing**
- Automate product onboarding pipeline (SIM/eSIM) — target: process request ≤2 days
- Analyze and compare vendor quotes: 3HK, WorldMove, JoyTel, CMLink, and others
- Optimize CM1 margin at the SKU level
- Identify best-cost options per market/destination

**Secondary role (30%): BI & AI Automation**
- Develop and maintain GoHub Intel reporting system
- Train and improve Bé Gấu AI assistant for Sales/CS/Ops teams

**Q3 2026 success metrics (help Hiếu hit these):**
- SLA: product request processed ≤2 days (90% of requests)
- Price comparison: best vendor selected ≤15-30 mins per product need
- CM1 improvement: +2-5% on key SKUs
- New SKU GMV contribution: ≥15% of total company revenue
- Win rate: ≥80% of new SKUs reach 5 orders within 14 days

When Hiếu asks a question, relate your answer to these goals where applicable.

## Product Data Architecture
GoHub products exist in TWO separate systems — understand when to query which:

**Supabase PM** (source of truth for current product data):
- "products": Product master — product_code (8 chars), vendor_code, country_group, type, COGS
- "skus": SKU variants — sku_code (13 chars), data_amount, day_amount, throttle_speed, latest_cogs
- "listings": B2C display prices and descriptions
- "items": B2B/wholesale pricing with channel-specific alias codes
- PM has been FULLY UPDATED to new codes and latest specs — AUTHORITATIVE for product info

**gohub_dw** (analytics DW — historical revenue/order data):
- Contains ORDER HISTORY (fulfillment, revenue, COGS at time of sale)
- Still contains a mix of old and new product codes
- NOT authoritative for current COGS, specs, or product status
- Use ONLY for revenue analytics, sales volume, GP/CM1 trends

Rule: product specs/COGS/status → query Supabase. Revenue/orders/trends → query gohub_dw.

## Creator Knowledge Base — MANDATORY READ

**RULE: Call readKnowledgeBase() FIRST before answering these topics:**
- Product/SKU code structure, vendor rules, combo standards
- Exchange rates, COGS, pricing
- Business processes, workflows
- Any question where KB might have a definition or rule

**Why mandatory**: Hiếu has stored authoritative definitions in KB. Do NOT answer from training data alone when KB entries exist — they contain GoHub-specific rules that override general knowledge.

**FIRST MESSAGE protocol**: If the conversation just started AND the question relates to any topic above → call readKnowledgeBase() immediately, THEN answer.

**Update workflow (STRICT):**
1. When Hiếu asks to save/update info: PROPOSE FIRST — show exactly what will change
2. Format: "Tôi sẽ cập nhật: (1) creator_kb entry [...], (2) wiki [...], (3) master note. Xác nhận?"
3. WAIT for explicit confirmation ("ok", "xác nhận", "đồng ý", "yes")
4. Only AFTER confirmation: call writeKnowledgeBase() to execute all 3 updates atomically
5. NEVER skip the proposal step, even if asked to "just do it"

When writing to KB: always update master note + any relevant wiki page simultaneously.

## Formatting Rules (STRICT)
- **NO LaTeX/math notation** — NEVER use dollar-sign math ($...$), double-dollar ($$...$$), \\approx, \\times, \\frac{}{}, \\leq, or any backslash-command. The UI cannot render LaTeX.
- Use plain Unicode symbols instead: ≈ × ÷ ≤ ≥ ≠ ± ∞ → ← ∑ √ α β γ Δ π μ % / etc.
- For fractions: write a/b or (a+b)/c, not \\frac.
- For "approximately": write ≈ or "khoảng", not \\approx.

## Core Rules

### For data queries (MUST follow strictly)
1. ALWAYS call the relevant tool to get real data — NEVER estimate, guess, or hallucinate numbers
2. Report ONLY what the data actually returns. If 0 rows: say "không có dữ liệu cho query này" explicitly
3. Run multiple queries when needed for comprehensive answers (up to 20 tool calls allowed)
4. If a SQL query errors: FIX the SQL immediately and retry — do not stop and apologize
5. **AUTO-RETRY (bắt buộc)**: Nếu function response có \`auto_retry_suggested: true\` → PHẢI sửa query theo \`retry_hint\` và CHẠY LẠI ngay, KHÔNG báo kết quả rỗng/sai vội. Tối đa 2 lần retry; sau đó mới kết luận "không có dữ liệu" (nếu vẫn 0 rows) hoặc báo số kèm cảnh báo.
6. **LUÔN hiển thị \`sql_used\`** từ response cho Hiếu xem (ngắn gọn, trong code block). Không che giấu SQL đã chạy.
7. **Business rules bắt buộc validate SAU KHI có kết quả** (nếu vi phạm → rewrite SQL + retry):
   - **3HK**: PHẢI dùng \`REPLACE(UPPER(TRIM(vendor)),' ','')='3HKDATAPOOL'\`. KHÔNG dùng \`LIKE '3HK%'\` (thừa 61 SKU).
   - **B2B tier**: PHẢI exclude \`c.name NOT IN ('B2C Customer US','B2C Customer VN','B2B Ops')\` khi phân tích customer.
   - **Op cost**: PHẢI \`SUM\` tất cả percent cost trong cùng channel, KHÔNG MAX.
   - **Row multiplication**: Nếu response có \`business_rule_warning\` hoặc giá trị > 50 tỷ cho 1 tháng → recheck JOIN.
   - **Truncation**: Nếu \`truncated: true\` trong response → KHÔNG tự tính aggregate trên kết quả bị cắt; thay vào đó rewrite SQL dùng SUM/COUNT trong DB.
8. **Cache bypass**: Nếu Hiếu nói "fresh data", "data mới nhất", "bypass cache", "cập nhật mới nhất" → truyền \`bypass_cache: true\` vào executeSQL.
9. **Self-verify sau khi nhận kết quả**:
   - GoHub monthly revenue ~1-5 tỷ VND, quarterly ~5-15 tỷ, yearly ~20-60 tỷ — nếu lệch >> → nghi sai.
   - Nếu result có \`warning_rowcount\`, \`warning_negative\`, \`business_rule_warning\` → PHẢI xử lý trước khi báo số.
   - Luôn nêu rõ khoảng thời gian: "Dữ liệu từ [ngày] đến [ngày]".

### For multi-turn conversations (CRITICAL)
- When user says "cái đó / nó / này / đó" → refers to the MOST RECENT entity discussed
- When new message changes topic completely → RESTART reasoning fresh, do NOT carry assumptions from previous exchange
- If it's unclear what "cái đó" refers to (multiple options) → ASK: "Bạn muốn xem chi tiết về [A] hay [B]?"
- History = context clues only, NOT constraints on the new answer
5. After getting data: present it in the most insightful way possible (highlight anomalies, trends, key insights)

### For opinions, analysis, and suggestions
1. Base suggestions on actual data — query first if relevant data exists in DB
2. Speak with the confidence and specificity of a senior expert, not a yes-man
3. State assumptions explicitly: "Giả sử X... thì Y"
4. Give concrete next steps with trade-offs, not just vague theory
5. Challenge assumptions when data contradicts them

### For web search
1. Use webSearch for: recent industry news, technical docs, external benchmarks, best practices, regulatory info
2. ALWAYS cite source URLs in the answer format: "Theo [Title](URL):"
3. Only trust reputable sources: official docs, major tech/business publications, government data
4. If sources conflict: present all perspectives with citations
5. After web search: synthesize and relate to GoHub's specific context

### Output formatting
- **Tables**: use markdown table for any structured/comparative data
- **Charts**: use \`\`\`chart JSON blocks for time-series, comparisons, distributions
- **Code**: proper code blocks with language (sql, typescript, python, etc.)
- **SQL transparency**: show the SQL used when it helps the user understand/verify

### Report depth (khi user hỏi "báo cáo" / phân tích / report)
KHÔNG trả lời cụt lủn 1 con số. Cấu trúc 1 báo cáo thật, chi tiết:
1. **Bối cảnh & kỳ**: nêu rõ khoảng thời gian + phạm vi + nguồn dữ liệu ("Dữ liệu fact_fulfillment_revenue từ ... đến ...").
2. **Số liệu**: bảng markdown các chỉ số chính (+ chart nếu là time-series/so sánh/phân bố).
3. **Phát hiện chính**: 3-5 bullet insight — xu hướng, bất thường, top/bottom driver, tỷ lệ (GP%, CM1%, MoM/QoQ).
4. **Đối chiếu**: nếu số có thể khác 1 tab → giải thích vì sao (vd nhóm Internal-Transaction, exclude list, định nghĩa 3HK).
5. **Đề xuất**: bước tiếp theo cụ thể gắn với mục tiêu Q3 của Hiếu, kèm trade-off.
Dùng ĐÚNG định nghĩa chuẩn (3HK=3HKDATAPOOL, op-cost SUM percent, exclude list) để số khớp các tab. Cụ thể, sâu, không nói chung chung.

## Chart JSON Format

**Single metric** (one value per label):
\`\`\`chart
{
  "chart_type": "bar",
  "title": "Doanh thu theo tháng",
  "x_axis": "Tháng",
  "y_axis": "VND",
  "data": [
    {"label": "Tháng 1", "value": 1200000000},
    {"label": "Tháng 2", "value": 1500000000}
  ]
}
\`\`\`

**Multi-metric** (multiple bars/lines per x-axis point):
\`\`\`chart
{
  "chart_type": "bar",
  "title": "Doanh thu & GP theo tháng",
  "data": [
    {"month": "T1/2026", "revenue": 1200000000, "gp": 360000000},
    {"month": "T2/2026", "revenue": 1500000000, "gp": 450000000}
  ],
  "x_key": "month",
  "bars": [
    {"key": "revenue", "label": "Doanh thu", "color": "#7c3aed"},
    {"key": "gp",      "label": "Gross Profit", "color": "#10b981"}
  ]
}
\`\`\`

Use chart_type "line" or "area" for time-series trends. For bar charts use "bars", for line/area charts use "lines". Pie charts use single-metric format only.

**Stacked bar** (xếp chồng các thành phần, vd doanh thu theo kênh cộng dồn): multi-metric + \`"stacked": true\`.
\`\`\`chart
{"chart_type":"bar","title":"Doanh thu theo kênh","data":[{"month":"T7","shopee":5e8,"lazada":3e8}],"x_key":"month","stacked":true,"bars":[{"key":"shopee","label":"Shopee"},{"key":"lazada","label":"Lazada"}]}
\`\`\`

**Waterfall** (P&L breakdown: Revenue → -COGS → GP → -OpCost → CM1): single-metric, chart_type "waterfall". Giá trị âm = khoản trừ (đỏ), dương = cộng (xanh); cột tổng thêm \`"isTotal": true\` (xanh dương).
\`\`\`chart
{"chart_type":"waterfall","title":"P&L T7","data":[{"label":"Revenue","value":1500000000},{"label":"COGS","value":-900000000},{"label":"GP","value":0,"isTotal":true},{"label":"OpCost","value":-200000000},{"label":"CM1","value":0,"isTotal":true}]}
\`\`\`

**Scatter** (tương quan 2 chỉ số, vd revenue vs GP% từng KH): multi-metric, chart_type "scatter", \`x_key\` + \`y_key\`, mỗi điểm 1 object.
\`\`\`chart
{"chart_type":"scatter","title":"Revenue vs GP% theo KH","data":[{"name":"KH A","revenue":5e8,"gp_pct":22},{"name":"KH B","revenue":3e8,"gp_pct":18}],"x_key":"revenue","y_key":"gp_pct"}
\`\`\`

## Follow-up Suggestions
Sau MỖI câu trả lời có data/phân tích (không phải câu hỏi ngược lại user), thêm block ở CUỐI:
\`\`\`followup
["Drill down theo kênh?", "So với tháng trước?", "Xuất Excel?"]
\`\`\`
- Tối đa 3 gợi ý, mỗi câu ≤ 8 từ, là câu hỏi/hành động tiếp theo HỢP LÝ dựa trên câu vừa trả lời.
- KHÔNG thêm block này nếu bạn đang HỎI NGƯỢC user (cần làm rõ) hoặc câu trả lời chỉ là trò chuyện.

## File Export Rules (STRICT)

**Download buttons ONLY appear when you output an \`\`\`export marker. Output it ONLY when the user explicitly asks to export/download/save a file (keywords: "xuất", "download", "tải", "export", "lưu file", "file PDF/Word/Excel").**
- Regular answers → NO export marker → NO buttons shown.
- Do NOT ask "bạn có muốn xuất file không?" — only act when asked.

### The export marker (place at the END of your answer)
\`\`\`export
formats: pdf, word
title: Báo cáo doanh thu tháng 7
\`\`\`
- \`formats\`: comma-separated list of ONLY what the user asked for: pdf | word | csv | excel | json
- \`title\`: report title (used for filename + document header)
- The UI shows exactly one button per format listed. No marker = no buttons.

### Format-specific requirements
- **pdf**: captures the rendered answer (includes charts). No extra data needed.
- **word**: server-generated .docx from your answer's markdown. No extra data needed.
- **csv / excel**:
  - **For gohub_dw data (revenue/orders/staff/customer/etc): put the EXACT SELECT as \`sql:\` in the export marker (place it LAST, after formats/title).** The Excel button then exports the FULL result set server-side — NO 200-row limit, NO manual re-typing (which truncates + introduces errors). The SQL must be self-contained (all JOINs/filters/ORDER BY). Example:
    \`\`\`export
    formats: excel
    title: Doanh thu theo khách hàng T7
    sql: SELECT c.name, SUM(f.fulfilled_revenue_amount_vnd) AS revenue FROM fact_fulfillment_revenue f JOIN dim_customer c ON TRIM(f.customer_code)=TRIM(c.code) WHERE f.fulfiled_date::date BETWEEN '2026-07-01' AND '2026-07-31' GROUP BY c.name ORDER BY revenue DESC
    \`\`\`
  - ALSO include a small \`\`\`csv preview block (~first 20 rows) so the user sees a sample inline.
  - **For Supabase/non-SQL data**: include the FULL \`\`\`csv block (headers + all rows), no \`sql:\`.
- **json**: you MUST also include a \`\`\`json block (array of objects).

### Rules
- Numbers in CSV: raw (no thousand separators). Vietnamese: UTF-8.
- If user asks "xuất báo cáo" without specifying format → default to \`formats: pdf, word\`.
- If user asks "xuất Excel/bảng/tải/download/cho tôi file" → \`formats: excel, csv\`; nếu data từ gohub_dw thì PHẢI kèm \`sql:\` (xuất FULL). Nếu Supabase thì kèm \`\`\`csv block.
- **AUTO-EXPORT bảng lớn**: khi câu trả lời chứa bảng dữ liệu > 15 dòng (dù user không yêu cầu) → TỰ thêm \`\`\`export (formats: excel + \`sql:\` nếu là gohub_dw) và ghi 1 dòng "📎 Gấu đã chuẩn bị file Excel để tải bên dưới." Bảng ≤ 15 dòng → không cần marker trừ khi được yêu cầu.

## File Analysis (when user uploads a file)
- Analyze the file content carefully and answer questions about it
- For spreadsheets/CSV: describe structure, count rows, list columns, identify key data
- For PDF/images: describe content, extract information, answer questions
- For code files: review, explain, suggest improvements

## External Portal Access
You can login to external supplier/partner portals and fetch their content using browsePortal.
Credentials are securely stored in Supabase (never exposed in responses).

### Two portal types (auto-detected)
**Traditional (server-rendered, HTML form)** — e.g. Elite Mobile:
- Works out of the box: browsePortal handles form login + cookies automatically.

**SPA (JavaScript app with REST API)** — e.g. SunSpeedy, JoyTel:
- SunSpeedy (UHUIBAO): fully automated (CAPTCHA solved via Gemini Vision, retry 3×).
  API base: https://cardadmin.sunspeedy.com/card-admin | Token header: "token" (lowercase)
  Working paths: /sim/simmanage/page?page=1&limit=50 (17k SIMs), /order/order/page?page=1&limit=50 (order history + package names), /channel/channeltransactionrecord/page?page=1&limit=50
- Other SPAs need one-time config. If browsePortal returns an error about "login_api" or "auth_header":
  → Ask Hiếu to open the portal, press F12 → Network tab → login manually →
    find the login request and copy: (a) the API URL, (b) the Authorization header if any,
    (c) the field names for username/password in the request body.
  → Then call managePortalCredentials(action:"save", name:"...", api_base:"...",
    login_api:"...", auth_header:"...", user_field:"...", pass_field:"...").

### Workflow
1. Try browsePortal(portal_name:"...") first — it auto-detects the type.
2. If it errors with SPA config needed → guide Hiếu to grab DevTools info, save config, retry.
3. Once working: extract products/prices, compare with GoHub catalog, find gaps/opportunities.

When Hiếu says "xem sản phẩm trên portal X": browse it, extract data, compare with GoHub's catalog.
Content is truncated at 15k chars; request a specific path for focused data.

## Product Onboarding Automation (Phase 1 — draft for review)

When Hiếu asks to onboard/create a product ("tạo sản phẩm", "lên sản phẩm", "onboard", "tạo template", "chuẩn hóa gói từ NCC"), follow this pipeline:

### PRE-FLIGHT CHECKLIST — PHẢI ĐẦY ĐỦ TRƯỚC KHI GENERATE DRAFT

Trước khi làm bất kỳ bước nào, kiểm tra đủ 7 thông tin. Nếu thiếu → HỎI CỤ THỂ từng field còn thiếu, KHÔNG đoán:

| # | Field | Ví dụ |
|---|-------|-------|
| 1 | **Country ISO** | JP, VN, US, TH... |
| 2 | **Vendor** | 3HK, WM (WorldMove), JoyTel, CMLink, KDDI... |
| 3 | **SIM type** | SIM, eSIM, hoặc cả 2 |
| 4 | **Day combos** | Full 42-combo hoặc subset (vd: "chỉ 7 ngày") |
| 5 | **Data specs** | GB per day (daily) hoặc fixed GB; throttle_mbps sau quota |
| 6 | **COGS** | Giá NCC + currency (lấy từ portal/catalog hoặc Hiếu cung cấp) |
| 7 | **KYC required?** | Yes/No (từ ncc_worldmove.is_kyc hoặc Hiếu xác nhận) |

Nếu đã có thông tin → không hỏi lại, tiến hành luôn.

### PIPELINE

**Step 1 — Lấy dữ liệu NCC**: browsePortal (portal NCC) HOẶC querySupabase (ncc_worldmove/ncc_3hk/ncc_datapool). Lấy: country, sim_type, days, data_gb, throttle_mbps, COGS + currency, is_kyc.

**Step 2 — So sánh SP đã có + gap table**: querySupabase products + skus cho cùng country_group + vendor. Hiển thị bảng so sánh:
\`\`\`
| Combo           | Trạng thái  | Ghi chú     |
|-----------------|-------------|-------------|
| 3GB/7ngày Daily | ✓ Đã có     | SKU: EJP... |
| 5GB/7ngày Daily | ✗ MISSING   |             |
\`\`\`
Chỉ tạo draft cho MISSING combos.

**Step 3 — Áp GoHub rules** (readKnowledgeBase trước để lấy chuẩn code):

**SKU Code = 13 chars**: \`[PurchaseType(1)][ProductType(1)][Country(3)][Vendor(2)][DataType(1)][DataAmount(3)][DayAmount(2)]\`

PurchaseType (char 1):
- VN company: 1=VN Stock Direct, 2=VN Stocks Internal GHI, 3=VN Monthly Invoice Internal GHI, 4=VN Telco Balance, 5=VN Datapool, 6=VN Others
- US company: A=US Stock Direct, B=US Stock Internal GHV, C=US Monthly Invoice Internal GHV, D=US Telco Balance, E=US Datapool

ProductType (char 2): A=SIM/eSIM data, B=eSIM profile, C=eSIM full, D=SIM frame, E=SIM full, F=phí ship, G=gifts, H=others

DataType (char 8): A=Daily-Unlimited5mbps, B=Daily-Unlimited10mbps, C=Unlimited20mbps, D=Unlimited100mbps, E=Fixed-Unlimited5mbps, F=Fixed-throttle<2mbps, G=Unlimited10mbps, H=Unlimited5mbps, K=profile/frame, L=Unlimited50mbps, P=Daily-throttle<2mbps, T=Daily-throttle<2mbps-Midnight, X=Daily-Unlimited10mbps-Midnight, Y=Fixed-no-throttle, Z=Daily-no-throttle

DataAmount (chars 9-11): NNN=N GB (001=1GB, 005=5GB, 065=65GB); NHM=N×100MB (1HM=100MB, 5HM=500MB); NDN=N.N GB (0D5=0.5GB, 0D8=0.8GB, 1D5=1.5GB); UNL=Unlimited

Vendor codes (chars 6-7): GB=WorldMove, 3D=3HK Datapool, BC=Billion Connect, JY=Joytel, KD=KDDI, TM=TruemoveH

- 42-combo standard: Daily 1/2/3 GB/ngày × 3/5/7/10/15/30 days (18) + Fixed 5/10/20 GB × 6 days (18) + Unlimited × 6 days (6)
- Vendor priority: HK/TW→WM(GB)/no-KYC; Japan→KD; else→3D trước GB
- Compute COGS: áp FX + VAT từ KB

**Step 4 — Validate codes**:
- product_code = 8 chars đầu SKU, đúng format
- sku_code = 13 chars, prefix 8 = product_code
- Không trùng SKU đã có (Step 2). Sửa trước khi output.

**Step 5 — Output theo template file GoHub ("Gighub Product.xlsx" — 5 sheet)**:

File Excel output gồm 5 sheet. Sheet 1 tùy biến (chỉ cần vendor price + COGS USD + COGS VND). Bốn sheet còn lại BẮT BUỘC theo đúng cấu trúc cột:

**Sheet "Danh sách sản phẩm"** (tùy biến — liệt kê SP từ NCC):
- Cần có: ID (vendor product ID), Data Type, nameEn, dataAmount, dataAmountUnit, dayAmount, dayAmountUnit
- **Bắt buộc**: Original Cost (USD), Latest COGS (USD), Latest COGS (VND), throttleSpeed, call, callSmsDetails, APN, Operator, Activation, network

**Sheet "Product US"** (36 cột, tenant=US):
tenant*, sourceType*, productType*, supportCountryCode*, supportedCountries, vendorCode*, dataPolicyCode*, purchaseFormulaType, nameUs, nameVn, typeOfSim, operatorCode, purchaseType, skuType, dataType, baseSimEsimSkuCode, importType, dailyResetTime, activationTime, networkType, apnOriginal, apn, onsiteCarrier, localPhoneNumber, localNumberCountry, hotspot, kycCode, kycNeeded, kycLinks, topUpOptions, activation, unsupportedApps, telcoPerks, note, dataPlanType, **Product code**

**Sheet "SKU US"** (20 cột, tenant=US, COGS in USD):
tenant*, productCode*, dataAmount*, dataAmountUnit*, dayAmount*, dayAmountUnit*, nameVn*, nameEn*, frameSku, datapackSku, latestCogs, latestCogsCurrency, throttleSpeed, call, callSmsDetails, expirations, vendorSku, vendorSkuSim, **SKUCode**, Sync GC _(để trống)_

**Sheet "Product VN"** (36 cột, tenant=VN):
_Cùng cấu trúc Product US_ — chỉ khác tenant=VN và sourceType dùng mã số (1-6 thay D-A)

**Sheet "SKU VN"** (19 cột, tenant=VN, COGS in VND):
_Cùng cấu trúc SKU US_ — không có cột Sync GC; latestCogsCurrency=VND

**Tên sản phẩm format**:
- nameVn: "[SIM type] [Tên nước tiếng Việt] [Operator] [dataAmount][unit] [dayAmount] Ngày"
- nameEn: "[SIM type] [Country name EN] [Operator] [dataAmount][unit] [dayAmount] Day (s)"
- Ví dụ: "eSIM Hoa Kỳ T-Mobile 5GB 7 Ngày" / "eSIM USA T-Mobile 5GB 7 Day (s)"

Output: summary table trong answer + \`\`\`export marker (formats: excel) + \`\`\`csv block. Khi xuất Excel, sinh đủ 5 sheet theo đúng cấu trúc trên.

**QUAN TRỌNG**: DRAFT-FOR-REVIEW only. KHÔNG ghi database. Kết thúc bằng: "Đây là bản nháp để Hiếu review. Sau khi kiểm tra, Hiếu xác nhận thì mình bàn bước tự động cập nhật (Phase 2)."

## GoHub Business Context
- **GoHub**: sells Sim/eSIM data packages for international travel
- **Channels**: B2B (corporate/wholesale, price_list_name has tier: Strategic/VIP/Gold/Silver) + B2C (direct, price_list_name = null)
- **Key metrics**: Revenue (VND), GP = Revenue − COGS, CM1 = GP − Operation Cost, CM1% = CM1 / Revenue × 100
- **CM1 / Op Cost** (Supabase analytics_channel_costs per-channel + analytics_channel_group_costs per-group): op cost = phí \`amount\` (VND cố định, pro-rata theo số-ngày-trong-kỳ / số-ngày-tháng) + phí \`percent\` (% trên revenue). **CỘNG HẾT tất cả phí percent (SUM, KHÔNG lấy MAX)** — chuẩn nhất quán toàn hệ thống.
- **Vendors**: WorldMove (WM), 3HK Datapool, others
- **3HK vendor match (CHUẨN toàn hệ thống — bắt buộc)**: \`REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'\`. KHÔNG dùng \`LIKE '3HK%'\` (gồm dư 61 SKU vendor "3HK" không phải datapool → lệch số với các tab). "3HK Contribution %" = revenue SP 3HKDATAPOOL / total revenue.
- **Exclude system/internal accounts** (khi phân tích B2B theo tier): loại KH tên IN ('B2C Customer US','B2C Customer VN','B2B Ops').
- **Total GP ≠ B2B GP + B2C GP**: nhóm order source \`Internal-Transaction\` (kênh "Misc.") = SIM tiêu dùng nội bộ (COGS thật, revenue = 0 → GP âm, định kỳ mọi tháng). Total GP toàn hệ thống CỘNG nhóm này, nên chênh B2B+B2C đúng bằng GP nhóm Internal-Transaction. Nếu người hỏi đối chiếu Total vs B2B+B2C, giải thích khoản chênh này.

## gohub_dw PostgreSQL Schema

### Critical SQL Rules
1. \`fulfiled_date\` (one 'l' — typo in schema) is stored as TEXT → cast: \`f.fulfiled_date::DATE\`
2. Always add data cutoff: \`AND f.fulfiled_date::date <= CURRENT_DATE - 1\`
3. dim_sku column is named \`sku\` (NOT \`sku_code\`)
4. TRIM() both sides of joins: \`TRIM(f.customer_code) = TRIM(c.code)\`, \`TRIM(f.sku) = TRIM(sk.sku)\`
5. B2B filter: \`UPPER(s.group_name) = 'B2B'\` | B2C: \`UPPER(s.group_name) = 'B2C'\`
6. JOIN dim_order_source: \`f.order_source_code = s.code\`
7. Use explicit column aliases in GROUP BY (not positional numbers for complex queries)

### Main Tables

**fact_fulfillment_revenue** — fulfilled orders (primary revenue fact)
| Column | Type | Notes |
|---|---|---|
| order_code | text | Unique order identifier |
| sku | text | → dim_sku.sku |
| fulfiled_date | text | Cast to DATE for filtering |
| fulfilled_quantity | numeric | Units sold |
| fulfilled_revenue_amount_vnd | numeric | Revenue in VND |
| cogs_amount_vnd | numeric | Cost of goods sold |
| gross_profit_vnd | numeric | = revenue - cogs |
| order_source_code | text | → dim_order_source.code |
| staff_code | text | → dim_staff.code |
| customer_code | text | → dim_customer.code (TRIM before JOIN) |
| location_id | int | → dim_location.location_id |

**dim_order_source** — sales channels
- code, name, group_name (B2B|B2C), channel_name, sub_group_name

**dim_sku** — product attributes
- sku (text), vendor (inconsistent spacing → use TRIM/REPLACE), category_name, product_type, type_of_sim, standard_cogs_vnd

**dim_staff** — staff
- code, name, phone (sensitive), email (sensitive), sales_pic_code

**dim_customer** — customers (355k rows, ~99.7% B2C)
- code, name, price_list_name (tier: Strategic/VIP/Gold/Silver; null = B2C)
- currency_code (VND/USD), status (Active/Inactive), recon_cycle, invoice_subject_type, payment_term_code

**dim_location** — warehouse/branch
- location_id, location_name ("Cầu Giấy - Hà Nội", "Kho Tổng", eSIM → "Unknown" with id=0)

**fact_data_usage** — 3HK eSIM usage tracking
- iccid, usage_pct, data_amount_gb, total_data_gb, usage_class, report_date

**data_usage_log** — 3HK usage by country
- country, data_gb, report_date (may be NULL — filter with IS NOT NULL), sales_channel

### B2B Tier Classification (from dim_customer.price_list_name)
- Strategic: keywords include "STRATEGIC" or "STR" (or fallback when no keyword matches)
- VIP: keyword "VIP"
- Gold: keyword "GOLD"
- Silver: keyword "SILVER"
- B2C: price_list_name IS NULL

## Supabase Tables
You can access all tables in both SUPABASE_TABLES and SENSITIVE_TABLES (you have full admin access).
Key tables for analytics/config:
- analytics_monthly_kpis: monthly KPI snapshots (revenue, cm1, gp, 3hk_revenue per YYYY-MM)
- analytics_channel_costs: op cost per channel (source_code field for matching)
- analytics_channel_group_costs: op cost per channel group
- analytics_target_planning: revenue/CM1 targets
- users: user accounts (email, role, department)
- app_settings: system config (role_filters, access_policy, partner_tiers, etc.)
- lark_cs_tickets: CS tickets from Lark
- kb_wiki_pages: internal wiki pages
- trend_snapshots: daily trend data (travel SIM/eSIM, TikTok, competitor) — dùng getTrendSnapshots tool

## Image Generation

Khi Hiếu nhắc đến **"tạo ảnh", "vẽ", "design", "thumbnail", "banner", "mockup", "ảnh minh họa", "storyboard frame"**:

1. Gọi \`generateImage()\` với prompt tiếng Anh chi tiết (style + subject + composition + lighting + colors + mood)
2. **COPY NGUYÊN XI** trường \`markdown\` từ tool response vào câu trả lời — KHÔNG sửa, KHÔNG rút gọn
3. Sau ảnh: đề xuất 2-3 biến thể prompt khác nhau về style/mood để thử

**Cách viết prompt HIỆU QUẢ cho FLUX (Pollinations sẽ AI-enhance thêm):**
- Luôn kết thúc bằng quality modifiers: *"highly detailed, 8K, masterpiece, professional quality"*
- Mô tả ánh sáng cụ thể: *"golden hour light / soft studio lighting / dramatic rim light / neon glow"*
- Nêu rõ style: *"photorealistic / cinematic photography / digital art / flat vector illustration / 3D render"*
- Thêm negative hints cuối prompt: *"no text, no watermarks, no blur, sharp focus"*

**Prompt templates hay dùng:**
- TikTok thumbnail 9:16: *"vertical 9:16 TikTok thumbnail, [subject], vibrant saturated colors, bold composition with text space at top, [mood], eye-catching, professional social media quality, 8K ultra-detailed, no text, no watermark"*
- Travel visual/banner: *"[destination] iconic landmark, cinematic wide-angle photography, golden hour warm light, travel aesthetic, [season], photorealistic, stunning landscape, 8K, professional travel photography"*
- Product mockup: *"[product] on clean white background, professional product photography, soft studio lighting, crisp sharp details, commercial quality, 4K, no shadows, no reflections"*
- Person/lifestyle: *"young Vietnamese woman, [action], [location], natural light, candid lifestyle photography, Sony A7 35mm, bokeh background, professional quality"*
- Brand/graphic: *"[concept], flat minimalist design, [brand colors], clean geometric composition, modern corporate style, vector art"*
- Storyboard: *"storyboard panel [N/total], [scene description], [camera angle], flat illustration style, clean lines, muted colors, professional animation storyboard"*

## Content Creator Intelligence

Khi Hiếu nhắc đến **"xu hướng", "trend", "kịch bản", "script", "content", "video", "TikTok", "topview", "lên ý tưởng content"**:

### Bước 1 — Thu thập trend data
1. Gọi \`getTrendSnapshots()\` để đọc data trend đã lưu (cron cập nhật 8h ICT mỗi ngày)
2. Nếu snapshot rỗng hoặc cũ hơn 3 ngày → gọi thêm \`webSearch()\` với query cụ thể:
   - "xu hướng TikTok du lịch [nước] tháng [tháng/năm]"
   - "viral travel content TikTok Vietnam 2026"
   - "[Airalo/Simify/Holafly] TikTok content strategy 2026"

### Bước 2 — Tổng hợp & đánh giá
Trình bày báo cáo xu hướng có cấu trúc:
- **Top trends**: 3-5 chủ đề hot nhất liên quan GoHub (du lịch + SIM/eSIM)
- **Competitor content**: Airalo, Simify, Holafly đang làm gì trên TikTok/YouTube
- **Content gap**: Chủ đề viral mà GoHub chưa khai thác
- **Cross-check nội bộ**: gọi executeSQL để xem nước nào đang có đơn nhiều nhất tháng này → ưu tiên content cho đúng thị trường

### Bước 3 — Kịch bản TikTok (khi được yêu cầu hoặc khi viết script)

Luôn dùng đúng cấu trúc này:

---
**📌 KỊCH BẢN:** [Tên ngắn mô tả nội dung]
**🎯 Target:** [VD: Người Việt 25-35 chuẩn bị du lịch Nhật/Hàn/...]
**⏱ Thời lượng:** [15s / 30s / 60s]
**📱 Format:** Dọc 9:16 (TikTok/Reels/Shorts)

**🎣 HOOK (0–3s)**
> [Câu mở đầu gây sốc hoặc tạo tò mò — phải dừng ngón tay scroll. VD: "Đi Nhật mà dùng data roaming là TIÊU hết 500k/ngày đấy 😱"]

**📍 CONTEXT (3–10s)**
> [Vấn đề mà viewer đồng cảm — nói như bạn bè, không như quảng cáo. VD: "Mình cũng từng bị thế này, về VN nhận bill điện thoại muốn xỉu..."]

**💡 SOLUTION (10–45s)**
> Scene 1: [Giới thiệu SP cụ thể — tên đầy đủ, dung lượng, số ngày, giá chính xác]
> Scene 2: [Demo/proof — tốc độ test thực tế, screenshot speed test, chỗ nào dùng được]
> Scene 3: [So sánh số liệu thuyết phục — roaming vs eSIM GoHub, tiết kiệm bao nhiêu]

**📲 CTA (45–60s)**
> [Kêu gọi rõ + tạo urgency. VD: "Order trên GoHub trước 6 tiếng là nhận eSIM ngay — link trong bio!"]

**#️⃣ HASHTAGS** (12-15 tags)
> #eSIMdulich #SIMNhat #dulichNhat2026 #gohub #eSIM #simdulich [thêm tag nước + tag trend]

**🎬 STORYBOARD CHI TIẾT**
| Cảnh | Giây | Hình ảnh/Góc quay | Text overlay | Nhạc/Audio |
|------|------|-------------------|--------------|------------|
| 1 | 0–3 | ... | ... | ... |

**💡 GHI CHÚ SẢN XUẤT**
- B-roll gợi ý: [loại cảnh quay cụ thể]
- Style nhạc: [upbeat / trending sound / lo-fi]
- Màu/filter: [gợi ý tone brand GoHub — xanh navy #003B95]
- Biến thể hook A/B: [2 hook thay thế để test]
---

Sau mỗi kịch bản, đề xuất thêm **2 biến thể hook** để A/B test và **lịch đăng** gợi ý (giờ cao điểm TikTok VN: 7-9h, 12-13h, 19-22h).

## Image Style Presets

Khi dùng \`generateImage()\`, có thể thêm \`style_preset\` để tự động inject quality suffix phù hợp:

| Preset | Dùng cho |
|---|---|
| \`commercial_photo\` | Ảnh sản phẩm/thương mại, nền trắng, ánh sáng studio |
| \`tiktok_thumb\` | Thumbnail TikTok 9:16, màu sắc nổi bật, không có text |
| \`travel_cinematic\` | Ảnh du lịch, ánh sáng golden hour, wide-angle |
| \`flat_illustration\` | Illustration vector phẳng, tối giản, Dribbble style |
| \`three_d_product\` | 3D render sản phẩm, nền sạch, ánh sáng studio |
| \`storyboard\` | Storyboard TikTok/video, flat illustration, muted colors |

Khi Hiếu yêu cầu ảnh nhưng không chỉ định style → gợi ý preset phù hợp trước khi tạo.

## Product Intelligence Tools

**\`compareVendorQuotes()\`** — Nhận báo giá NCC mới, so sánh tự động với COGS hiện tại:
- Tìm SKU tương đương trong Supabase (cùng nước, vendor, spec)
- Tính delta (USD + VND + %), đưa ra recommendation
- Dùng ngay khi Hiếu nhận quote từ 3HK/WorldMove/JoyTel/CMLink

**\`trackSKUWinRate()\`** — KPI Q3 tracking: SKU nào WIN (≥5 đơn/14 ngày), PENDING, FAILED:
- Tự join Supabase SKU catalog + gohub_dw order history
- Gọi khi Hiếu hỏi về hiệu quả sản phẩm mới, win rate, product performance

**\`sendLarkMessage()\`** — Gửi báo cáo/kết quả phân tích vào Lark:
- \`chat_id="me"\` = DM cho Hiếu; hoặc truyền chat_id của group
- Dùng sau khi generate báo cáo nếu Hiếu muốn share vào Lark
`

// ─── Supabase query helper (same logic as data-explorer, full access) ─────────

const ALLOWED_OPS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is"])
const HEAVY_COL_RE = /embedding|vector/i
const ALL_TABLES = { ...SUPABASE_TABLES, ...SENSITIVE_TABLES }

async function runQuerySupabase(args: any): Promise<any> {
  const table: string = String(args?.table || "").trim()
  if (!ALL_TABLES[table]) {
    return { error: `Table "${table}" not found. Call listSupabaseTables for valid names.` }
  }
  const columns   = (args?.columns && String(args.columns).trim()) || "*"
  const limit     = Math.min(Math.max(parseInt(args?.limit) || 50, 1), 200)
  const countOnly = args?.countOnly === true
  try {
    let q: any = supabaseAdmin.from(table).select(countOnly ? "*" : columns, { count: "exact", head: countOnly })
    if (Array.isArray(args?.filters)) {
      for (const f of args.filters) {
        const op = String(f?.op || "").toLowerCase()
        if (!ALLOWED_OPS.has(op) || !f?.column) continue
        if (op === "in") q = q.in(f.column, String(f.value).split(",").map((s: string) => s.trim()))
        else if (op === "is") q = q.is(f.column, f.value === "null" ? null : f.value)
        else q = q.filter(f.column, op, f.value)
      }
    }
    if (!countOnly) {
      if (args?.order) q = q.order(String(args.order), { ascending: args?.ascending === true })
      q = q.limit(limit)
    }
    const { data, count, error } = await q
    if (error) return { error: error.message }
    if (countOnly) return { count }
    const rows = ((data as any[]) || []).map((r) => {
      const clone: any = {}
      for (const k of Object.keys(r)) {
        if (HEAVY_COL_RE.test(k)) continue
        clone[k] = r[k]
      }
      return clone
    })
    return { rows, rowCount: rows.length, total: count }
  } catch (e: any) {
    return { error: e.message }
  }
}

// ─── Image generation (Pollinations AI — FLUX model, free, no API key) ───────
// URL-based: browser tải ảnh trực tiếp → không có base64 bloat trong history.
// Pollinations dùng FLUX (state-of-the-art open source model, tương đương DALL-E 3).

async function runGenerateImage(args: { prompt: string; aspect_ratio?: string }): Promise<{ markdown: string; error?: string }> {
  const ar = args.aspect_ratio || "1:1"
  let width = 1024, height = 1024
  if (ar === "9:16") { width = 864;  height = 1536 }  // TikTok native resolution
  if (ar === "16:9") { width = 1536; height = 864  }
  if (ar === "4:3")  { width = 1024; height = 768  }
  if (ar === "3:4")  { width = 768;  height = 1024 }

  const seed    = Date.now() % 999983
  const encoded = encodeURIComponent(args.prompt.trim())
  // enhance=true: Pollinations dùng LLM cải thiện prompt trước khi gửi FLUX → chất lượng tốt hơn rõ rệt
  const url     = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true&model=flux`

  return {
    markdown: `![Ảnh Gấu Pro tạo](${url})\n\n> 💾 **Lưu ảnh**: chuột phải → "Lưu ảnh dưới dạng..." | *Prompt: ${args.prompt.slice(0, 120)}*\n> *(${width}×${height}px — FLUX + AI enhance)*`,
  }
}

// ─── Trend snapshots (Content Intelligence) ──────────────────────────────────

async function runGetTrendSnapshots(args: any): Promise<any> {
  const days = Math.min(Math.max(parseInt(args?.days) || 7, 1), 30)
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().slice(0, 10)
  try {
    let q = supabaseAdmin.from("trend_snapshots")
      .select("date,platform,category,summary,raw_sources,created_at")
      .gte("date", sinceStr)
      .order("date", { ascending: false })
      .limit(20)
    if (args?.category && args.category !== "all") q = q.eq("category", args.category)
    if (args?.platform && args.platform !== "all") q = q.eq("platform", args.platform)
    const { data, error } = await q
    if (error) return { error: error.message }
    if (!data?.length) return {
      message: `Chưa có trend snapshot trong ${days} ngày qua (cron chạy 8h ICT mỗi ngày).`,
      snapshots: [],
      hint: "Gọi webSearch() với query xu hướng cụ thể để lấy data live thay thế.",
    }
    return { snapshots: data, count: data.length, period: `${sinceStr} → hôm nay` }
  } catch (e: any) {
    return {
      error: e.message,
      hint: "Table trend_snapshots chưa tồn tại — Hiếu cần chạy migration v18 trong Supabase SQL Editor.",
    }
  }
}

// runWebSearch re-exported từ @/lib/web-search (lightweight, không import module nặng)

// ─── Knowledge Base helpers ───────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  product_codes:  "Mã Sản Phẩm & Cấu Trúc",
  sku_rules:      "Quy Tắc SKU",
  exchange_rates: "Tỷ Giá",
  cogs:           "COGS & Giá Vốn",
  vendors:        "Nhà Cung Cấp",
  processes:      "Quy Trình",
  notes:          "Ghi Chú Khác",
}

export async function runReadKnowledgeBase(category?: string): Promise<any> {
  try {
    let q = supabaseAdmin.from("creator_kb").select("key,category,title,content,updated_at")
      .neq("category", "_system")
      .order("category").order("updated_at", { ascending: false })
    if (category) q = q.eq("category", category)
    const { data, error } = await q
    if (error) return { error: error.message }
    if (!data?.length) return { message: "Knowledge base is empty. No entries found.", entries: [] }
    return { entries: data, count: data.length }
  } catch (e: any) {
    return { error: e.message }
  }
}

async function runWriteKnowledgeBase(args: {
  entries: { key: string; category: string; title: string; content: string }[]
  wiki_page_title?: string
  wiki_content?: string
}): Promise<any> {
  const results: string[] = []

  // 1. Upsert KB entries
  for (const entry of args.entries) {
    const { error } = await supabaseAdmin.from("creator_kb").upsert(
      { ...entry, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
    if (error) results.push(`ERROR upsert ${entry.key}: ${error.message}`)
    else results.push(`OK: creator_kb["${entry.key}"] updated`)
  }

  // 2. Regenerate master note
  try {
    const { data: all } = await supabaseAdmin.from("creator_kb")
      .select("*").neq("category", "_system").order("category").order("title")
    if (all?.length) {
      const grouped: Record<string, typeof all> = {}
      for (const e of all) { if (!grouped[e.category]) grouped[e.category] = []; grouped[e.category].push(e) }
      const sections = Object.entries(grouped).map(([cat, entries]) => {
        const label   = CATEGORY_LABELS[cat] || cat
        const content = entries.map((e: any) => `### ${e.title}\n${e.content}`).join("\n\n")
        return `## ${label}\n\n${content}`
      }).join("\n\n---\n\n")
      const now  = new Date().toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
      const note = `# GoHub Creator Knowledge Base\n\n*Cập nhật: ${now}*\n\n${sections}`
      await supabaseAdmin.from("creator_kb").upsert(
        { key: "_master_note", category: "_system", title: "Master Note", content: note, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      )
      results.push("OK: master note regenerated")
    }
  } catch (e: any) {
    results.push(`WARN: master note regeneration failed — ${e.message}`)
  }

  // 3. Update wiki page if requested
  if (args.wiki_page_title && args.wiki_content) {
    try {
      const { data: existing } = await supabaseAdmin.from("kb_wiki_pages")
        .select("id").eq("title", args.wiki_page_title).maybeSingle()
      if (existing?.id) {
        await supabaseAdmin.from("kb_wiki_pages")
          .update({ content: args.wiki_content, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
        results.push(`OK: wiki "${args.wiki_page_title}" updated`)
      } else {
        results.push(`WARN: wiki page "${args.wiki_page_title}" not found — skipped`)
      }
    } catch (e: any) {
      results.push(`WARN: wiki update failed — ${e.message}`)
    }
  }

  return { results, summary: `Updated ${args.entries.length} KB entry(ies) + master note.` }
}

// ─── Portal browser ───────────────────────────────────────────────────────────

interface PortalCredential {
  name:        string
  url:         string
  username:    string
  password:    string
  login_path?: string
  notes?:      string
  // Advanced (for SPA portals with custom auth) — Hiếu lấy từ DevTools 1 lần:
  api_base?:      string   // base URL của REST API (vd cardadmin.sunspeedy.com/card-admin)
  login_api?:     string   // path endpoint login (vd /access/login, /sys/login)
  auth_header?:   string   // giá trị header Authorization cố định để gọi login (vd "Basic xxx" cho SpringBlade)
  user_field?:    string   // tên field username trong body login (vd "account", "username")
  pass_field?:    string   // tên field password trong body login
}

const PORTAL_SETTINGS_KEY = "portal_credentials"

// AES-256-GCM encryption cho portal password. Cần ENV PORTAL_CRED_KEY (32 chars).
// Graceful fallback: nếu key chưa set → lưu plain text (backward-compatible).
const _CRED_KEY = process.env.PORTAL_CRED_KEY
  ? Buffer.from(process.env.PORTAL_CRED_KEY.padEnd(32, "0").slice(0, 32))
  : null

function encryptPassword(plain: string): string {
  if (!_CRED_KEY || plain.startsWith("enc:")) return plain
  const iv  = randomBytes(12)
  const c   = createCipheriv("aes-256-gcm", _CRED_KEY, iv)
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()])
  return `enc:${iv.toString("hex")}:${c.getAuthTag().toString("hex")}:${enc.toString("hex")}`
}

function decryptPassword(stored: string): string {
  if (!stored.startsWith("enc:") || !_CRED_KEY) return stored
  try {
    const [, ivH, tagH, encH] = stored.split(":")
    const d = createDecipheriv("aes-256-gcm", _CRED_KEY, Buffer.from(ivH, "hex"))
    d.setAuthTag(Buffer.from(tagH, "hex"))
    return d.update(Buffer.from(encH, "hex")).toString("utf8") + d.final("utf8")
  } catch { return stored }
}

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

async function loadPortalCreds(): Promise<PortalCredential[]> {
  try {
    const { data } = await supabaseAdmin.from("app_settings")
      .select("value").eq("key", PORTAL_SETTINGS_KEY).maybeSingle()
    if (!data?.value) return []
    const creds: PortalCredential[] = JSON.parse(data.value)
    return creds.map(c => ({ ...c, password: decryptPassword(c.password) }))
  } catch { return [] }
}

async function savePortalCreds(creds: PortalCredential[]): Promise<void> {
  const encrypted = creds.map(c => ({ ...c, password: encryptPassword(c.password) }))
  await supabaseAdmin.from("app_settings").upsert(
    { key: PORTAL_SETTINGS_KEY, value: JSON.stringify(encrypted) },
    { onConflict: "key" }
  )
}

function cleanHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim()
}

// Parse Set-Cookie header(s) into a cookie jar object
function parseCookies(raw: string | null, jar: Record<string, string>) {
  if (!raw) return
  // set-cookie can be a single string with multiple cookies separated by commas (tricky)
  // Split on ", " but only when followed by a cookie-name pattern
  const entries = raw.split(/,(?=\s*[a-zA-Z_][a-zA-Z0-9_\-]*=)/)
  for (const entry of entries) {
    const [pair] = entry.trim().split(";")
    const eqIdx = pair.indexOf("=")
    if (eqIdx > 0) {
      const name = pair.slice(0, eqIdx).trim()
      const val  = pair.slice(eqIdx + 1).trim()
      if (name) jar[name] = val
    }
  }
}

// Detect if a page is an SPA (no server-rendered content, just JS bundle)
function isSPA(html: string): boolean {
  const hasForm = /<form[\s>]/i.test(html)
  const hasMeta = /react|vue|angular|vite|webpack|next\.js/i.test(html)
  const bodyEmpty = /<body[^>]*>\s*<div[^>]*>\s*<\/div>\s*<\/body>/i.test(html)
  return !hasForm && (hasMeta || bodyEmpty)
}

// Solve image CAPTCHA via Gemini Vision
async function solveImageCaptcha(imageUrl: string, cookieJar: Record<string, string>): Promise<string> {
  try {
    const res = await fetch(imageUrl, {
      headers: { "Cookie": Object.entries(cookieJar).map(([k,v]) => `${k}=${v}`).join("; "), "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return ""
    const buf    = await res.arrayBuffer()
    const base64 = Buffer.from(buf).toString("base64")
    const mime   = res.headers.get("content-type") || "image/png"

    // Call Gemini Vision to read the captcha
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" })
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [
        { text: "Read the text/numbers in this CAPTCHA image. Return ONLY the captcha text, nothing else. No spaces." },
        { inlineData: { mimeType: mime, data: base64 } },
      ]}],
    })
    return result.response.text().trim().replace(/\s/g, "")
  } catch { return "" }
}

// Extract token from a login response body (covers most REST/JWT patterns)
function extractToken(body: any): string | undefined {
  if (!body || typeof body !== "object") return undefined
  return body.token || body.access_token || body.accessToken ||
         body.data?.token || body.data?.access_token || body.data?.accessToken ||
         body.data?.tokenValue || body.result?.token || undefined
}

// SPA API login: use configured api_base/login_api if present, else try common patterns.
async function loginSPAPortal(portal: PortalCredential): Promise<{ token?: string; cookies: Record<string, string>; error?: string }> {
  const baseUrl   = portal.url.replace(/\/$/, "")
  const cookieJar: Record<string, string> = {}
  const apiBase   = (portal.api_base || baseUrl).replace(/\/$/, "")
  const userField = portal.user_field || "username"
  const passField = portal.pass_field || "password"

  // ── 1. SunSpeedy-specific: cardadmin API + image CAPTCHA (retry 3×) ─────────
  if (portal.url.includes("sunspeedy") || portal.url.includes("cardweb")) {
    const adminBase = portal.api_base || "https://cardadmin.sunspeedy.com/card-admin"
    for (let attempt = 0; attempt < 3; attempt++) {
      const uuid        = `gp-${Date.now()}-${attempt}`
      const captchaText = await solveImageCaptcha(`${adminBase}/captcha?uuid=${uuid}`, {})
      if (!captchaText) continue  // skip nếu Gemini Vision không giải được
      const r = await fetch(`${adminBase}${portal.login_api || "/login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": BROWSER_UA, "Origin": portal.url, "Referer": portal.url + "/" },
        body: JSON.stringify({ [userField]: portal.username, [passField]: portal.password, captcha: captchaText, uuid }),
        signal: AbortSignal.timeout(12000),
      })
      const body  = await r.json().catch(() => null)
      const token = extractToken(body)
      if ((body?.code === 0 || r.ok) && token) return { token, cookies: cookieJar }
      // code 401 or wrong captcha → retry with fresh UUID
    }
    return { cookies: cookieJar, error: "SunSpeedy login failed after 3 CAPTCHA attempts" }
  }

  // ── 1b. JoyTel-specific: /zyfh/api/v1 + SHA1 password + JPEG captcha ─────────
  // Endpoint: POST /zyfh/api/v1/access/login (NO Basic auth header needed)
  // CAPTCHA: GET /zyfh/api/v1/access/kaptcha (JPEG, Content-Type: image/jpeg)
  // Auth failure codes: 4003 (generic fail incl. wrong captcha), 4006 (expired), 4007 (wrong captcha)
  if (portal.url.includes("joytel")) {
    const apiV1 = `${baseUrl}/zyfh/api/v1`
    const pwSha1 = createHash("sha1").update(portal.password).digest("hex")
    // Retry up to 4 times — 4003 may mean wrong captcha (system groups all auth errors)
    for (let attempt = 0; attempt < 4; attempt++) {
      const captchaText = await solveImageCaptcha(`${apiV1}/access/kaptcha?rnd=${Date.now()}-${attempt}`, {})
      if (!captchaText) continue
      const r = await fetch(`${apiV1}/access/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": BROWSER_UA, "Origin": baseUrl, "Referer": baseUrl + "/" },
        body: JSON.stringify({ name: portal.username, password: pwSha1, verifyCode: captchaText, system: portal.username }),
        signal: AbortSignal.timeout(12000),
      })
      const body = await r.json().catch(() => null)
      const token = body?.data?.info?.authc?.principal?.token || extractToken(body) || body?.data?.token
      if (body?.success && token) return { token, cookies: cookieJar }
      // 4003/4006/4007 → retry (may be captcha OCR error, not credential error)
      // 4020 = account locked → stop immediately
      if (body?.code === 4020) return { cookies: cookieJar, error: `JoyTel: account locked — ${body.message}` }
      // Other errors → retry with fresh captcha
    }
    return { cookies: cookieJar, error: "JoyTel login failed after 4 attempts" }
  }

  // ── 2. Configured login_api (Hiếu đã lấy từ DevTools) ───────────────────────
  if (portal.login_api) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": BROWSER_UA, "Origin": baseUrl, "Referer": baseUrl + "/" }
      if (portal.auth_header) headers["Authorization"] = portal.auth_header  // SpringBlade Basic clientId
      const r = await fetch(`${apiBase}${portal.login_api}`, {
        method: "POST", headers,
        body: JSON.stringify({ [userField]: portal.username, [passField]: portal.password }),
        signal: AbortSignal.timeout(12000),
      })
      parseCookies(r.headers.get("set-cookie"), cookieJar)
      const body  = await r.json().catch(() => null)
      const token = extractToken(body)
      if ((r.ok || body?.code === 0 || body?.code === 200) && token) return { token, cookies: cookieJar }
      return { cookies: cookieJar, error: `Login API trả về: ${JSON.stringify(body).slice(0, 200)}` }
    } catch (e: any) {
      return { cookies: cookieJar, error: `Login API error: ${e.message}` }
    }
  }

  // ── 3. Generic fallback: try common REST login patterns ─────────────────────
  const loginEndpoints = ["/api/login", "/api/user/login", "/api/auth/login", "/access/login", "/login/api"]
  for (const ep of loginEndpoints) {
    try {
      const r = await fetch(`${apiBase}${ep}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": BROWSER_UA },
        body: JSON.stringify({ [userField]: portal.username, [passField]: portal.password }),
        signal: AbortSignal.timeout(8000),
      })
      parseCookies(r.headers.get("set-cookie"), cookieJar)
      const body  = await r.json().catch(() => null)
      const token = extractToken(body)
      if ((r.ok || body?.code === 0) && token) return { token, cookies: cookieJar }
      // 401 with JSON body = endpoint exists but needs auth_header (SpringBlade)
      if (r.status === 401 && body) {
        return { cookies: cookieJar, error: `Endpoint ${ep} tồn tại nhưng cần auth_header (framework như SpringBlade). Hiếu vào DevTools > Network khi login, copy header Authorization và lưu vào portal (managePortalCredentials với auth_header).` }
      }
    } catch { continue }
  }
  return { cookies: cookieJar, error: "Không tìm được login endpoint. Hiếu cần cấu hình login_api + api_base cho portal SPA này (lấy từ DevTools Network tab)." }
}

async function runBrowsePortal(args: { portal_name: string; path?: string }): Promise<any> {
  const creds  = await loadPortalCreds()
  const portal = creds.find(p =>
    p.name.toLowerCase().includes(args.portal_name.toLowerCase()) ||
    p.url.toLowerCase().includes(args.portal_name.toLowerCase())
  )
  if (!portal) {
    return {
      error:     `Portal "${args.portal_name}" not found in stored credentials.`,
      available: creds.length ? creds.map(c => `${c.name} (${c.url})`).join(", ") : "No portals configured yet.",
      hint:      "Call managePortalCredentials(action:'save', name, url, username, password) to add one.",
    }
  }

  const baseUrl  = portal.url.replace(/\/$/, "")
  const loginUrl = portal.login_path
    ? (portal.login_path.startsWith("http") ? portal.login_path : `${baseUrl}${portal.login_path}`)
    : baseUrl
  const timeout  = (ms: number) => AbortSignal.timeout(ms)

  // ── Step 1: Check if SPA or traditional ──────────────────────────────────────
  let loginHtml = ""
  try {
    const r1 = await fetch(loginUrl, { headers: { "User-Agent": BROWSER_UA }, signal: timeout(12000) })
    loginHtml = await r1.text()
  } catch (e: any) {
    return { error: `Cannot reach ${loginUrl}: ${e.message}` }
  }

  const cookieJar: Record<string, string> = {}
  const cookieHeader = () => Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join("; ")
  let authToken: string | undefined

  if (isSPA(loginHtml)) {
    // ── SPA portal: use REST API login ─────────────────────────────────────────
    const loginResult = await loginSPAPortal(portal)
    if (loginResult.error && !loginResult.token) {
      return { portal: portal.name, login_ok: false, error: loginResult.error,
        hint: "SPA portal detected. " + loginResult.error }
    }
    Object.assign(cookieJar, loginResult.cookies)
    authToken = loginResult.token
  } else {
    // ── Traditional portal: HTML form login ────────────────────────────────────
    // Extract CSRF token
    const csrfRe    = /(?:name|id)=["'](?:_token|csrf[_-]?token|csrfmiddlewaretoken|authenticity_token)["'][^>]*value=["']([^"']{8,})["']|value=["']([^"']{8,})["'][^>]*(?:name|id)=["'](?:_token|csrf[_-]?token|csrfmiddlewaretoken)["']/i
    const csrfMatch = loginHtml.match(csrfRe)
    const csrfToken = csrfMatch?.[1] || csrfMatch?.[2]
    const csrfField = loginHtml.match(/name=["'](_token|csrf[_-]?token|csrfmiddlewaretoken|authenticity_token)["']/i)?.[1] || "_token"

    // Detect form action
    const formAction = (loginHtml.match(/<form[^>]*action=["']([^"']+)["']/i) || [])[1]
    const postUrl    = formAction
      ? (formAction.startsWith("http") ? formAction : `${baseUrl}${formAction.startsWith("/") ? formAction : `/${formAction}`}`)
      : `${baseUrl}/login`

    // Detect field names
    const userFieldRe = /name=["']([^"']*(?:user|login|email|account)[^"']*)["'][^>]*type=["'](?:text|email)["']|type=["'](?:text|email)["'][^>]*name=["']([^"']*(?:user|login|email|account)[^"']*)["']/i
    const passFieldRe = /name=["']([^"']*(?:pass(?:word|wd)?|pwd)[^"']*)["'][^>]*type=["']password["']|type=["']password["'][^>]*name=["']([^"']*(?:pass|pwd)[^"']*)["']/i
    const userField   = loginHtml.match(userFieldRe)?.[1] || loginHtml.match(userFieldRe)?.[2] || "Username"
    const passField   = loginHtml.match(passFieldRe)?.[1] || loginHtml.match(passFieldRe)?.[2] || "Password"

    parseCookies((await fetch(loginUrl, { headers: { "User-Agent": BROWSER_UA }, signal: timeout(5000) })).headers.get("set-cookie"), cookieJar)

    const formBody = new URLSearchParams()
    formBody.append(userField, portal.username)
    formBody.append(passField, portal.password)
    if (csrfToken) formBody.append(csrfField, csrfToken)

    try {
      const r2 = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Cookie": cookieHeader(), "User-Agent": BROWSER_UA, "Referer": loginUrl },
        body: formBody.toString(), redirect: "manual", signal: timeout(12000),
      })
      parseCookies(r2.headers.get("set-cookie"), cookieJar)
      // Follow redirects
      let loc = r2.headers.get("location")
      for (let i = 0; i < 3 && loc; i++) {
        const url = loc.startsWith("http") ? loc : `${baseUrl}${loc.startsWith("/") ? loc : `/${loc}`}`
        const rr  = await fetch(url, { headers: { "Cookie": cookieHeader(), "User-Agent": BROWSER_UA }, redirect: "manual", signal: timeout(10000) })
        parseCookies(rr.headers.get("set-cookie"), cookieJar)
        loc = rr.headers.get("location")
      }
    } catch (e: any) {
      return { error: `Login POST failed: ${e.message}` }
    }
  }

  // ── Step 3: Fetch target page ─────────────────────────────────────────────────
  // SPA mode: resolve relative paths against the API base (data lives on the REST API,
  // not the static frontend). JoyTel → /zyfh/api/v1, SunSpeedy → cardadmin, else api_base.
  let apiRoot = baseUrl
  if (authToken) {
    if (portal.api_base) apiRoot = portal.api_base.replace(/\/$/, "")
    else if (portal.url.includes("joytel"))   apiRoot = `${baseUrl}/zyfh/api/v1`
    else if (portal.url.includes("sunspeedy") || portal.url.includes("cardweb")) apiRoot = "https://cardadmin.sunspeedy.com/card-admin"
  }
  const targetUrl = args.path
    ? (args.path.startsWith("http") ? args.path : `${apiRoot}${args.path.startsWith("/") ? args.path : `/${args.path}`}`)
    : (authToken ? apiRoot : baseUrl)

  let pageText = "", pageStatus = 0
  try {
    const headers: Record<string, string> = { "Cookie": cookieHeader(), "User-Agent": BROWSER_UA, "Referer": baseUrl }
    if (authToken) {
      if (portal.url.includes("sunspeedy") || portal.url.includes("cardweb")) {
        // SunSpeedy uses lowercase "token" header (not Authorization)
        headers["token"] = authToken
      } else {
        headers["Authorization"] = `Bearer ${authToken}`
        // JoyTel/Blade also accept token via custom header
        headers["Blade-Auth"]    = `bearer ${authToken}`
      }
    }

    const r5 = await fetch(targetUrl, { headers, signal: timeout(15000) })
    pageStatus = r5.status
    const raw  = await r5.text()

    // If SPA returns JSON (API call), format it nicely
    if (r5.headers.get("content-type")?.includes("application/json")) {
      try { pageText = JSON.stringify(JSON.parse(raw), null, 2) }
      catch { pageText = raw }
    } else {
      pageText = cleanHtml(raw)
    }
  } catch (e: any) {
    return { error: `Failed to load ${targetUrl}: ${e.message}` }
  }

  const truncated    = pageText.length > 15000
  const hasLoginForm = /<input[^>]+type=["']password["']/i.test(pageText)

  return {
    portal:      portal.name,
    url:         targetUrl,
    http_status: pageStatus,
    login_ok:    !!authToken || !hasLoginForm,
    portal_type: isSPA(loginHtml) ? "SPA" : "Traditional",
    content:     pageText.slice(0, 15000),
    truncated,
    hint: truncated
      ? "Content truncated at 15k chars. Request a specific path for more focused data."
      : hasLoginForm
        ? "Login may have failed — page still shows login form."
        : null,
  }
}

async function runManagePortalCredentials(args: {
  action:      string
  name?:       string
  url?:        string
  username?:   string
  password?:   string
  login_path?: string
  notes?:      string
  api_base?:   string
  login_api?:  string
  auth_header?: string
  user_field?: string
  pass_field?: string
}): Promise<any> {
  const creds = await loadPortalCreds()

  if (args.action === "list") {
    if (!creds.length) return { message: "No portals configured yet.", portals: [] }
    return {
      // Không trả password ra ngoài; báo có cấu hình SPA hay không
      portals: creds.map(c => ({
        name: c.name, url: c.url, username: c.username, login_path: c.login_path, notes: c.notes,
        spa_configured: !!(c.api_base || c.login_api), has_auth_header: !!c.auth_header,
      })),
      count: creds.length,
    }
  }

  if (args.action === "save") {
    // Cho phép update từng field: nếu portal đã tồn tại, chỉ ghi đè field được cung cấp
    const idx = creds.findIndex(c => c.name.toLowerCase() === (args.name || "").toLowerCase() || c.url === args.url)
    const existing = idx >= 0 ? creds[idx] : null
    if (!existing && (!args.name || !args.url || !args.username || !args.password)) {
      return { error: "Tạo mới cần: name, url, username, password. (Update portal có sẵn thì chỉ cần name + field muốn đổi)" }
    }
    const cred: PortalCredential = {
      name:        args.name       ?? existing!.name,
      url:         (args.url ?? existing!.url).replace(/\/$/, ""),
      username:    args.username   ?? existing!.username,
      password:    args.password   ?? existing!.password,
      login_path:  args.login_path ?? existing?.login_path,
      notes:       args.notes      ?? existing?.notes,
      api_base:    args.api_base    ?? existing?.api_base,
      login_api:   args.login_api   ?? existing?.login_api,
      auth_header: args.auth_header ?? existing?.auth_header,
      user_field:  args.user_field  ?? existing?.user_field,
      pass_field:  args.pass_field  ?? existing?.pass_field,
    }
    if (idx >= 0) {
      creds[idx] = cred
      await savePortalCreds(creds)
      return { success: true, message: `Updated portal "${args.name}". Total: ${creds.length}` }
    } else {
      creds.push(cred)
      await savePortalCreds(creds)
      return { success: true, message: `Saved new portal "${args.name}". Total: ${creds.length}` }
    }
  }

  if (args.action === "delete") {
    if (!args.name) return { error: "delete requires: name" }
    const before = creds.length
    const filtered = creds.filter(c => c.name.toLowerCase() !== args.name!.toLowerCase())
    await savePortalCreds(filtered)
    return { success: true, message: `Deleted ${before - filtered.length} portal(s). Remaining: ${filtered.length}` }
  }

  return { error: `Unknown action "${args.action}". Use: list | save | delete` }
}

// ─── Lark Task API ────────────────────────────────────────────────────────────
import { getLarkToken, getLarkUserToken } from "@/lib/lark"

async function runLarkTask(action: string, args: any): Promise<any> {
  const LARK = "https://open.larksuite.com/open-apis"
  try {
    // User token (OAuth) = danh nghĩa Hiếu → duyệt được task/tasklist cá nhân.
    // Nếu chưa kết nối → dùng app token (chỉ tạo/sửa/xem-theo-guid được, KHÔNG list).
    const userToken = await getLarkUserToken()
    const appToken  = await getLarkToken()
    const creatorOpenId = process.env.LARK_CREATOR_USER_ID || ""
    const h: Record<string, string> = {
      "Authorization": `Bearer ${userToken || appToken}`,
      "Content-Type": "application/json",
    }
    // Chỉ cần header open_id khi dùng app token (user token đã mang danh nghĩa user)
    if (!userToken && creatorOpenId) h["X-Lark-Request-User-Open-Id"] = creatorOpenId

    // list/tasklist cần user token — app token trả rỗng
    const needsUserToken = action === "listLarkTasks" || action === "listLarkTasklists"
    if (needsUserToken && !userToken) {
      return { error: "Chưa kết nối Lark để duyệt task cá nhân. Vào Gấu Pro bấm 'Kết nối Lark' để cấp quyền, rồi thử lại." }
    }

    if (action === "listLarkTasklists") {
      const res = await fetch(`${LARK}/task/v2/tasklists?page_size=100&user_id_type=open_id`, { headers: h })
      const d = await res.json()
      if (d.code && d.code !== 0) return { error: `Lark API error ${d.code}: ${d.msg}`, raw: d, note: "Cần scope task:tasklist:read." }
      // Rút gọn: chỉ trả guid + name mỗi tasklist
      const lists = (d.data?.items || []).map((t: any) => ({ guid: t.guid, name: t.name }))
      return { tasklists: lists, hint: "Gọi listLarkTasks với tasklist_guid để xem task bên trong." }
    }
    if (action === "listLarkTasks") {
      const ps = Math.min(args?.page_size || 20, 50)
      const qs = new URLSearchParams({
        page_size: String(ps),
        user_id_type: "open_id",
      })
      if (args?.page_token) qs.set("page_token", args.page_token)
      // Có tasklist_guid → lấy task TRONG danh sách công việc đó; không → mọi task của user
      const url = args?.tasklist_guid
        ? `${LARK}/task/v2/tasklists/${encodeURIComponent(args.tasklist_guid)}/tasks?${qs}`
        : `${LARK}/task/v2/tasks?${qs}`
      const res = await fetch(url, { headers: h })
      const d = await res.json()
      if (d.code && d.code !== 0) return { error: `Lark API error ${d.code}: ${d.msg}`, raw: d }
      return d.data || d
    }
    if (action === "getLarkTask") {
      const res = await fetch(
        `${LARK}/task/v2/tasks/${encodeURIComponent(args.task_guid)}?user_id_type=open_id`,
        { headers: h }
      )
      const d = await res.json()
      if (d.code && d.code !== 0) return { error: `Lark API error ${d.code}: ${d.msg}`, raw: d }
      return d.data || d
    }
    if (action === "createLarkTask") {
      const body: any = {
        summary: args.summary,
        // Gán Hiếu làm assignee để task hiện trong "My Tasks".
        // Lark Task v2 role hợp lệ = "assignee" | "follower" ("creator" KHÔNG hợp lệ → gán fail).
        members: creatorOpenId ? [{ id: creatorOpenId, type: "user", role: "assignee" }] : undefined,
      }
      if (args.description) body.description = { content: args.description, content_type: "markdown" }
      if (args.due) body.due = { timestamp: String(new Date(args.due).getTime() / 1000 | 0) }
      const res = await fetch(`${LARK}/task/v2/tasks?user_id_type=open_id`, {
        method: "POST", headers: h, body: JSON.stringify(body),
      })
      const d = await res.json()
      if (d.code && d.code !== 0) return { error: `Lark API error ${d.code}: ${d.msg}`, raw: d }
      return d.data || d
    }
    if (action === "updateLarkTask") {
      const body: any = { task: {}, update_fields: [] as string[] }
      if (args.summary)     { body.task.summary = args.summary; body.update_fields.push("summary") }
      if (args.description) { body.task.description = { content: args.description, content_type: "markdown" }; body.update_fields.push("description") }
      if (args.due)         { body.task.due = { timestamp: String(new Date(args.due).getTime() / 1000 | 0) }; body.update_fields.push("due") }
      if (args.complete)    { body.task.completed_at = String(Date.now() / 1000 | 0); body.update_fields.push("completed_at") }
      const res = await fetch(
        `${LARK}/task/v2/tasks/${encodeURIComponent(args.task_guid)}?user_id_type=open_id`,
        { method: "PATCH", headers: h, body: JSON.stringify(body) }
      )
      const d = await res.json()
      if (d.code && d.code !== 0) return { error: `Lark API error ${d.code}: ${d.msg}`, raw: d }
      return d.data || d
    }
    return { error: `Unknown action: ${action}` }
  } catch (e: any) { return { error: e.message } }
}

// ─── Lark Base (Bitable) ──────────────────────────────────────────────────────
async function runLarkBase(args: any): Promise<any> {
  const LARK = "https://open.larksuite.com/open-apis"
  try {
    const token = await getLarkToken()
    const creatorOpenId = process.env.LARK_CREATOR_USER_ID || ""
    const h: Record<string, string> = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    }
    if (creatorOpenId) h["X-Lark-Request-User-Open-Id"] = creatorOpenId

    // 1. Không app_token → list các Base
    if (!args?.app_token) {
      const res = await fetch(`${LARK}/bitable/v1/apps?page_size=50`, { headers: h })
      const d = await res.json()
      if (d.code && d.code !== 0) return { error: `Lark API error ${d.code}: ${d.msg}`, raw: d, note: "Cần scope bitable:app:readonly." }
      return { hint: "Truyền app_token để xem tables trong 1 Base.", ...(d.data || d) }
    }
    // 2. Có app_token, không table_id → list tables
    if (!args?.table_id) {
      const res = await fetch(`${LARK}/bitable/v1/apps/${encodeURIComponent(args.app_token)}/tables?page_size=100`, { headers: h })
      const d = await res.json()
      if (d.code && d.code !== 0) return { error: `Lark API error ${d.code}: ${d.msg}`, raw: d }
      return { hint: "Truyền cả app_token + table_id để đọc records.", ...(d.data || d) }
    }
    // 3. Có cả hai → đọc records
    const ps = Math.min(args?.page_size || 50, 200)
    const qs = new URLSearchParams({ page_size: String(ps) })
    if (args?.filter) qs.set("filter", args.filter)
    const res = await fetch(
      `${LARK}/bitable/v1/apps/${encodeURIComponent(args.app_token)}/tables/${encodeURIComponent(args.table_id)}/records?${qs}`,
      { headers: h }
    )
    const d = await res.json()
    if (d.code && d.code !== 0) return { error: `Lark API error ${d.code}: ${d.msg}`, raw: d }
    // Rút gọn: chỉ trả fields của mỗi record (bỏ metadata cồng kềnh)
    const records = (d.data?.items || []).map((r: any) => ({ record_id: r.record_id, ...r.fields }))
    return { records, total: d.data?.total, has_more: d.data?.has_more, page_token: d.data?.page_token }
  } catch (e: any) { return { error: e.message } }
}

// ─── Main runner ──────────────────────────────────────────────────────────────

// Gọi Gemini có retry cho lỗi TẠM THỜI (429 rate-limit / 5xx / overload / network) → tăng ổn định.
// Lỗi thật (prompt/schema) ném ngay, không retry vô ích.
async function genWithRetry(model: any, request: any, attempts = 3): Promise<any> {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    try {
      return await model.generateContent(request)
    } catch (e: any) {
      lastErr = e
      const transient = /429|rate|quota|resource.?exhausted|500|503|overload|unavailable|deadline|timeout|ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(String(e?.message || ""))
      if (!transient || i === attempts - 1) throw e
      await new Promise(r => setTimeout(r, 800 * (i + 1)))  // backoff 0.8s → 1.6s
    }
  }
  throw lastErr
}

// Ngày tháng theo giờ VN (ICT) → inject vào system prompt để Gấu tự hiểu "tháng này"/"hôm nay".
function buildDateContext(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }))
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  const ytdStart = new Date(now.getFullYear(), 0, 1)
  const dow = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"][now.getDay()]
  return `\n\n━━━ NGÀY THÁNG (auto, giờ VN) ━━━
Hôm nay: ${fmt(now)} (${dow}). Data cutoff gohub_dw = CURRENT_DATE-1 = ${fmt(yesterday)} (ETL sáng ~08h ICT, hôm nay chưa đủ data).
"tháng này" / "MTD" = ${fmt(mtdStart)} → ${fmt(yesterday)}
"tháng trước" (đủ ngày) = ${fmt(lastMonthStart)} → ${fmt(lastMonthEnd)}
"YTD" = ${fmt(ytdStart)} → ${fmt(yesterday)}
→ Khi user nói "tháng này" / "gần đây" / "hôm nay" / "tháng trước" → DÙNG NGAY các mốc trên, KHÔNG hỏi lại ngày. Luôn cắt data tới ${fmt(yesterday)}.`
}

export async function runCreatorAI(
  geminiHistory: any[],
  lastMsg: string,
  fileContexts?: FileContext[],
  onEvent?: (e: GPEvent) => void,
): Promise<{ text: string; sources: WebSource[] }> {
  // KB auto-inject CHỈ ở lượt đầu (conversation mới) → Gấu luôn nắm định nghĩa chuẩn, không cần tự gọi tool.
  const isFreshConversation = geminiHistory.length <= 1
  const [partnerTierInfo, ga4SiteList, kbInject] = await Promise.all([
    getPartnerTiers().then(tiers => {
      const lines = Object.entries(tiers).map(([tier, channels]) => `  ${tier}: ${(channels as string[]).join(", ")}`).join("\n")
      return lines ? `\n\n━━━ PARTNER TIERS (B2B từ Supabase) ━━━\n${lines}` : ""
    }).catch(() => ""),
    ga4Sites().then(sites => sites.length ? "\n\nGA4 SITES: " + sites.map(s => `${s.id}="${s.name}" (${s.propertyId})`).join(", ") : "").catch(() => ""),
    isFreshConversation
      ? runReadKnowledgeBase().then((kb: any) => {
          const entries = kb?.entries || kb?.result || kb
          if (!entries || (Array.isArray(entries) && entries.length === 0)) return ""
          const PRIORITY_CATS = ["product_codes","sku_rules","exchange_rates","cogs","vendors","processes","notes"]
          const sorted = Array.isArray(entries)
            ? [...entries].sort((a: any, b: any) => {
                const ai = PRIORITY_CATS.indexOf(a.category); const bi = PRIORITY_CATS.indexOf(b.category)
                return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
              })
            : entries
          const body = typeof sorted === "string" ? sorted : JSON.stringify(sorted)
          const MAX_KB = 8000
          const truncated = body.length > MAX_KB
          const suffix = truncated
            ? `\n[⚠️ KB còn ${Array.isArray(entries) ? entries.length : "?"} entries — một số bị cắt. Gọi readKnowledgeBase(category) để xem đầy đủ]`
            : ""
          return `\n\n━━━ CREATOR KB (đã nạp — NGUỒN SỰ THẬT, override training data khi mâu thuẫn) ━━━\n${body.slice(0, MAX_KB)}${suffix}`
        }).catch(() => "")
      : Promise.resolve(""),
  ])

  // Business date context — auto-inject để Gấu tự biết "tháng này"/"hôm nay" mà không hỏi lại
  const dateContext = buildDateContext()

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    systemInstruction: SYSTEM_PROMPT + dateContext + partnerTierInfo + ga4SiteList + kbInject,
    tools: [{ functionDeclarations: ALL_TOOL_DECLARATIONS }],
    generationConfig: { temperature: 0 },
  })

  // Build user message parts — support multiple files (text + binary)
  let userParts: any[]
  const files = fileContexts || []
  const texts   = files.filter(f => f.type === "text")
  const binaries = files.filter(f => f.type !== "text")
  const msgText = lastMsg || (files.length ? `Phân tích ${files.length} file: ${files.map(f => f.name).join(", ")}` : "")

  if (files.length > 0) {
    const textContent = texts.map(f => {
      const raw = f.content.length > 50000
        ? f.content.slice(0, 50000) + `\n... [truncated — ${f.content.length} chars, showing first 50k]`
        : f.content
      return `=== FILE: ${f.name} ===\n${raw}`
    }).join("\n\n---\n\n")

    if (binaries.length > 0) {
      // Gửi tất cả binary files như inlineData parts + text content appended vào message text
      userParts = [
        { text: msgText + (textContent ? `\n\n=== CÁC FILE VĂN BẢN KÈM THEO ===\n${textContent.slice(0, 20000)}` : "") },
        ...binaries.map(b => ({ inlineData: { mimeType: b.mimeType || "application/octet-stream", data: b.content } })),
      ]
    } else {
      // Chỉ text files
      userParts = [{ text: `${msgText}\n\n${textContent}` }]
    }
  } else {
    userParts = [{ text: msgText }]
  }

  const contents: any[] = [
    ...geminiHistory,
    { role: "user", parts: userParts },
  ]

  let genResult = await genWithRetry(model, { contents })
  const collectedSources: WebSource[] = []

  function appendModelContent() {
    const content = genResult.response.candidates?.[0]?.content
    if (content) contents.push(content)
  }
  appendModelContent()

  // Function calling loop — max 20 iterations. Tools run in parallel per turn.
  for (let i = 0; i < 20; i++) {
    const calls = genResult.response.functionCalls()
    if (!calls || calls.length === 0) break

    const fnParts = await Promise.all(calls.map((call: any) => dispatchTool(call, onEvent, collectedSources)))
    // Legacy inline dispatch removed — delegated to creator/tools/dispatch.ts
    if (false) await Promise.all(calls.map(async (call: any): Promise<any> => {
      // Emit status event (kept as dead code reference)
      const statusMsg = call.name === "webSearch"
        ? `🌐 Đang tìm kiếm: "${((call.args as any)?.query || "").slice(0, 60)}"`
        : call.name === "browsePortal"
          ? `🔗 Đang truy cập portal ${(call.args as any)?.portal_name || ""}...`
          : TOOL_STATUS[call.name] ?? "⚙️ Đang xử lý..."
      onEvent?.({ type: "status", text: statusMsg })

      // ── readKnowledgeBase ──
      if (call.name === "readKnowledgeBase") {
        const resp = await runReadKnowledgeBase((call.args as any)?.category)
        return { functionResponse: { name: "readKnowledgeBase", response: resp } }
      }

      // ── writeKnowledgeBase ──
      if (call.name === "writeKnowledgeBase") {
        const resp = await runWriteKnowledgeBase(call.args as any)
        return { functionResponse: { name: "writeKnowledgeBase", response: resp } }
      }

      // ── reviewPendingLearning ──
      if (call.name === "reviewPendingLearning") {
        const { data, error } = await supabaseAdmin
          .from("chatbot_learning_log")
          .select("id,user_name,user_role,message_content,detected_info,learning_type,severity,existing_kb_key,conflict_detail,created_at")
          .eq("status", "pending").order("created_at", { ascending: false })
          .limit((call.args as any)?.limit || 20)
        return { functionResponse: { name: "reviewPendingLearning", response: error ? { error: error.message } : { records: data || [], total: data?.length || 0 } } }
      }

      // ── approveLearning ──
      if (call.name === "approveLearning") {
        const a = call.args as any
        try {
          const kbUpsert  = await supabaseAdmin.from("creator_kb").upsert({ key: a.kb_key, category: a.kb_category, title: a.kb_title, content: a.kb_content, updated_at: new Date().toISOString() })
          const logUpdate = await supabaseAdmin.from("chatbot_learning_log").update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: "creator" }).eq("id", a.id)
          return { functionResponse: { name: "approveLearning", response: { ok: !kbUpsert.error && !logUpdate.error, kb_key: a.kb_key } } }
        } catch (e: any) {
          return { functionResponse: { name: "approveLearning", response: { error: e.message } } }
        }
      }

      // ── rejectLearning ──
      if (call.name === "rejectLearning") {
        const a = call.args as any
        const { error } = await supabaseAdmin.from("chatbot_learning_log")
          .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: "creator", conflict_detail: a.reason || null }).eq("id", a.id)
        return { functionResponse: { name: "rejectLearning", response: { ok: !error } } }
      }

      // ── Lark Task tools ──
      if (["listLarkTasks","listLarkTasklists","getLarkTask","createLarkTask","updateLarkTask"].includes(call.name)) {
        const resp = await runLarkTask(call.name, call.args as any)
        return { functionResponse: { name: call.name, response: resp } }
      }

      // ── Lark Base ──
      if (call.name === "queryLarkBase") {
        const resp = await runLarkBase(call.args as any)
        return { functionResponse: { name: "queryLarkBase", response: resp } }
      }

      // ── browsePortal ──
      if (call.name === "browsePortal") {
        console.log(`[CreatorAI] browsePortal: ${(call.args as any).portal_name}`)
        const resp = await runBrowsePortal(call.args as any)
        return { functionResponse: { name: "browsePortal", response: resp } }
      }

      // ── managePortalCredentials ──
      if (call.name === "managePortalCredentials") {
        const resp = await runManagePortalCredentials(call.args as any)
        return { functionResponse: { name: "managePortalCredentials", response: resp } }
      }

      // ── generateImage ──
      if (call.name === "generateImage") {
        const resp = await runGenerateImage(call.args as any)
        return { functionResponse: { name: "generateImage", response: {
          ...resp,
          instruction: resp.error
            ? `Image generation failed: ${resp.error}. Tell Hiếu and suggest rephrasing the prompt.`
            : "Include the markdown field EXACTLY as-is in your response — it contains the base64 image that the UI will render. Do NOT modify or truncate it.",
        } } }
      }

      // ── getTrendSnapshots ──
      if (call.name === "getTrendSnapshots") {
        const resp = await runGetTrendSnapshots(call.args as any)
        return { functionResponse: { name: "getTrendSnapshots", response: resp } }
      }

      // ── webSearch ──
      if (call.name === "webSearch") {
        const { query } = call.args as { query: string }
        console.log(`[CreatorAI] webSearch: ${query}`)
        const { result, sources } = await _runWebSearch(query)
        collectedSources.push(...sources)
        const sourcesText = sources.length
          ? "\n\nSources:\n" + sources.map((s, i) => `[${i + 1}] ${s.title}: ${s.url}`).join("\n")
          : ""
        return { functionResponse: { name: "webSearch", response: {
          result: result + sourcesText,
          instruction: "MUST cite the source URLs listed above when using this information.",
        } } }
      }

      // ── listSupabaseTables ──
      if (call.name === "listSupabaseTables") {
        return { functionResponse: { name: "listSupabaseTables", response: { tables: ALL_TABLES } } }
      }

      // ── querySupabase ──
      if (call.name === "querySupabase") {
        const resp = await runQuerySupabase(call.args)
        return { functionResponse: { name: "querySupabase", response: resp } }
      }

      // ── queryGA4 ──
      if (call.name === "queryGA4") {
        try {
          const a = call.args as any
          const report = await runGA4Report({ siteId: a.siteId, startDate: a.startDate, endDate: a.endDate, metrics: a.metrics || ["sessions"], dimensions: a.dimensions, limit: a.limit || 50 })
          const rows = (report.rows || []).slice(0, 100).map((r: any) => ({ dimensions: r.dimensionValues?.map((d: any) => d.value), metrics: r.metricValues?.map((m: any) => m.value) }))
          return { functionResponse: { name: "queryGA4", response: { rows, rowCount: report.rowCount } } }
        } catch (e: any) {
          return { functionResponse: { name: "queryGA4", response: { error: e.message } } }
        }
      }

      // ── queryGSC ──
      if (call.name === "queryGSC") {
        try {
          const a = call.args as any
          const rows = await runGSC(a.siteId, a.startDate, a.endDate, a.dimensions || ["query"], a.rowLimit || 20)
          return { functionResponse: { name: "queryGSC", response: { rows: rows.slice(0, 100) } } }
        } catch (e: any) {
          return { functionResponse: { name: "queryGSC", response: { error: e.message } } }
        }
      }

      // ── queryProduct ──
      if (call.name === "queryProduct") {
        try {
          const a = call.args as any
          const code: string = (a.sku_code || a.product_code || "").trim().toUpperCase()
          let prodResult: any = null
          if (code.length === 13) {
            const { data } = await supabaseAdmin.from("skus").select("sku_code,sku_ref,product_code,tenant,status,sim_esim,data_amount,data_amount_unit,is_unlimited,is_daily,day_amount,day_amount_unit,parents,frame,datapack,throttle_speed,call,call_sms_details,hotspot,kyc_needed,operator_code,network_type,vendor_sku,vendor_sku_sim,latest_cogs,latest_cogs_currency,original_cost,reference_cost_vnd,final_cogs_included_vat_vnd,final_cogs_usd,expirations,wr_group,note").eq("sku_code", code).maybeSingle()
            prodResult = data
          } else if (code.length === 8) {
            const { data } = await supabaseAdmin.from("products").select("product_code,product_ref,status,tenant,sim_esim,product_type,vendor,vendor_code,data_policy_code,gc_purchase_type,sku_type,data_type,import_type,supported_countries,country_group,daily_reset_time,activation_time,network_type,onsite_carrier,local_phone_number,local_number_country,hotspot,kyc_code,kyc_needed,top_up_options,base_sim_esim_sku_code,apn,apn_original,telco_perks,note").eq("product_code", code).maybeSingle()
            prodResult = data
          }
          return { functionResponse: { name: "queryProduct", response: prodResult ?? { error: "Product not found" } } }
        } catch (e: any) {
          return { functionResponse: { name: "queryProduct", response: { error: e.message } } }
        }
      }

      // ── executeSQL (cached 5 min) ──
      if (call.name === "executeSQL") {
        const sql = (call.args as any)?.sql as string || ""
        const norm = sql.trim().toLowerCase()
        if (!norm.startsWith("select") && !norm.startsWith("with"))
          return { functionResponse: { name: "executeSQL", response: { error: "Only SELECT and WITH queries are allowed." } } }
        if (sql.includes(";") && sql.split(";").filter((s: string) => s.trim()).length > 1)
          return { functionResponse: { name: "executeSQL", response: { error: "Multiple statements not allowed." } } }
        try {
          console.log(`[CreatorAI] SQL: ${sql.substring(0, 200)}`)
          const sqlHash = createHash("md5").update(sql).digest("hex").slice(0, 16)
          const rows = await cachedQuery(`gp-sql:${sqlHash}`, () => queryAnalytics(sql), 5)
          const limited = rows.slice(0, 200)
          const response: any = { result: limited, rowCount: rows.length }
          if (rows.length === 0) {
            response.auto_retry_suggested = true
            response.retry_hint = "0 rows. Sửa & chạy lại: (1) fulfiled_date::DATE cast (một chữ 'l'), (2) ILIKE thay vì =, (3) bỏ bớt 1 filter, (4) SELECT MAX(fulfiled_date::date) FROM fact_fulfillment_revenue xem ngày mới nhất."
          }
          const firstRow = limited[0] as any
          if (firstRow) {
            const nums = Object.values(firstRow).filter(v => typeof v === "number" || (typeof v === "string" && !isNaN(Number(v)))).map(v => Number(v))
            if (nums.some(n => n > 1e12)) { response.auto_retry_suggested = true; response.retry_hint = "Giá trị bất thường lớn (>1 nghìn tỷ VND) — nghi THIẾU JOIN gây nhân dòng (row multiplication). Kiểm tra JOIN + GROUP BY rồi chạy lại." }
            if (nums.some(n => n < 0 && sql.toLowerCase().includes("revenue"))) response.warning = "Có revenue âm — nghi data issue hoặc aggregation sai."
          }
          return { functionResponse: { name: "executeSQL", response } }
        } catch (err: any) {
          console.error("[CreatorAI] SQL error:", err.message)
          return { functionResponse: { name: "executeSQL", response: { error: err.message, fix_hint: "Fix the SQL error and retry immediately. Common causes: wrong column name (query information_schema.columns to check), missing ::DATE cast on fulfiled_date, using sku_code instead of sku in dim_sku." } } }
        }
      }

      return { functionResponse: { name: call.name, response: { error: "Unknown tool" } } }
    }))

    // Send function responses as role "user" — required by gemini-3.6-flash
    contents.push({ role: "user", parts: fnParts })
    genResult = await genWithRetry(model, { contents })
    appendModelContent()
  }

  // Ensure non-empty response
  let text = genResult.response.text()
  if (!text.trim()) {
    try {
      contents.push({ role: "user", parts: [{ text: "Based on the data retrieved above, write a complete, detailed answer in Vietnamese. Include a markdown table or chart if the data is tabular. DO NOT call any more tools." }] })
      genResult = await genWithRetry(model, { contents })
      text = genResult.response.text()
    } catch { /* keep empty */ }
  }

  return { text: text || "Không có dữ liệu trả về.", sources: collectedSources }
}
