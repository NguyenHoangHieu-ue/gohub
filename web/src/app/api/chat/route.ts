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
      product_type:        p.product_type ?? null,
      operator_code:       p.operator_code ?? null,
      network_type:        p.network_type ?? null,
      kyc_needed:          p.kyc_needed ?? null,
      supported_countries: p.supported_countries ?? null,
      note:                p.note ?? null,
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

// ─── Intent detection ─────────────────────────────────────────────────────────

// Tên nước tiếng Việt → tiếng Anh (để khớp với ref_support_countries)
const VN_TO_EN: Record<string, string> = {
  "nhật bản": "Japan", "nhật": "Japan",
  "mỹ": "United States", "hoa kỳ": "United States",
  "nga": "Russia",
  "hàn quốc": "South Korea", "hàn": "South Korea",
  "thái lan": "Thailand", "thái": "Thailand",
  "úc": "Australia",
  "anh": "United Kingdom",
  "đức": "Germany",
  "pháp": "France",
  "ý": "Italy",
  "tây ban nha": "Spain",
  "đài loan": "Taiwan",
  "hồng kông": "Hong Kong",
  "trung quốc": "China", "trung": "China",
  "ấn độ": "India",
  "singapore": "Singapore",
  "indonesia": "Indonesia",
  "malaysia": "Malaysia",
  "philippines": "Philippines",
  "việt nam": "Vietnam",
  "dubai": "United Arab Emirates", "uae": "United Arab Emirates",
  "thổ nhĩ kỳ": "Turkey",
  "canada": "Canada",
  "mexico": "Mexico",
  "brazil": "Brazil",
  "châu âu": "Europe",
}

const PRODUCT_KEYWORDS = ["gói", "sim", "esim", "data", "mua", "tìm", "sản phẩm", "có không", "bao nhiêu ngày", "dung lượng"]

interface SearchIntent {
  countryEn: string | null  // tên nước tiếng Anh để search ref_support_countries
  simType:   "eSIM" | "SIM" | null
  ngayMin:   number | null
  ngayMax:   number | null
  dataGbMin: number | null
  isProduct: boolean
}

function detectIntent(message: string, data: CacheData): SearchIntent {
  const msg = message.toLowerCase()

  // 1. Tìm tên nước từ map VN→EN (dài trước ngắn để tránh match nhầm "nhật" trong "nhật bản")
  let countryEn: string | null = null
  const sorted = Object.entries(VN_TO_EN).sort((a, b) => b[0].length - a[0].length)
  for (const [vn, en] of sorted) {
    if (msg.includes(vn)) { countryEn = en; break }
  }

  // 2. Nếu chưa tìm được, check tên tiếng Anh từ ref_support_countries
  if (!countryEn) {
    for (const sc of data.supportCountries) {
      const name = (sc.support_country ?? "").toLowerCase()
      if (name.length > 3 && msg.includes(name)) {
        countryEn = sc.support_country
        break
      }
    }
  }

  // 3. SIM type
  const isEsim = msg.includes("esim") || msg.includes("e-sim") || msg.includes("e sim")
  const isSim  = !isEsim && (msg.includes("sim vật lý") || msg.includes("sim vật") || msg.includes("sim thường"))
  const simType = isEsim ? "eSIM" : isSim ? "SIM" : null

  // 4. Số ngày (ví dụ: "7 ngày", "30 ngày")
  const dayMatches = [...msg.matchAll(/(\d+)\s*ngày/g)].map(m => parseInt(m[1]))
  const ngayMin = dayMatches.length ? Math.min(...dayMatches) : null
  const ngayMax = dayMatches.length ? Math.max(...dayMatches) : null

  // 5. Dung lượng (ví dụ: "10gb", "5 gb")
  const gbMatch = msg.match(/(\d+)\s*gb/)
  const dataGbMin = gbMatch ? parseInt(gbMatch[1]) : null

  // 6. Có phải câu hỏi về sản phẩm không?
  const isProduct = !!countryEn || PRODUCT_KEYWORDS.some(k => msg.includes(k))

  return { countryEn, simType, ngayMin, ngayMax, dataGbMin, isProduct }
}

// ─── Search SKUs ──────────────────────────────────────────────────────────────

const FULL_TYPES = new Set(["C", "E", "1", "2"])

