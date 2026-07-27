import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"
import { queryAnalytics }                 from "@/lib/analytics-db"
import { supabaseAdmin }                   from "@/lib/supabase"
import { getRoleDataFilter }               from "./bi-analyst"

// ─── Data Explorer Agent ─────────────────────────────────────────────────────
// Agent truy xuất DỮ LIỆU THÔ toàn hệ thống: gohub_dw (Postgres, SELECT tự do) +
// Supabase (REST select có cấu trúc). Mục tiêu: trả nhanh câu hỏi "có bao nhiêu",
// "liệt kê", "tra bảng X", báo cáo nhanh — không cần user vào đúng tab.
//
// GUARDIAN / phân quyền (defense-in-depth, ngoài guardCheck ở tầng message):
//   · Bảng NHẠY CẢM (users/app_settings/hội thoại/PII/ticket) → CHỈ admin|creator.
//   · Cột giá vốn (cogs/cost) bị lược khỏi kết quả nếu role không có quyền xem COGS (isCost=false).
//   · Role không phải admin → chèn role_filters (giống bi-analyst) vào MỌI SQL gohub_dw.

// Danh mục bảng Supabase (nguồn từ PostgREST — 40 bảng). Chỉ những bảng liệt kê ở đây mới query được.
export const SUPABASE_TABLES: Record<string, string> = {
  // Sản phẩm / catalog GoHub
  products:               "Sản phẩm (product_code 8 ký tự, tenant, status, vendor_code, product_type, type_of_sim, supported_countries, hotspot, kyc_needed, telco_perks)",
  skus:                   "SKU (sku_code 13 ký tự, product_code, status, sim_esim, data_amount, day_amount, call, throttle_speed, latest_cogs, latest_cogs_currency)",
  listings:               "Bảng giá hiển thị web B2C (listing_code, status, listing_name_en/vn, data_type_en, category_code, network_operator)",
  items:                  "Item bán (item_code 18 ký tự, alias, sku_code, unitprice, currency, sales_channel, status)",
  sku_catalog:            "Danh mục SKU tra nhanh (mã nhóm nước → SKU active)",
  // NCC (nhà cung cấp)
  ncc_worldmove:          "Catalog WorldMove (WM) — gói vendor, exist=Yes/No so với GoHub",
  ncc_3hk:                "Catalog 3HK — zone + giá HKD/GB",
  ncc_datapool:           "3HK Datapool (mã, throttle_speed, country)",
  ncc_products_unified:   "Catalog NCC hợp nhất",
  ncc_vendor_config:      "Cấu hình vendor NCC",
  data_file_registry:     "Đăng ký file dữ liệu NCC đã import",
  // Nước / tham chiếu
  ref_countries:          "Danh mục nước (ISO, tên VN/EN)",
  ref_categories:         "Nhóm nước/category (mã 3 ký tự, multi-country)",
  ref_support_countries:  "Mã nhóm nước hỗ trợ (group code → nước)",
  ref_vendors:            "Danh mục vendor",
  // KB / Wiki
  kb_wiki_pages:          "Trang wiki nội bộ (title, content, version)",
  kb_wiki_versions:       "Lịch sử version wiki",
  kb_documents:           "Tài liệu KB đã upload",
  kb_chunks:              "Chunk + embedding KB (không trả embedding)",
  // Analytics config / cache (KHÔNG phải fact — fact ở gohub_dw)
  analytics_monthly_kpis:        "Snapshot KPI tháng: revenue, gross_margin, op_cost, cm1, cm1_pct, hk3_revenue, hk3_pct — theo tháng (YYYY-MM) và company_code (ALL/VN/US). Dùng khi hỏi về CM1, doanh thu, GP tháng cụ thể.",
  analytics_channel_costs:       "Chi phí theo kênh (opCost) — cấu hình",
  analytics_channel_group_costs: "Chi phí theo nhóm kênh",
  analytics_target_planning:     "Kế hoạch target (planning)",
  analytics_cost_input_settings: "Cấu hình nhập chi phí",
  analytics_feedbacks:           "Feedback người dùng trên trang analytics",
  b2c_report_monthly_snapshots:  "Snapshot báo cáo B2C theo tháng (payload jsonb)",
  analytics_scheduled_messages:  "Lịch gửi tin Lark (analytics)",
  lark_scheduled_messages:       "Lịch gửi tin Lark",
  sync_log:               "Log đồng bộ dữ liệu",
}

