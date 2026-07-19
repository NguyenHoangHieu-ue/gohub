import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"
import { queryAnalytics }                 from "@/lib/analytics-db"
import { getPartnerTiers }               from "@/lib/analytics-helpers"
import { supabaseAdmin }                   from "@/lib/supabase"
import { runGA4Report, runGSC, ga4Sites } from "@/lib/ga4"

// Role data filter: admin không giới hạn; role khác lấy directive từ app_settings.role_filters
export async function getRoleDataFilter(role?: string): Promise<string> {
  if (!role || role === "admin") return ""
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
  // Role data filter (non-admin): chèn directive giới hạn dữ liệu vào prompt
  const dataFilter = await getRoleDataFilter(role)
  const finalInstruction = dataFilter
    ? `${systemInstruction}\n\n━━━ GIỚI HẠN TRUY CẬP DỮ LIỆU (DATA ACCESS RESTRICTION) ━━━\nVai trò "${role}" CHỈ được xem dữ liệu thỏa điều kiện sau — BẮT BUỘC thêm điều kiện này vào MỌI câu SQL (WHERE), không được bỏ qua:\n${dataFilter}`
    : systemInstruction

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
    model: "gemini-3.5-flash",
    systemInstruction: finalInstruction + ga4SiteList + partnerTierInfo,
    tools: [{ functionDeclarations: [executeSQLDecl, queryGA4Decl, queryGSCDecl, queryProductDecl] }],
    // temperature 0 → SQL ổn định, bám số liệu, hạn chế bịa (quan trọng cho báo cáo tài chính)
    generationConfig: { temperature: 0 },
  })

  const chat = model.startChat({ history: geminiHistory })
  let result = await chat.sendMessage(lastMsg)
  let anyToolCall = false

  // Function calling loop — max 10 iterations (query so sánh nhiều kỳ / WoW cần nhiều lượt tool).
  // Tách thành hàm để có thể CHẠY LẠI sau khi nudge (chống bi "hứa sẽ truy vấn" mà không gọi tool).
  async function processToolCalls() {
   for (let i = 0; i < 10; i++) {
    const calls = result.response.functionCalls()
    if (!calls || calls.length === 0) break
    anyToolCall = true

    const parts: any[] = []

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
            metrics: r.metricValues?.map((m: any) => m.value),
          }))
          parts.push({ functionResponse: { name: "queryGA4", response: { rows, rowCount: report.rowCount } } })
        } catch (e: any) {
          parts.push({ functionResponse: { name: "queryGA4", response: { error: e.message } } })
        }
        continue
      }

      if (call.name === "queryGSC") {
        try {
          const a = call.args as any
          const rows = await runGSC(a.siteId, a.startDate, a.endDate, a.dimensions || ["query"], a.rowLimit || 20)
          parts.push({ functionResponse: { name: "queryGSC", response: { rows: rows.slice(0, 50) } } })
        } catch (e: any) {
          parts.push({ functionResponse: { name: "queryGSC", response: { error: e.message } } })
        }
        continue
      }

      if (call.name === "queryProduct") {
        try {
          const a = call.args as any
          const code: string = (a.sku_code || a.product_code || "").trim().toUpperCase()
          let result: any = null
          if (code.length === 13) {
            const { data } = await supabaseAdmin.from("skus")
              .select("sku_code,product_code,tenant,status,sim_esim,data_amount,data_amount_unit,is_unlimited,is_daily,day_amount,throttle_speed,call,call_sms_details,hotspot,kyc_needed,operator_code,network_type,vendor_sku,latest_cogs,latest_cogs_currency,note")
              .eq("sku_code", code).maybeSingle()
            result = data
          } else if (code.length === 8) {
            const { data } = await supabaseAdmin.from("products")
              .select("product_code,status,tenant,sim_esim,product_type,country_group,vendor")
              .eq("product_code", code).maybeSingle()
            result = data
          }
          parts.push({ functionResponse: { name: "queryProduct", response: result ?? { error: "Không tìm thấy sản phẩm" } } })
        } catch (e: any) {
          parts.push({ functionResponse: { name: "queryProduct", response: { error: e.message } } })
        }
        continue
      }

      if (call.name !== "executeSQL") {
        parts.push({ functionResponse: { name: call.name, response: { error: "Unknown tool" } } })
        continue
      }

      const sql = (call.args as any)?.sql as string || ""
      const normalizedSql = sql.trim().toLowerCase()

      // Security: only SELECT / WITH
      if (!normalizedSql.startsWith("select") && !normalizedSql.startsWith("with")) {
        parts.push({ functionResponse: { name: "executeSQL", response: { error: "Only SELECT and WITH queries are allowed." } } })
        continue
      }
      if (sql.includes(";") && sql.split(";").filter((s: string) => s.trim()).length > 1) {
        parts.push({ functionResponse: { name: "executeSQL", response: { error: "Multiple statements are not allowed." } } })
        continue
      }

      try {
        console.log(`[BI] SQL: ${sql.substring(0, 120)}`)
        const rows = await queryAnalytics(sql)
        // Limit to 100 rows to avoid token overflow
        const limited = rows.slice(0, 100)
        parts.push({ functionResponse: { name: "executeSQL", response: { result: limited, rowCount: rows.length } } })
      } catch (err: any) {
        console.error("[BI] SQL error:", err.message)
        parts.push({ functionResponse: { name: "executeSQL", response: { error: err.message } } })
      }
    }

    result = await chat.sendMessage(parts)
   }
  }

  await processToolCalls()

  // Chống bi "HỨA sẽ truy vấn" mà KHÔNG gọi tool nào (né chạy SQL) → nudge buộc gọi executeSQL rồi chạy lại loop.
  const PUNT_RE = /chưa kịp|để (tôi|mình|hệ thống)[^.!?]{0,25}(truy vấn|quét)|phản hồi lại để[^.!?]{0,40}(truy vấn|quét)|sẽ (tiến hành )?truy vấn|chưa (thực hiện|tiến hành)[^.!?]{0,20}(truy vấn|quét|câu lệnh)/i
  if (!anyToolCall && PUNT_RE.test(result.response.text())) {
    try {
      result = await chat.sendMessage(
        "Bạn CÓ sẵn công cụ executeSQL và ĐƯỢC PHÉP truy vấn gohub_dw NGAY BÂY GIỜ. TUYỆT ĐỐI KHÔNG hứa 'sẽ truy vấn' hay yêu cầu user phản hồi lại. HÃY gọi executeSQL ngay để lấy số liệu thật rồi trả lời hoàn chỉnh."
      )
      await processToolCalls()
    } catch { /* giữ nguyên → xử lý ở tầng gọi */ }
  }

  // Fallback chống câu trả lời RỖNG: Gemini đôi khi kết thúc function-calling mà không sinh text
  // (nhất là query so sánh nhiều kỳ / WoW). Nudge 1 lượt để buộc tổng hợp kết quả đã truy vấn.
  let text = result.response.text()
  if (!text.trim()) {
    try {
      const followup = await chat.sendMessage(
        "Dựa TRÊN kết quả các truy vấn đã chạy ở trên, hãy viết câu trả lời hoàn chỉnh bằng tiếng Việt cho user (kèm số liệu, bảng markdown nếu cần). KHÔNG gọi thêm tool."
      )
      text = followup.response.text()
    } catch { /* giữ text rỗng → xử lý ở tầng gọi */ }
  }
  return text
}
