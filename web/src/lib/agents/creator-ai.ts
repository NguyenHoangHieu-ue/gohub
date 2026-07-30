import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"
import { queryAnalytics }                 from "@/lib/analytics-db"
import { supabaseAdmin }                   from "@/lib/supabase"
import { runGA4Report, runGSC, ga4Sites } from "@/lib/ga4"
import { getPartnerTiers }               from "@/lib/analytics-helpers"
import { SUPABASE_TABLES, SENSITIVE_TABLES } from "./data-explorer"

// ─── Creator AI ───────────────────────────────────────────────────────────────
// Private AI exclusively for Hiếu (creator role).
// Full access: gohub_dw + Supabase + GA4 + GSC + Web Search.
// No guardian, no role filter, no restrictions.
// Quality > Speed — max 20 function-calling iterations.

export interface WebSource { title: string; url: string }

export interface FileContext {
  name:     string
  type:     "text" | "image" | "pdf"
  content:  string   // text content (for "text") or base64 (for "image"/"pdf")
  mimeType?: string  // e.g. "image/png", "application/pdf"
}

// ─── Tool declarations ───────────────────────────────────────────────────────

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
      action:     { type: SchemaType.STRING, description: "Action: 'list' | 'save' | 'delete'" },
      name:       { type: SchemaType.STRING, description: "Portal display name (e.g. 'SunSpeedy Card Web')" },
      url:        { type: SchemaType.STRING, description: "Base URL of the portal (e.g. 'https://cardweb.sunspeedy.com')" },
      username:   { type: SchemaType.STRING, description: "Login username or email" },
      password:   { type: SchemaType.STRING, description: "Login password" },
      login_path: { type: SchemaType.STRING, description: "Login page path if different from root (e.g. '/auth/login')" },
      notes:      { type: SchemaType.STRING, description: "Optional notes about this portal" },
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