function searchSkus(intent: SearchIntent, data: CacheData, isCost: boolean): string {
  const { countryEn, simType, ngayMin, ngayMax, dataGbMin } = intent

  // Tìm group codes cho nước
  let groupCodes: Set<string> | null = null
  const groupsFound: string[] = []

  if (countryEn) {
    const search = countryEn.toLowerCase()
    for (const sc of data.supportCountries) {
      const hay = `${sc.support_country ?? ""} ${sc.country_codes ?? ""}`.toLowerCase()
      if (hay.includes(search)) {
        groupsFound.push(`${sc.code}(${sc.support_country})`)
        if (!groupCodes) groupCodes = new Set()
        groupCodes.add(sc.code)
      }
    }
    if (!groupCodes) {
      return `[Không tìm thấy nhóm nước nào cho "${countryEn}" trong ref_support_countries]`
    }
  }

  // Lọc SKU
  let results = data.skus.filter(s => {
    if (!FULL_TYPES.has(s.product_type ?? "")) return false
    if (groupCodes) {
      const grp = s.sku_code?.substring(2, 5)
      if (!grp || !groupCodes.has(grp)) return false
    }
    if (simType === "eSIM" && s.sim_esim !== "eSIM") return false
    if (simType === "SIM"  && s.sim_esim !== "SIM")  return false
    if (ngayMin && (s.day_amount ?? 0) < ngayMin) return false
    if (ngayMax && (s.day_amount ?? 0) > ngayMax) return false
    if (dataGbMin && (s.data_amount ?? 9999) < dataGbMin && (s.data_amount ?? 9999) < 9999) return false
    return true
  })

  // Sort: VN trước, sau đó ngày tăng dần
  results.sort((a, b) => {
    if (a.tenant === "VN" && b.tenant !== "VN") return -1
    if (b.tenant === "VN" && a.tenant !== "VN") return 1
    return (a.day_amount ?? 0) - (b.day_amount ?? 0)
  })

  const total = results.length
  results = results.slice(0, 30)

  if (total === 0) {
    return `[Không tìm thấy gói nào phù hợp. Nhóm nước khớp: ${groupsFound.join(", ") || "không có"}]`
  }

  const header = countryEn
    ? `[Tìm thấy ${total} gói cho "${countryEn}" — nhóm: ${groupsFound.join(", ")} — hiển thị ${results.length}]`
    : `[Tìm thấy ${total} gói — hiển thị ${results.length}]`

  const cols = `sku_code|tenant|sim|data|days|throttle|operator|kyc|nuoc|vendor_sku` +
    (isCost ? `|gia_vnd|gia_usd` : "")

  const rows = results.map(s =>
    `${s.sku_code}|${s.tenant}|${s.sim_esim}` +
    `|${fmtData(s.data_amount, s.data_amount_unit)}|${s.day_amount}d` +
    `|${s.throttle_speed ?? "—"}` +
    `|${s.operator_code ?? "—"}` +
    `|${s.kyc_needed ?? "—"}` +
    `|${s.supported_countries ?? "—"}` +
    `|${s.vendor_sku ?? "—"}` +
    (isCost ? `|${s.final_cogs_included_vat_vnd ?? "?"}|${s.final_cogs_usd ?? "?"}` : "") +
    (s.note ? ` — note: ${s.note}` : "")
  )

  return [header, cols, ...rows].join("\n")
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(data: CacheData, role: string): string {
  const isCost = role === "admin" || role === "manager"
  const { supportCountries, countries, vendors, settings } = data

  const lines = [
    `Bạn là trợ lý AI của GoHub — công ty cung cấp SIM/eSIM du lịch.`,
    `Trả lời bằng tiếng Việt. Không đề cập tên bảng/cột database.`,
    `Khi có dữ liệu sản phẩm được cung cấp trong tin nhắn, hãy dựa vào đó để trả lời — không tự bịa thêm sản phẩm.`,
    ``,
    `=== NHOM NUOC HO TRO (${supportCountries.length}) ===`,
    ...(supportCountries as any[]).map(sc =>
      `${sc.code}: ${sc.support_country ?? ""}${sc.country_codes ? ` [${sc.country_codes}]` : ""}`
    ),
    ``,
    `=== MA NUOC (${countries.length}) ===`,
    ...(countries as any[]).map((c: any) => `${c.code}=${c.name}`),
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
  const role   = session.user.role || "standard"
  const isCost = role === "admin" || role === "manager"
  const name   = userName || session.user.name || "bạn"

  try {
    const rawData = await getRawData()
    const systemInstruction = `${buildSystemPrompt(rawData, role)}\n\n---\nNgười đang chat: ${name}`

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash", systemInstruction })

    const history = messages.slice(0, -1).map((m: any) => ({
      role:  m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }))

    const chat        = model.startChat({ history })
    const lastMessage = messages.at(-1).content

    // Parse intent và search cache phía server (không cần gọi Gemini lần 1)
    const intent = detectIntent(lastMessage, rawData)
    const finalMessage = intent.isProduct
      ? `[Dữ liệu sản phẩm tìm được]\n${searchSkus(intent, rawData, isCost)}\n\n[Câu hỏi]\n${lastMessage}`
      : lastMessage

    // Một lần gọi Gemini duy nhất, stream thẳng
    const result = await chat.sendMessageStream(finalMessage)

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
