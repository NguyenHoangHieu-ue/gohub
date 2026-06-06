import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { supabaseAdmin } from "@/lib/supabase"

const CACHE_TTL = 30 * 60 * 1000

let cache: { data: CacheData; at: number } | null = null

interface CacheData {
  skus:             any[]
  supportCountries: any[]
  countries:        any[]
  vendors:          any[]
  settings:         any[]
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getRawData(): Promise<CacheData> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL) return cache.data

  const [skusRaw, productsRaw, supportCountries, countries, vendors, settings] = await Promise.all([
    supabaseAdmin.from("skus")
      .select("sku_code,product_code,tenant,status,sim_esim,data_amount,data_amount_unit,day_amount,day_amount_unit,throttle_speed,expirations,vendor_sku,latest_cogs,latest_cogs_currency,final_cogs_included_vat_vnd,final_cogs_usd")
      .eq("status", "Active")
      .then(r => r.data ?? []),
    supabaseAdmin.from("products")
      .select("product_code,product_type,operator_code,network_type,kyc_needed,supported_countries,note")
      .then(r => r.data ?? []),
    supabaseAdmin.from("ref_support_countries").select("code,support_country,country_codes").order("code").then(r => r.data ?? []),
    supabaseAdmin.from("ref_countries").select("code,name").order("name").then(r => r.data ?? []),
    supabaseAdmin.from("ref_vendors").select("vendor_code,name").order("vendor_code").then(r => r.data ?? []),
    supabaseAdmin.from("app_settings").select("key,value").then(r => r.data ?? []),
  ])

  const prodMap = Object.fromEntries((productsRaw as any[]).map((p: any) => [p.product_code, p]))
  const skus = (skusRaw as any[]).map((s: any) => {
    const p = prodMap[s.product_code] ?? {}
    return {
      ...s,
      product_type:       p.product_type ?? null,
      operator_code:      p.operator_code ?? null,
      network_type:       p.network_type ?? null,
      kyc_needed:         p.kyc_needed ?? null,
      supported_countries: p.supported_countries ?? null,
      note:               p.note ?? null,
    }
  })

  const data: CacheData = { skus, supportCountries, countries, vendors, settings }
  cache = { data, at: now }
  return data
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtData(amount: number | null, unit: string | null): string {
  if (!amount || amount >= 9999) return "Unlimited"
  return amount < 1 ? `${Math.round(amount * 1000)}MB` : `${amount}${unit ?? "GB"}`
}

// ─── Tool functions ───────────────────────────────────────────────────────────

// Chỉ sản phẩm hoàn chỉnh (C=eSIM Full US, E=SIM Full US, 1=eSIM Full VN, 2=SIM Full VN)
const FULL_TYPES = new Set(["C", "E", "1", "2"])

function timGoiSim(
  args: { ten_nuoc?: string; loai_sim?: string; ngay_min?: number; ngay_max?: number; data_gb_min?: number },
  data: CacheData,
  isCost: boolean
) {
  const { ten_nuoc, loai_sim, ngay_min, ngay_max, data_gb_min } = args

  // Tìm group codes cho nước
  let groupCodes: Set<string> | null = null
  const groupsFound: string[] = []

  if (ten_nuoc) {
    const search = ten_nuoc.toLowerCase()
    for (const sc of data.supportCountries) {
      const hay = `${sc.support_country ?? ""} ${sc.country_codes ?? ""}`.toLowerCase()
      if (hay.includes(search)) {
        groupsFound.push(`${sc.code}: ${sc.support_country}`)
        if (!groupCodes) groupCodes = new Set()
        groupCodes.add(sc.code)
      }
    }
    if (!groupCodes) {
      return { error: `Không tìm thấy nhóm nước nào cho "${ten_nuoc}". Hãy thử tên tiếng Anh.` }
    }
  }

  // Lọc SKU
  let results = data.skus.filter(s => {
    if (!FULL_TYPES.has(s.product_type ?? "")) return false
    if (groupCodes) {
      const grp = s.sku_code?.substring(2, 5)
      if (!grp || !groupCodes.has(grp)) return false
    }
    if (loai_sim === "eSIM" && s.sim_esim !== "eSIM") return false
    if (loai_sim === "SIM" && s.sim_esim !== "SIM") return false
    if (ngay_min && (s.day_amount ?? 0) < ngay_min) return false
    if (ngay_max && (s.day_amount ?? 0) > ngay_max) return false
    if (data_gb_min && (s.data_amount ?? 9999) < data_gb_min && (s.data_amount ?? 9999) < 9999) return false
    return true
  })

  // Sort: VN trước, sau đó theo ngày tăng dần
  results.sort((a, b) => {
    if (a.tenant === "VN" && b.tenant !== "VN") return -1
    if (b.tenant === "VN" && a.tenant !== "VN") return 1
    return (a.day_amount ?? 0) - (b.day_amount ?? 0)
  })

  const total = results.length
  results = results.slice(0, 30)

  return {
    total_found: total,
    groups_matched: groupsFound,
    skus: results.map(s => skuRow(s, isCost)),
  }
}

function xemChiTietSku(args: { sku_code: string }, data: CacheData, isCost: boolean) {
  const s = data.skus.find(s => s.sku_code === args.sku_code)
  if (!s) return { error: `Không tìm thấy SKU "${args.sku_code}"` }
  return skuRow(s, isCost)
}