## File Export
When user asks to download/export data as CSV or Excel:
- Output a \`\`\`csv code block with the actual CSV content (comma-separated, first line = headers)
- Example:
\`\`\`csv
Tháng,Doanh thu (VND),Gross Profit (VND),GP%
T1/2026,1200000000,360000000,30.0%
T2/2026,1500000000,450000000,30.0%
\`\`\`
- The UI will automatically show a "Download CSV" / "Download Excel" button when it detects a csv block.
- For JSON export, output a \`\`\`json block (array of objects) — UI will show "Download JSON".
- Always confirm what data is being exported before generating the block.

## File Analysis (when user uploads a file)
- Analyze the file content carefully and answer questions about it
- For spreadsheets/CSV: describe structure, count rows, list columns, identify key data
- For PDF/images: describe content, extract information, answer questions
- For code files: review, explain, suggest improvements

## External Portal Access
You can login to external supplier/partner portals and fetch their content using browsePortal.
Credentials are securely stored in Supabase (never exposed in responses).

Workflow:
1. First time: ask Hiếu for credentials → call managePortalCredentials(action:"save", ...) to store
2. Subsequent use: call browsePortal(portal_name:"...") → page content returned as text
3. Analyze/compare returned content, make recommendations

Portal browsing limitations:
- Works for traditional server-rendered sites (HTML form login)
- May not work for SPAs that require JavaScript rendering
- If page content looks empty/wrong → try a specific path or the site may be JS-heavy
- Content is truncated at 12k chars; request specific paths for focused data

When Hiếu says "xem sản phẩm trên portal X": browse the portal, extract products/prices from the text content, compare with GoHub's catalog, identify gaps or pricing opportunities.

## GoHub Business Context
- **GoHub**: sells Sim/eSIM data packages for international travel
- **Channels**: B2B (corporate/wholesale, price_list_name has tier: Strategic/VIP/Gold/Silver) + B2C (direct, price_list_name = null)
- **Key metrics**: Revenue (VND), GP = Revenue - COGS, CM1 = GP - Operation Cost (Op Cost from analytics_channel_costs/analytics_channel_group_costs in Supabase)
- **Vendors**: WorldMove (WM), 3HK Datapool, others
- **3HK vendor match**: REPLACE(UPPER(TRIM(vendor)),' ','') LIKE '3HK%' (vendor string has inconsistent spacing)
- **Exclude system accounts**: customer name NOT ILIKE '%B2C Customer%' AND NOT ILIKE '%B2B Ops%'

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

// ─── Web search via Gemini Google Search grounding ────────────────────────────

async function runWebSearch(query: string): Promise<{ result: string; sources: WebSource[] }> {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    // Separate model instance with googleSearch — CANNOT combine with functionDeclarations
    const searchModel = genAI.getGenerativeModel({
      model: "gemini-3.6-flash",
      tools: [{ googleSearch: {} } as any],
    })
    const result = await searchModel.generateContent({
      contents: [{ role: "user", parts: [{ text: `${query}\n\nProvide a comprehensive, factual answer with citations.` }] }],
    })
    const text = result.response.text()
    const meta = (result.response.candidates?.[0] as any)?.groundingMetadata
    const sources: WebSource[] = (meta?.groundingChunks || [])
      .map((c: any) => ({ title: c.web?.title || "Web source", url: c.web?.uri || "" }))
      .filter((s: WebSource) => s.url)
    return { result: text, sources }
  } catch (e: any) {
    return {
      result: `Web search failed: ${e.message}. Please answer from your training knowledge and note that this may not reflect the latest information.`,
      sources: [],
    }
  }
}

// ─── Portal browser ───────────────────────────────────────────────────────────

interface PortalCredential {
  name:       string
  url:        string
  username:   string
  password:   string
  login_path?: string
  notes?:     string
}

const PORTAL_SETTINGS_KEY = "portal_credentials"
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

async function loadPortalCreds(): Promise<PortalCredential[]> {
  try {
    const { data } = await supabaseAdmin.from("app_settings")
      .select("value").eq("key", PORTAL_SETTINGS_KEY).maybeSingle()
    return data?.value ? JSON.parse(data.value) : []
  } catch { return [] }
}

async function savePortalCreds(creds: PortalCredential[]): Promise<void> {
  await supabaseAdmin.from("app_settings").upsert(
    { key: PORTAL_SETTINGS_KEY, value: JSON.stringify(creds) },
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

  const baseUrl   = portal.url.replace(/\/$/, "")
  const loginUrl  = portal.login_path
    ? (portal.login_path.startsWith("http") ? portal.login_path : `${baseUrl}${portal.login_path}`)
    : baseUrl
  const cookieJar: Record<string, string> = {}
  const cookieHeader = () => Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join("; ")

  const timeout = (ms: number) => AbortSignal.timeout(ms)

  // Step 1: GET login page
  let loginHtml = ""
  try {
    const r1 = await fetch(loginUrl, { headers: { "User-Agent": BROWSER_UA }, signal: timeout(12000) })
    loginHtml = await r1.text()
    parseCookies(r1.headers.get("set-cookie"), cookieJar)
  } catch (e: any) {
    return { error: `Cannot reach ${loginUrl}: ${e.message}` }
  }

  // Extract CSRF token (multiple common patterns)
  const csrfRe = /(?:name|id)=["'](?:_token|csrf[_-]?token|csrfmiddlewaretoken|authenticity_token)["'][^>]*value=["']([^"']{8,})["']|value=["']([^"']{8,})["'][^>]*(?:name|id)=["'](?:_token|csrf[_-]?token|csrfmiddlewaretoken)["']/i
  const csrfMatch  = loginHtml.match(csrfRe)
  const csrfToken  = csrfMatch?.[1] || csrfMatch?.[2]
  const csrfField  = loginHtml.match(/name=["'](_token|csrf[_-]?token|csrfmiddlewaretoken|authenticity_token)["']/i)?.[1] || "_token"

  // Detect form action
  const formActionMatch = loginHtml.match(/<form[^>]*action=["']([^"']+)["'][^>]*(?:method=["']post["'])?/i)
                       || loginHtml.match(/<form[^>]*(?:method=["']post["'])[^>]*action=["']([^"']+)["']/i)
  const formAction  = formActionMatch?.[1]
  const postUrl = formAction
    ? (formAction.startsWith("http") ? formAction : `${baseUrl}${formAction.startsWith("/") ? formAction : `/${formAction}`}`)
    : `${loginUrl}/login`

  // Detect username/password field names
  const userFieldRe = /name=["']([^"']*(?:user|login|email|account|name)[^"']*)["'][^>]*type=["'](?:text|email)["']|type=["'](?:text|email)["'][^>]*name=["']([^"']*(?:user|login|email|account)[^"']*)["']/i
  const passFieldRe = /name=["']([^"']*(?:pass(?:word|wd|wd)?|pwd)[^"']*)["'][^>]*type=["']password["']|type=["']password["'][^>]*name=["']([^"']*(?:pass|pwd)[^"']*)["']/i
  const userField = loginHtml.match(userFieldRe)?.[1] || loginHtml.match(userFieldRe)?.[2] || "username"
  const passField = loginHtml.match(passFieldRe)?.[1] || loginHtml.match(passFieldRe)?.[2] || "password"

  // Step 2: POST login form
  const body = new URLSearchParams()
  body.append(userField, portal.username)
  body.append(passField, portal.password)
  if (csrfToken) body.append(csrfField, csrfToken)

  let r2: Response
  try {
    r2 = await fetch(postUrl, {
      method:   "POST",
      headers:  { "Content-Type": "application/x-www-form-urlencoded", "Cookie": cookieHeader(), "User-Agent": BROWSER_UA, "Referer": loginUrl },
      body:     body.toString(),
      redirect: "manual",
      signal:   timeout(12000),
    })
    parseCookies(r2.headers.get("set-cookie"), cookieJar)
  } catch (e: any) {
    return { error: `Login POST failed: ${e.message}` }
  }

  // Follow up to 3 redirects
  let nextLoc = r2.headers.get("location")
  for (let i = 0; i < 3 && nextLoc; i++) {
    const url = nextLoc.startsWith("http") ? nextLoc : `${baseUrl}${nextLoc.startsWith("/") ? nextLoc : `/${nextLoc}`}`
    try {
      const rr = await fetch(url, { headers: { "Cookie": cookieHeader(), "User-Agent": BROWSER_UA }, redirect: "manual", signal: timeout(10000) })
      parseCookies(rr.headers.get("set-cookie"), cookieJar)
      nextLoc = rr.headers.get("location")
    } catch { break }
  }

  // Step 3: Fetch target page
  const targetUrl = args.path
    ? (args.path.startsWith("http") ? args.path : `${baseUrl}${args.path.startsWith("/") ? args.path : `/${args.path}`}`)
    : baseUrl

  let pageHtml   = ""
  let pageStatus = 0
  try {
    const r5 = await fetch(targetUrl, { headers: { "Cookie": cookieHeader(), "User-Agent": BROWSER_UA, "Referer": baseUrl }, signal: timeout(15000) })
    pageStatus = r5.status
    pageHtml   = await r5.text()
  } catch (e: any) {
    return { error: `Failed to load ${targetUrl}: ${e.message}` }
  }

  const text      = cleanHtml(pageHtml)
  const truncated = text.length > 12000

  // Quick login-success heuristic: if page still has login form, login probably failed
  const hasLoginForm = /<input[^>]+type=["']password["']/i.test(pageHtml)

  return {
    portal:      portal.name,
    url:         targetUrl,
    http_status: pageStatus,
    login_ok:    !hasLoginForm,
    content:     text.slice(0, 12000),
    truncated,
    hint: truncated
      ? "Content truncated at 12k chars. Use 'path' parameter to fetch a specific subpage for more focused data."
      : hasLoginForm
        ? "Login may have failed — page still shows a login form. Check credentials or try a different login_path."
        : null,
  }
}

async function runManagePortalCredentials(args: {
  action:     string
  name?:      string
  url?:       string
  username?:  string
  password?:  string
  login_path?: string
  notes?:     string
}): Promise<any> {
  const creds = await loadPortalCreds()

  if (args.action === "list") {
    if (!creds.length) return { message: "No portals configured yet.", portals: [] }
    return {
      portals: creds.map(c => ({ name: c.name, url: c.url, username: c.username, login_path: c.login_path, notes: c.notes })),
      count: creds.length,
    }
  }

  if (args.action === "save") {
    if (!args.name || !args.url || !args.username || !args.password) {
      return { error: "save requires: name, url, username, password" }
    }
    const idx  = creds.findIndex(c => c.name.toLowerCase() === args.name!.toLowerCase() || c.url === args.url)
    const cred: PortalCredential = {
      name:       args.name,
      url:        args.url.replace(/\/$/, ""),
      username:   args.username,
      password:   args.password,
      login_path: args.login_path,
      notes:      args.notes,
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

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runCreatorAI(
  geminiHistory: any[],
  lastMsg: string,
  fileContext?: FileContext
): Promise<{ text: string; sources: WebSource[] }> {
  const [partnerTierInfo, ga4SiteList] = await Promise.all([
    getPartnerTiers().then(tiers => {
      const lines = Object.entries(tiers).map(([tier, channels]) => `  ${tier}: ${(channels as string[]).join(", ")}`).join("\n")
      return lines ? `\n\n━━━ PARTNER TIERS (B2B từ Supabase) ━━━\n${lines}` : ""
    }).catch(() => ""),
    ga4Sites().then(sites => sites.length ? "\n\nGA4 SITES: " + sites.map(s => `${s.id}="${s.name}" (${s.propertyId})`).join(", ") : "").catch(() => ""),
  ])

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    systemInstruction: SYSTEM_PROMPT + partnerTierInfo + ga4SiteList,
    tools: [{ functionDeclarations: [executeSQLDecl, querySupabaseDecl, listTablesDecl, queryGA4Decl, queryGSCDecl, queryProductDecl, webSearchDecl, browsePortalDecl, managePortalCredsDecl] }],
    generationConfig: { temperature: 0 },
  })

  // Build user message parts — include file if attached
  let userParts: any[]
  const msgText = lastMsg || (fileContext ? `Phân tích file: ${fileContext.name}` : "")
  if (fileContext) {
    if (fileContext.type === "text") {
      // Inject text content (CSV, Excel, TXT, JSON) directly into the prompt
      const truncated = fileContext.content.length > 40000
        ? fileContext.content.slice(0, 40000) + "\n... [truncated at 40k chars]"
        : fileContext.content
      userParts = [{ text: `${msgText}\n\n=== FILE ĐÍNH KÈM: ${fileContext.name} ===\n${truncated}` }]
    } else {
      // PDF or image — send as inline data (Gemini multimodal)
      userParts = [
        { text: msgText },
        { inlineData: { mimeType: fileContext.mimeType || "application/octet-stream", data: fileContext.content } },
      ]
    }
  } else {
    userParts = [{ text: msgText }]
  }

  const contents: any[] = [
    ...geminiHistory,
    { role: "user", parts: userParts },
  ]

  let genResult = await model.generateContent({ contents })
  const collectedSources: WebSource[] = []

  function appendModelContent() {
    const content = genResult.response.candidates?.[0]?.content
    if (content) contents.push(content)
  }
  appendModelContent()

  // Function calling loop — max 20 iterations (quality > speed)
  for (let i = 0; i < 20; i++) {
    const calls = genResult.response.functionCalls()
    if (!calls || calls.length === 0) break

    const fnParts: any[] = []

    for (const call of calls) {
      // ── browsePortal ──
      if (call.name === "browsePortal") {
        console.log(`[CreatorAI] browsePortal: ${(call.args as any).portal_name}`)
        const resp = await runBrowsePortal(call.args as any)
        fnParts.push({ functionResponse: { name: "browsePortal", response: resp } })
        continue
      }

      // ── managePortalCredentials ──
      if (call.name === "managePortalCredentials") {
        const resp = await runManagePortalCredentials(call.args as any)
        fnParts.push({ functionResponse: { name: "managePortalCredentials", response: resp } })
        continue
      }

      // ── webSearch ──
      if (call.name === "webSearch") {
        const { query } = call.args as { query: string }
        console.log(`[CreatorAI] webSearch: ${query}`)
        const { result, sources } = await runWebSearch(query)
        collectedSources.push(...sources)
        const sourcesText = sources.length
          ? "\n\nSources:\n" + sources.map((s, i) => `[${i + 1}] ${s.title}: ${s.url}`).join("\n")
          : ""
        fnParts.push({ functionResponse: { name: "webSearch", response: {
          result: result + sourcesText,
          instruction: "MUST cite the source URLs listed above when using this information.",
        } } })
        continue
      }

      // ── listSupabaseTables ──
      if (call.name === "listSupabaseTables") {
        fnParts.push({ functionResponse: { name: "listSupabaseTables", response: { tables: ALL_TABLES } } })
        continue
      }

      // ── querySupabase ──
      if (call.name === "querySupabase") {
        const resp = await runQuerySupabase(call.args)
        fnParts.push({ functionResponse: { name: "querySupabase", response: resp } })
        continue
      }

      // ── queryGA4 ──
      if (call.name === "queryGA4") {
        try {
          const a = call.args as any
          const report = await runGA4Report({
            siteId: a.siteId, startDate: a.startDate, endDate: a.endDate,
            metrics: a.metrics || ["sessions"], dimensions: a.dimensions, limit: a.limit || 50,
          })
          const rows = (report.rows || []).slice(0, 100).map((r: any) => ({
            dimensions: r.dimensionValues?.map((d: any) => d.value),
            metrics:    r.metricValues?.map((m: any) => m.value),
          }))
          fnParts.push({ functionResponse: { name: "queryGA4", response: { rows, rowCount: report.rowCount } } })
        } catch (e: any) {
          fnParts.push({ functionResponse: { name: "queryGA4", response: { error: e.message } } })
        }
        continue
      }

      // ── queryGSC ──
      if (call.name === "queryGSC") {
        try {
          const a = call.args as any
          const rows = await runGSC(a.siteId, a.startDate, a.endDate, a.dimensions || ["query"], a.rowLimit || 20)
          fnParts.push({ functionResponse: { name: "queryGSC", response: { rows: rows.slice(0, 100) } } })
        } catch (e: any) {
          fnParts.push({ functionResponse: { name: "queryGSC", response: { error: e.message } } })
        }
        continue
      }

      // ── queryProduct ──
      if (call.name === "queryProduct") {
        try {
          const a = call.args as any
          const code: string = (a.sku_code || a.product_code || "").trim().toUpperCase()
          let prodResult: any = null
          if (code.length === 13) {
            const { data } = await supabaseAdmin.from("skus")
              .select("sku_code,product_code,tenant,status,sim_esim,data_amount,data_amount_unit,is_unlimited,is_daily,day_amount,throttle_speed,call,call_sms_details,hotspot,kyc_needed,operator_code,network_type,vendor_sku,latest_cogs,latest_cogs_currency,note")
              .eq("sku_code", code).maybeSingle()
            prodResult = data
          } else if (code.length === 8) {
            const { data } = await supabaseAdmin.from("products")
              .select("product_code,status,tenant,sim_esim,product_type,country_group,vendor")
              .eq("product_code", code).maybeSingle()
            prodResult = data
          }
          fnParts.push({ functionResponse: { name: "queryProduct", response: prodResult ?? { error: "Product not found" } } })
        } catch (e: any) {
          fnParts.push({ functionResponse: { name: "queryProduct", response: { error: e.message } } })
        }
        continue
      }

      // ── executeSQL ──
      if (call.name === "executeSQL") {
        const sql = (call.args as any)?.sql as string || ""
        const norm = sql.trim().toLowerCase()
        if (!norm.startsWith("select") && !norm.startsWith("with")) {
          fnParts.push({ functionResponse: { name: "executeSQL", response: { error: "Only SELECT and WITH queries are allowed." } } })
          continue
        }
        if (sql.includes(";") && sql.split(";").filter((s: string) => s.trim()).length > 1) {
          fnParts.push({ functionResponse: { name: "executeSQL", response: { error: "Multiple statements not allowed." } } })
          continue
        }
        try {
          console.log(`[CreatorAI] SQL: ${sql.substring(0, 200)}`)
          const rows = await queryAnalytics(sql)
          const limited = rows.slice(0, 200)
          const response: any = { result: limited, rowCount: rows.length }
          if (rows.length === 0) {
            response.hint = "0 rows. Check: (1) fulfiled_date::DATE cast (one 'l'), (2) ILIKE instead of =, (3) remove one filter at a time, (4) SELECT MAX(fulfiled_date::date) FROM fact_fulfillment_revenue to see latest date."
          }
          const firstRow = limited[0] as any
          if (firstRow) {
            const nums = Object.values(firstRow).filter(v => typeof v === "number" || (typeof v === "string" && !isNaN(Number(v)))).map(v => Number(v))
            if (nums.some(n => n > 1e13)) response.warning = "Some values appear unusually large (>10 trillion VND). Check for missing JOIN condition causing row multiplication."
            if (nums.some(n => n < 0 && sql.toLowerCase().includes("revenue"))) response.warning = "Some revenue values are negative — may indicate data issue or incorrect aggregation."
          }
          fnParts.push({ functionResponse: { name: "executeSQL", response } })
        } catch (err: any) {
          console.error("[CreatorAI] SQL error:", err.message)
          fnParts.push({ functionResponse: { name: "executeSQL", response: {
            error: err.message,
            fix_hint: "Fix the SQL error and retry immediately. Common causes: wrong column name (query information_schema.columns to check), missing ::DATE cast on fulfiled_date, using sku_code instead of sku in dim_sku.",
          } } })
        }
        continue
      }

      fnParts.push({ functionResponse: { name: call.name, response: { error: "Unknown tool" } } })
    }

    // Send function responses as role "user" — required by gemini-3.6-flash
    contents.push({ role: "user", parts: fnParts })
    genResult = await model.generateContent({ contents })
    appendModelContent()
  }

  // Ensure non-empty response
  let text = genResult.response.text()
  if (!text.trim()) {
    try {
      contents.push({ role: "user", parts: [{ text: "Based on the data retrieved above, write a complete, detailed answer in Vietnamese. Include a markdown table or chart if the data is tabular. DO NOT call any more tools." }] })
      genResult = await model.generateContent({ contents })
      text = genResult.response.text()
    } catch { /* keep empty */ }
  }

  return { text: text || "Không có dữ liệu trả về.", sources: collectedSources }
}
