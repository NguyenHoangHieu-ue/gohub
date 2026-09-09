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
  products:               "Sản phẩm (product_code 8 ký tự, product_ref, tenant, status, type_of_sim, product_type, vendor_code, data_policy_code, gc_purchase_type, sku_type, data_type, import_type, supported_countries, daily_reset_time, activation_time, network_type, onsite_carrier, hotspot, kyc_code, kyc_needed, top_up_options, local_phone_number, local_number_country, apn, apn_original, telco_perks, note)",
  skus:                   "SKU (sku_code 13 ký tự, sku_ref, product_code, status, sim_esim, data_amount, data_amount_unit, day_amount, day_amount_unit, parents, frame, datapack, call, call_sms_details, throttle_speed, hotspot, expirations, vendor_sku, vendor_sku_sim, latest_cogs, latest_cogs_currency, original_cost, reference_cost_vnd, final_cogs_included_vat_vnd, final_cogs_usd, network_type, operator_code, kyc_needed, wr_group, note)",
  listings:               "Bảng giá hiển thị web B2C (listing_code, listing_ref, reference_product_code, status, listing_name_en/vn, listing_type, type_of_sim, vendor_code, support_country_code, data_type_en/vn, esim_type_en/vn, category_code, network_operator, daily_reset_time_en/vn, activation_time_en/vn, network_type, hotspot_en/vn, kyc_needed_en/vn, expirations_en/vn, top_up_options_en/vn, special_activation_required_en/vn, call_en/vn, call_sms_details_en/vn, local_phone_number_en/vn, local_phone_number_country, note_en/vn, apn, supported_country_name_en/vn, category_name_en/vn)",
  items:                  "Item bán B2B/WS (item_code 18 ký tự, item_ref, alias, sku_code, listing_code, category_code, status, item_type, item_name_en/vn, price_list, pricelistcode, channel, day_amount, day_amount_unit, data_amount, data_amount_unit, throttle_speed_en/vn, call_en/vn, call_sms_details_en/vn, unitprice, currency, sales_channel) — chỉ parent rows",
  sku_catalog:            "Danh mục SKU tra nhanh (mã nhóm nước → SKU active)",
  items_itn:              "Item nội bộ ITN (internal price list type=itn): item_code, alias, alias_status, sku_code, listing_code, category_code, status, price_list, item_name_en/vn, day_amount/unit, data_amount/unit, throttle_speed, call fields, final_retail_price_vnd/usd, old_price_vnd/usd, final_margin_usd/vnd, cogs_not_include_vat, vat, final_cogs_included_vat, exchange_rate_usd, visibility, unitprice, currency",
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

export async function runQuerySupabase(args: any, role: string, isCost: boolean): Promise<any> {
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
    model: "gemini-3.6-flash",
    systemInstruction: finalInstruction,
    tools: [{ functionDeclarations: [executeSQLDecl, querySupabaseDecl, listTablesDecl] }],
    generationConfig: { temperature: 0 },
  })

  // Build contents manually — send function responses as role "user" (gemini-3.6-flash format)
  const contents: any[] = [
    ...geminiHistory,
    { role: "user", parts: [{ text: lastMsg }] },
  ]

  let genResult = await model.generateContent({ contents })

  function appendModelContent() {
    const content = genResult.response.candidates?.[0]?.content
    if (content) contents.push(content)
  }
  appendModelContent()

  for (let i = 0; i < 10; i++) {
    const calls = genResult.response.functionCalls()
    if (!calls || calls.length === 0) break
    const fnParts: any[] = []

    for (const call of calls) {
      if (call.name === "listSupabaseTables") {
        fnParts.push({ functionResponse: { name: call.name, response: { tables: visibleTables } } })
        continue
      }

      if (call.name === "querySupabase") {
        const resp = await runQuerySupabase(call.args, role || "staff", isCost)
        fnParts.push({ functionResponse: { name: "querySupabase", response: resp } })
        continue
      }

      if (call.name === "executeSQL") {
        const sql = ((call.args as any)?.sql as string) || ""
        const norm = sql.trim().toLowerCase()
        if (!norm.startsWith("select") && !norm.startsWith("with")) {
          fnParts.push({ functionResponse: { name: "executeSQL", response: { error: "Only SELECT / WITH queries are allowed." } } })
          continue
        }
        if (sql.includes(";") && sql.split(";").filter((s) => s.trim()).length > 1) {
          fnParts.push({ functionResponse: { name: "executeSQL", response: { error: "Multiple statements are not allowed." } } })
          continue
        }
        try {
          console.log(`[DataExplorer] SQL: ${sql.substring(0, 120)}`)
          const rows = await queryAnalytics(sql)
          const limited = rows.slice(0, 100)
          const response: any = { result: limited, rowCount: rows.length }
          if (rows.length === 0) {
            response.hint = "0 rows. Try: (1) check fulfiled_date::DATE cast, (2) ILIKE instead of =, (3) remove one filter, (4) SELECT MAX(fulfiled_date::date) FROM fact_fulfillment_revenue."
          }
          const firstRow = limited[0] as any
          if (firstRow) {
            const nums = Object.values(firstRow).filter(v => typeof v === "number" || (typeof v === "string" && !isNaN(Number(v)))).map(v => Number(v))
            if (nums.some(n => n > 1e13)) response.warning = "Some values appear unusually large (>10 trillion). Check for missing JOIN condition causing row multiplication."
          }
          fnParts.push({ functionResponse: { name: "executeSQL", response } })
        } catch (err: any) {
          fnParts.push({ functionResponse: { name: "executeSQL", response: {
            error: err.message,
            fix_hint: "Fix the SQL error and call executeSQL again. Common: wrong column name (query information_schema.columns), missing ::DATE cast, alias in GROUP BY (use position number instead).",
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

  // Guard against empty text after function calling loop ends without generating output text.
  let text = genResult.response.text()
  if (!text.trim()) {
    try {
      contents.push({ role: "user", parts: [{ text: "Based on the query results above, write a complete answer in Vietnamese for the user (include a markdown table if needed). DO NOT call any more tools." }] })
      genResult = await model.generateContent({ contents })
      text = genResult.response.text()
    } catch { /* keep empty */ }
  }
  return text
}