// Bảng nhạy cảm (PII / auth / hội thoại / nội bộ) — CHỈ admin & creator.
export const SENSITIVE_TABLES: Record<string, string> = {
  users:                  "Tài khoản người dùng (auth, PII)",
  app_settings:           "Cấu hình hệ thống (chứa policy/secret)",
  conversations:          "Hội thoại chatbot (PII)",
  chat_messages:          "Tin nhắn chatbot (PII)",
  analytics_conversations:"Hội thoại BI (PII)",
  analytics_messages:     "Tin nhắn BI (PII)",
  lark_chat_history:      "Lịch sử chat Lark (PII)",
  lark_cs_tickets:        "Ticket CS từ Lark (PII khách hàng)",
  notifications:          "Thông báo người dùng",
  user_notes:             "Ghi chú cá nhân người dùng",
}

// Cột giá vốn — lược khỏi kết quả khi role không có quyền xem COGS.
const COGS_COL_RE = /cogs|cost_price|unit_cost|standard_cost|latest_cogs/i
// Cột embedding (vector rất dài) — LUÔN lược khỏi kết quả để tránh tràn token.
const HEAVY_COL_RE = /embedding|vector/i

function isPrivileged(role?: string) {
  const r = (role || "").toLowerCase()
  // admin/creator/manager/bod: toàn quyền truy cập dữ liệu (nhất quán với Guardian DEFAULT_POLICY)
  return r === "admin" || r === "creator" || r === "manager" || r === "bod"
}

// ─── Tool declarations ───────────────────────────────────────────────────────
const executeSQLDecl = {
  name: "executeSQL",
  description: "Chạy 1 câu SELECT/WITH trên kho phân tích gohub_dw (PostgreSQL) — fact doanh thu/đơn/usage + dim. Dùng cho số liệu tổng hợp/report.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: { sql: { type: SchemaType.STRING, description: "Câu SELECT hoặc WITH (chỉ đọc)." } },
    required: ["sql"],
  },
}

const querySupabaseDecl = {
  name: "querySupabase",
  description: "Đọc dữ liệu từ 1 bảng Supabase (sản phẩm/SKU/listing/item/NCC/KB/ref/config). Dùng khi câu hỏi về catalog, sản phẩm, wiki, NCC, cấu hình — KHÔNG phải fact doanh thu.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      table:   { type: SchemaType.STRING, description: "Tên bảng (xem listSupabaseTables)." },
      columns: { type: SchemaType.STRING, description: "Danh sách cột, phân cách phẩy (mặc định '*'). VD 'sku_code,status,data_amount'." },
      filters: {
        type: SchemaType.ARRAY,
        description: "Điều kiện lọc. Mỗi phần tử {column, op, value}. op ∈ eq,neq,gt,gte,lt,lte,like,ilike,in,is.",
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
      order:     { type: SchemaType.STRING, description: "Cột sắp xếp (tuỳ chọn)." },
      ascending: { type: SchemaType.BOOLEAN, description: "Sắp tăng dần (mặc định false = giảm dần)." },
      limit:     { type: SchemaType.NUMBER, description: "Số dòng tối đa (mặc định 50, trần 200)." },
      countOnly: { type: SchemaType.BOOLEAN, description: "true = chỉ đếm tổng số dòng khớp, không trả dữ liệu." },
    },
    required: ["table"],
  },
}

const listTablesDecl = {
  name: "listSupabaseTables",
  description: "Liệt kê các bảng Supabase có thể truy vấn (kèm mô tả) theo quyền của người dùng hiện tại.",
  parameters: { type: SchemaType.OBJECT, properties: {} },
}

const ALLOWED_OPS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is"])