function skuRow(s: any, isCost: boolean) {
  return {
    sku_code:        s.sku_code,
    product_code:    s.product_code,
    tenant:          s.tenant,
    sim_esim:        s.sim_esim,
    data:            fmtData(s.data_amount, s.data_amount_unit),
    days:            s.day_amount,
    throttle:        s.throttle_speed ?? null,
    operator:        s.operator_code ?? null,
    network:         s.network_type ?? null,
    vendor_sku:      s.vendor_sku ?? null,
    expiration_days: s.expirations ?? null,
    kyc:             s.kyc_needed ?? null,
    note:            s.note ?? null,
    nuoc:            s.supported_countries ?? null,
    ...(isCost ? {
      gia_vnd: s.final_cogs_included_vat_vnd,
      gia_usd: s.final_cogs_usd,
    } : {}),
  }
}

async function callTool(name: string, args: any, data: CacheData, isCost: boolean) {
  switch (name) {
    case "tim_goi_sim":     return timGoiSim(args, data, isCost)
    case "xem_chi_tiet_sku": return xemChiTietSku(args, data, isCost)
    default: return { error: `Unknown tool: ${name}` }
  }
}

// ─── Tool definitions for Gemini ─────────────────────────────────────────────

const TOOLS = [{
  functionDeclarations: [
    {
      name: "tim_goi_sim",
      description: "Tìm kiếm gói SIM/eSIM trong hệ thống GoHub. Gọi khi user hỏi về sản phẩm đi du lịch nước nào, loại SIM, số ngày, dung lượng. Tên nước phải bằng tiếng Anh.",
      parameters: {
        type: "object",
        properties: {
          ten_nuoc:    { type: "string", description: "Tên quốc gia tiếng Anh, ví dụ: Japan, Russia, United States, Thailand" },
          loai_sim:    { type: "string", enum: ["eSIM", "SIM"], description: "Loại: eSIM hoặc SIM vật lý" },
          ngay_min:    { type: "number", description: "Số ngày tối thiểu" },
          ngay_max:    { type: "number", description: "Số ngày tối đa" },
          data_gb_min: { type: "number", description: "Dung lượng tối thiểu (GB)" },
        },
      },
    },
    {
      name: "xem_chi_tiet_sku",
      description: "Xem thông tin chi tiết của một SKU khi đã biết mã SKU.",
      parameters: {
        type: "object",
        properties: {
          sku_code: { type: "string", description: "Mã SKU 13 ký tự" },
        },
        required: ["sku_code"],
      },
    },
  ],
}]

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(data: CacheData, role: string): string {
  const isCost = role === "admin" || role === "manager"
  const { supportCountries, countries, vendors, settings } = data

  const lines = [
    `Bạn là trợ lý AI của GoHub — công ty cung cấp SIM/eSIM du lịch.`,
    `Trả lời bằng tiếng Việt. Không đề cập tên bảng/cột database.`,
    ``,
    `Khi user hỏi về sản phẩm, PHẢI gọi tool tim_goi_sim để tìm — không tự bịa hoặc đoán sản phẩm.`,
    ``,
    `=== NHOM NUOC HO TRO (${supportCountries.length}) ===`,
    ...(supportCountries as any[]).map(sc =>
      `${sc.code}: ${sc.support_country ?? ""}${sc.country_codes ? ` [${sc.country_codes}]` : ""}`
    ),
    ``,
    `=== MA NUOC (${countries.length}) ===`,
    ...(countries as any[]).map(c => `${c.code}=${c.name}`),
    ``,
    `=== VENDOR (${vendors.length}) ===`,
    ...(vendors as any[]).map((v: any) => `${v.vendor_code}=${v.name}`),
  ]

  if (isCost && (settings as any[]).length) {
    lines.push(``, `=== TY GIA ===`)
    lines.push(...(settings as any[]).map((s: any) => `${s.key}=${s.value}`))
  }

  return lines.join("\n")
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { messages, userName } = await req.json()
  const role  = session.user.role || "standard"
  const isCost = role === "admin" || role === "manager"
  const name  = userName || session.user.name || "bạn"

  try {
    const rawData = await getRawData()
    const systemInstruction = `${buildSystemPrompt(rawData, role)}\n\n---\nNgười đang chat: ${name}`

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      systemInstruction,
      tools: TOOLS as any,
    })

    const history = messages.slice(0, -1).map((m: any) => ({
      role:  m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }))

    const chat        = model.startChat({ history })
    const lastMessage = messages.at(-1).content

    // Lần 1: gọi không stream để phát hiện function call
    const result1  = await chat.sendMessage(lastMessage)
    const parts    = result1.response.candidates?.[0]?.content?.parts ?? []
    const toolCall = (parts as any[]).find(p => p.functionCall)

    const encoder = new TextEncoder()

    if (toolCall) {
      const { name: toolName, args: toolArgs } = toolCall.functionCall
      const toolResult = await callTool(toolName, toolArgs, rawData, isCost)

      // Lần 2: gửi kết quả tool và stream câu trả lời cuối
      const result2 = await chat.sendMessageStream([{
        functionResponse: { name: toolName, response: toolResult },
      }] as any)

      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of result2.stream) {
              const text = chunk.text()
              if (text) controller.enqueue(encoder.encode(text))
            }
            controller.close()
          } catch (err) {
            controller.error(err)
          }
        },
      })
      return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
    } else {
      // Gemini trả lời trực tiếp không cần tool (câu hỏi chung, greeting, v.v.)
      const text = result1.response.text()
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(text))
            controller.close()
          },
        }),
        { headers: { "Content-Type": "text/plain; charset=utf-8" } }
      )
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
