import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"
import { queryAnalytics }                 from "@/lib/analytics-db"
import { getPartnerTiers }               from "@/lib/analytics-helpers"
import { supabaseAdmin }                   from "@/lib/supabase"
import { runGA4Report, runGSC, ga4Sites } from "@/lib/ga4"
import { getCustomRules }                 from "@/lib/agents/guardian"

// Role data filter: cấp quản lý (admin/creator/manager/bod) không giới hạn dữ liệu.
// Các role khác (staff/dept) đọc directive từ app_settings.role_filters.
export async function getRoleDataFilter(role?: string): Promise<string> {
  if (!role || ["admin", "creator", "manager", "bod"].includes(role)) return ""
  try {
    const { data } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", "role_filters").maybeSingle()
    const filters = data?.value ? JSON.parse(data.value) : {}
    return (filters[role] as string) || ""
  } catch {
    return ""
  }
}

// ─── BI Analyst: Gemini function calling với gohub_dw ────────────────────────
// Dùng chung cho cả web chatbot (/api/chat) và Lark bot (/api/lark/events).

const executeSQLDecl = {
  name: "executeSQL",
  description: "Execute a SELECT SQL query on gohub_dw PostgreSQL database and return results. Use this to answer business analytics questions.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      sql: {
        type: SchemaType.STRING,
        description: "The SQL SELECT query to execute. Only SELECT and WITH queries are allowed.",
      },
    },
    required: ["sql"],
  },
}

const queryGA4Decl = {
  name: "queryGA4",
  description: "Query Google Analytics 4 (GA4) for website traffic data: sessions, users, pageviews, purchases, revenue, bounce rate, conversion rate. Use for questions about website performance.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      startDate: { type: SchemaType.STRING, description: "Start date in YYYY-MM-DD format or relative like '30daysAgo'" },
      endDate:   { type: SchemaType.STRING, description: "End date in YYYY-MM-DD format or 'today'" },
      metrics:   { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "GA4 metric names, e.g. ['sessions','activeUsers','purchaseRevenue','ecommercePurchases','conversions']" },
      dimensions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "GA4 dimension names, e.g. ['date','country','sessionSourceMedium','itemName']" },
      siteId:    { type: SchemaType.STRING, description: "Site ID (optional, defaults to first configured site)" },
      limit:     { type: SchemaType.NUMBER, description: "Max rows to return (default 50)" },
    },
    required: ["startDate", "endDate", "metrics"],
  },
}

const queryGSCDecl = {
  name: "queryGSC",
  description: "Query Google Search Console (GSC) for organic search data: clicks, impressions, CTR, average position, top keywords. Use for SEO and search performance questions.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      startDate:  { type: SchemaType.STRING, description: "Start date YYYY-MM-DD" },
      endDate:    { type: SchemaType.STRING, description: "End date YYYY-MM-DD" },
      dimensions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Dimensions: ['query'], ['date'], or ['query','date']" },
      siteId:     { type: SchemaType.STRING, description: "Site ID (optional)" },
      rowLimit:   { type: SchemaType.NUMBER, description: "Max rows (default 20)" },
    },
    required: ["startDate", "endDate"],
  },
}

// queryProduct: tra cứu chi tiết SKU/product từ Supabase (COGS, thuộc tính)
// Dùng khi câu hỏi BI cần kết hợp dữ liệu phân tích (gohub_dw) với thông tin sản phẩm (Supabase).
const queryProductDecl = {
  name: "queryProduct",
  description: "Look up SKU or product details from GoHub product catalog (Supabase). Use when a BI question needs product attributes like COGS, throttle speed, call support, or vendor info that is not in gohub_dw. Input: sku_code (13 chars) OR product_code (8 chars).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      sku_code:     { type: SchemaType.STRING, description: "13-character SKU code (e.g. 1CJPNWM10014)" },
      product_code: { type: SchemaType.STRING, description: "8-character product code (e.g. 1CJPNWM1)" },
    },
  },
}