async function runQuerySupabase(args: any, role: string, isCost: boolean): Promise<any> {
  const table: string = String(args?.table || "").trim()
  const priv = isPrivileged(role)

  // Governance: bảng phải nằm trong danh mục; bảng nhạy cảm chỉ admin/creator.
  if (SENSITIVE_TABLES[table] && !priv) {
    return { error: `Bảng "${table}" thuộc nhóm hạn chế (chỉ admin/creator được xem).` }
  }
  if (!SUPABASE_TABLES[table] && !(SENSITIVE_TABLES[table] && priv)) {
    return { error: `Bảng "${table}" không truy vấn được. Gọi listSupabaseTables để xem danh sách hợp lệ.` }
  }

  const columns   = (args?.columns && String(args.columns).trim()) || "*"
  const limit     = Math.min(Math.max(parseInt(args?.limit) || 50, 1), 200)
  const countOnly = args?.countOnly === true

  try {
    // any: PostgREST builder chaining làm bung kiểu (TS2589) — dùng any cho vòng lọc động.
    let q: any = supabaseAdmin.from(table).select(countOnly ? "*" : columns, { count: "exact", head: countOnly })

    if (Array.isArray(args?.filters)) {
      for (const f of args.filters) {
        const op = String(f?.op || "").toLowerCase()
        if (!ALLOWED_OPS.has(op) || !f?.column) continue
        if (op === "in") {
          const list = String(f.value).split(",").map((s: string) => s.trim())
          q = q.in(f.column, list)
        } else if (op === "is") {
          q = q.is(f.column, f.value === "null" ? null : f.value)
        } else {
          q = q.filter(f.column, op, f.value)
        }
      }
    }

    if (!countOnly) {
      if (args?.order) q = q.order(String(args.order), { ascending: args?.ascending === true })
      q = q.limit(limit)
    }

    const { data, count, error } = await q
    if (error) return { error: error.message }
    if (countOnly) return { count }

    // Lược cột nặng (embedding) LUÔN; lược cột giá vốn nếu role không có quyền xem COGS.
    let rows = (data as any[]) || []
    const stripCogs = !isCost && !priv
    if (rows.length) {
      rows = rows.map((r) => {
        const clone: any = {}
        for (const k of Object.keys(r)) {
          if (HEAVY_COL_RE.test(k)) continue
          if (stripCogs && COGS_COL_RE.test(k)) continue
          clone[k] = r[k]
        }
        return clone
      })
    }
    return { rows, rowCount: rows.length, total: count }
  } catch (e: any) {
    return { error: e.message }
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────
export async function runDataExplorer(
  systemInstruction: string,
  geminiHistory: any[],
  lastMsg: string,
  role?: string,
  isCost: boolean = false,
): Promise<string> {
  const priv = isPrivileged(role)

  // Role data filter (non-admin) cho gohub_dw — giống bi-analyst.
  const dataFilter = await getRoleDataFilter(role)

  // Danh mục bảng theo quyền (đưa vào prompt để agent biết chọn bảng).
  const visibleTables = { ...SUPABASE_TABLES, ...(priv ? SENSITIVE_TABLES : {}) }
  const tableCatalog = Object.entries(visibleTables).map(([t, d]) => `  · ${t}: ${d}`).join("\n")

  const finalInstruction = [
    systemInstruction,
    `\n\n━━━ SUPABASE TABLE CATALOG (querySupabase) ━━━\n${tableCatalog}`,
    dataFilter
      ? `\n\n━━━ DATA ACCESS RESTRICTION (role "${role}") ━━━\nALL gohub_dw SQL MUST include the following WHERE condition — do not omit:\n${dataFilter}`
      : "",
    !isCost && !priv ? `\n\n⚠️ Current role CANNOT view COGS/cost columns. Do not return cost columns even if user requests them.` : "",
  ].join("")

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: finalInstruction,
    tools: [{ functionDeclarations: [executeSQLDecl, querySupabaseDecl, listTablesDecl] }],
    generationConfig: { temperature: 0 },
  })

  const chat = model.startChat({ history: geminiHistory })
  let result = await chat.sendMessage(lastMsg)

  for (let i = 0; i < 10; i++) {
    const calls = result.response.functionCalls()
    if (!calls || calls.length === 0) break
    const parts: any[] = []

    for (const call of calls) {
      if (call.name === "listSupabaseTables") {
        parts.push({ functionResponse: { name: call.name, response: { tables: visibleTables } } })
        continue
      }

      if (call.name === "querySupabase") {
        const resp = await runQuerySupabase(call.args, role || "staff", isCost)
        parts.push({ functionResponse: { name: "querySupabase", response: resp } })
        continue
      }

      if (call.name === "executeSQL") {
        const sql = ((call.args as any)?.sql as string) || ""
        const norm = sql.trim().toLowerCase()
        if (!norm.startsWith("select") && !norm.startsWith("with")) {
          parts.push({ functionResponse: { name: "executeSQL", response: { error: "Only SELECT / WITH queries are allowed." } } })
          continue
        }
        if (sql.includes(";") && sql.split(";").filter((s) => s.trim()).length > 1) {
          parts.push({ functionResponse: { name: "executeSQL", response: { error: "Multiple statements are not allowed." } } })
          continue
        }
        try {
          console.log(`[DataExplorer] SQL: ${sql.substring(0, 120)}`)
          const rows = await queryAnalytics(sql)
          parts.push({ functionResponse: { name: "executeSQL", response: { result: rows.slice(0, 100), rowCount: rows.length } } })
        } catch (err: any) {
          parts.push({ functionResponse: { name: "executeSQL", response: { error: err.message } } })
        }
        continue
      }

      parts.push({ functionResponse: { name: call.name, response: { error: "Unknown tool" } } })
    }

    result = await chat.sendMessage(parts)
  }

  // Guard against empty text — Gemini sometimes ends tool-calling without generating output text.
  let text = result.response.text()
  if (!text.trim()) {
    try {
      const followup = await chat.sendMessage(
        "Based on the query results above, write a complete answer in Vietnamese for the user (include a markdown table if needed). DO NOT call any more tools."
      )
      text = followup.response.text()
    } catch { /* keep empty */ }
  }
  return text
}