export async function runBIAnalyst(
  systemInstruction: string,
  geminiHistory: any[],
  lastMsg: string,
  role?: string
): Promise<string> {
  // Role data filter + custom admin rules
  const [dataFilter, customRules] = await Promise.all([getRoleDataFilter(role), getCustomRules()])
  let finalInstruction = dataFilter
    ? `${systemInstruction}\n\n━━━ GIỚI HẠN TRUY CẬP DỮ LIỆU ━━━\nVai trò "${role}" CHỈ được xem dữ liệu thỏa điều kiện sau — BẮT BUỘC thêm vào MỌI SQL WHERE:\n${dataFilter}`
    : systemInstruction
  if (customRules) {
    finalInstruction += `\n\n━━━ HƯỚNG DẪN TÙY CHỈNH CỦA ADMIN ━━━\n${customRules}`
  }

  // Load GA4 sites + partner tiers để inject vào system prompt
  let ga4SiteList = ""
  try {
    const sites = await ga4Sites()
    if (sites.length) ga4SiteList = "\n\nGA4 SITES: " + sites.map(s => `${s.id}="${s.name}" (${s.propertyId})`).join(", ")
  } catch {}

  // Inject danh sách partner tiers THỰC TẾ (không hardcode) để bot biết ai là B2B-Strategic
  let partnerTierInfo = ""
  try {
    const tiers = await getPartnerTiers()
    const tierLines = Object.entries(tiers)
      .map(([tier, channels]) => `  ${tier}: ${(channels as string[]).join(", ")}`)
      .join("\n")
    if (tierLines) {
      partnerTierInfo = `\n\n━━━ PARTNER TIERS (B2B) ━━━\nDanh sách kênh theo tier — dùng để phân loại B2B-Strategic vs B2B-Non-Strategic:\n${tierLines}\nKhi JOIN với gohub_dw: B2B-Strategic = channel_name ILIKE ANY(ARRAY[${Object.entries(tiers).find(([k]) => k === "Strategic")?.[1]?.map((c: string) => `'%${c}%'`).join(",") || "''"}])`
    }
  } catch {}

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    systemInstruction: finalInstruction + ga4SiteList + partnerTierInfo,
    tools: [{ functionDeclarations: [executeSQLDecl, queryGA4Decl, queryGSCDecl, queryProductDecl] }],
    generationConfig: { temperature: 0 },
  })

  // Build conversation contents manually — bypass SDK chat API which sends role "function"
  // (not supported by gemini-3.6-flash). We send function responses as role "user" instead.
  const contents: any[] = [
    ...geminiHistory,
    { role: "user", parts: [{ text: lastMsg }] },
  ]

  let genResult = await model.generateContent({ contents })
  let anyToolCall = false

  // Append model response to history so subsequent calls see the full context.
  function appendModelContent() {
    const content = genResult.response.candidates?.[0]?.content
    if (content) contents.push(content)
  }
  appendModelContent()

  // Function calling loop — max 12 iterations (12 cho báo cáo phức tạp: 5 query + YoY + retry).
  async function processToolCalls() {
    for (let i = 0; i < 12; i++) {
      const calls = genResult.response.functionCalls()
      if (!calls || calls.length === 0) break
      anyToolCall = true

      const fnParts: any[] = []

      for (const call of calls) {
        if (call.name === "queryGA4") {
          try {
            const a = call.args as any
            const report = await runGA4Report({
              siteId: a.siteId, startDate: a.startDate, endDate: a.endDate,
              metrics: a.metrics || ["sessions"], dimensions: a.dimensions, limit: a.limit || 50,
            })
            const rows = (report.rows || []).slice(0, 50).map(r => ({
              dimensions: r.dimensionValues?.map((d: any) => d.value),
              metrics:    r.metricValues?.map((m: any) => m.value),
            }))
            fnParts.push({ functionResponse: { name: "queryGA4", response: { rows, rowCount: report.rowCount } } })
          } catch (e: any) {
            fnParts.push({ functionResponse: { name: "queryGA4", response: { error: e.message } } })
          }
          continue
        }

        if (call.name === "queryGSC") {
          try {
            const a = call.args as any
            const rows = await runGSC(a.siteId, a.startDate, a.endDate, a.dimensions || ["query"], a.rowLimit || 20)
            fnParts.push({ functionResponse: { name: "queryGSC", response: { rows: rows.slice(0, 50) } } })
          } catch (e: any) {
            fnParts.push({ functionResponse: { name: "queryGSC", response: { error: e.message } } })
          }
          continue
        }

        if (call.name === "queryProduct") {
          try {
            const a = call.args as any
            const code: string = (a.sku_code || a.product_code || "").trim().toUpperCase()
            let prodResult: any = null
            if (code.length === 13) {
              const { data } = await supabaseAdmin.from("skus")
                .select("sku_code,sku_ref,product_code,tenant,status,sim_esim,data_amount,data_amount_unit,is_unlimited,is_daily,day_amount,day_amount_unit,parents,frame,datapack,throttle_speed,call,call_sms_details,hotspot,kyc_needed,operator_code,network_type,vendor_sku,vendor_sku_sim,latest_cogs,latest_cogs_currency,original_cost,reference_cost_vnd,final_cogs_included_vat_vnd,final_cogs_usd,expirations,wr_group,note")
                .eq("sku_code", code).maybeSingle()
              prodResult = data
            } else if (code.length === 8) {
              const { data } = await supabaseAdmin.from("products")
                .select("product_code,product_ref,status,tenant,sim_esim,product_type,vendor,vendor_code,data_policy_code,gc_purchase_type,sku_type,data_type,import_type,supported_countries,country_group,daily_reset_time,activation_time,network_type,onsite_carrier,local_phone_number,local_number_country,hotspot,kyc_code,kyc_needed,top_up_options,base_sim_esim_sku_code,apn,apn_original,telco_perks,note")
                .eq("product_code", code).maybeSingle()
              prodResult = data
            }
            fnParts.push({ functionResponse: { name: "queryProduct", response: prodResult ?? { error: "Không tìm thấy sản phẩm" } } })
          } catch (e: any) {
            fnParts.push({ functionResponse: { name: "queryProduct", response: { error: e.message } } })
          }
          continue
        }

        if (call.name !== "executeSQL") {
          fnParts.push({ functionResponse: { name: call.name, response: { error: "Unknown tool" } } })
          continue
        }

        const sql = (call.args as any)?.sql as string || ""
        const normalizedSql = sql.trim().toLowerCase()

        if (!normalizedSql.startsWith("select") && !normalizedSql.startsWith("with")) {
          fnParts.push({ functionResponse: { name: "executeSQL", response: { error: "Only SELECT and WITH queries are allowed." } } })
          continue
        }
        if (sql.includes(";") && sql.split(";").filter((s: string) => s.trim()).length > 1) {
          fnParts.push({ functionResponse: { name: "executeSQL", response: { error: "Multiple statements are not allowed." } } })
          continue
        }

        try {
          console.log(`[BI] SQL: ${sql.substring(0, 120)}`)
          const rows = await queryAnalytics(sql)
          const limited = rows.slice(0, 100)
          const response: any = { result: limited, rowCount: rows.length }
          if (rows.length === 0) {
            response.hint = "Query returned 0 rows. Before concluding 'no data': (1) verify fulfiled_date::DATE cast and date range, (2) try ILIKE instead of =, (3) remove one filter at a time to narrow the cause, (4) run SELECT MAX(fulfiled_date::date) FROM fact_fulfillment_revenue to check latest available date."
          }
          const firstRow = limited[0] as any
          if (firstRow) {
            const nums = Object.values(firstRow)
              .filter(v => typeof v === "number" || (typeof v === "string" && !isNaN(Number(v))))
              .map(v => Number(v))
            if (nums.some(n => n < 0 && sql.toLowerCase().includes("revenue")))
              response.warning = "Some revenue values are negative — this may indicate a data issue or incorrect aggregation. Please verify the query logic."
            if (nums.some(n => n > 1e13))
              response.warning = "Some values appear unusually large (>10 trillion VND). Check for missing JOIN conditions causing row multiplication."
          }
          fnParts.push({ functionResponse: { name: "executeSQL", response } })
        } catch (err: any) {
          console.error("[BI] SQL error:", err.message)
          fnParts.push({ functionResponse: { name: "executeSQL", response: {
            error: err.message,
            fix_hint: "Fix the SQL error above and call executeSQL again immediately. Common causes: wrong column name, missing ::DATE cast, invalid alias in GROUP BY, wrong table name.",
          } } })
        }
      }

      // Send function responses as role "user" — required by gemini-3.6-flash (not "function")
      contents.push({ role: "user", parts: fnParts })
      genResult = await model.generateContent({ contents })
      appendModelContent()
    }
  }

  await processToolCalls()

  // Nudge if model promised to query but never called a tool (Vietnamese punt patterns).
  const PUNT_RE = /chưa kịp|để (tôi|mình|hệ thống)[^.!?]{0,25}(truy vấn|quét)|phản hồi lại để[^.!?]{0,40}(truy vấn|quét)|sẽ (tiến hành )?truy vấn|chưa (thực hiện|tiến hành)[^.!?]{0,20}(truy vấn|quét|câu lệnh)/i
  if (!anyToolCall && PUNT_RE.test(genResult.response.text())) {
    try {
      contents.push({ role: "user", parts: [{ text: "You HAVE the executeSQL tool and ARE PERMITTED to query gohub_dw RIGHT NOW. DO NOT promise 'I will query' or ask the user to follow up. CALL executeSQL immediately to get real data and return a complete answer." }] })
      genResult = await model.generateContent({ contents })
      appendModelContent()
      await processToolCalls()
    } catch { /* keep as-is */ }
  }

  // Guard against empty text after function calling loop ends without generating output.
  let text = genResult.response.text()
  if (!text.trim()) {
    try {
      contents.push({ role: "user", parts: [{ text: "Based on the query results above, write a complete answer in Vietnamese for the user (include numbers, markdown table if needed). DO NOT call any more tools." }] })
      genResult = await model.generateContent({ contents })
      text = genResult.response.text()
    } catch { /* keep empty */ }
  }
  return text
}
