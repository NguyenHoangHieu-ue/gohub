import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { supabaseAdmin } from "@/lib/supabase"

const SKU_LIMIT  = 3_000
const LIST_LIMIT = 3_000
const ITEM_LIMIT = 2_000
const CACHE_TTL  = 24 * 60 * 60 * 1000   // 24h — data sync 1 lần/ngày

let cache: { data: CacheData; at: number } | null = null

interface CacheData {
  products:         any[]
  skus:             any[]
  listings:         any[]
  items:            any[]
  wmProducts:       any[]
  wmInSystemSet:    Set<string>
  zones3hk:         any[]
  countries:        any[]
  supportCountries: any[]
  vendors:          any[]
  settings:         any[]
}

async function fetchAll(table: string, select = "*", activeOnly = false) {
  let q = supabaseAdmin.from(table).select(select)
  if (activeOnly) q = (q as any).eq("status", "Active")
  const { data } = await (q as any).limit(20_000)
  return data ?? []
}

async function getRawData(): Promise<CacheData> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL) return cache.data

  const [
    products, skus, listings, items,
    wmProducts, wmSkusRaw,
    zones3hk,
    countries, supportCountries,
    vendors, settings,
  ] = await Promise.all([
    fetchAll("products", "*"),
    fetchAll("skus",     "*", true),
    fetchAll("listings", "*", true),
    fetchAll("items",    "*", true),

    // NCC WORLDMOVE — toàn bộ catalog, bỏ APN fields (tiết kiệm token)
    supabaseAdmin.from("ncc_worldmove")
      .select("vendor_product_id,product_name,region,sim_type,days,data_gb,is_daily,is_unlimited,throttle_kbps,cogs,cogs_currency,is_kyc,is_lesim,status")
      .eq("status", "active")
      .order("region")
      .then(r => r.data ?? []),

    // WM SKUs đã có trong hệ thống GoHub (để đánh dấu in_system)
    supabaseAdmin.from("skus").select("vendor_sku").ilike("vendor_sku", "WM-%")
      .then(r => r.data ?? []),

    // NCC 3HK — zone reference
    supabaseAdmin.from("ncc_3hk")
      .select("zone,country,network,price_per_gb_hkd,is_kyc")
      .order("zone")
      .then(r => r.data ?? []),

    supabaseAdmin.from("ref_countries").select("code,name").order("code").then(r => r.data ?? []),
    supabaseAdmin.from("ref_support_countries").select("code,support_country,country_codes").order("code").then(r => r.data ?? []),
    supabaseAdmin.from("ref_vendors").select("vendor_code,name,description").order("vendor_code").then(r => r.data ?? []),
    supabaseAdmin.from("app_settings").select("key,value").then(r => r.data ?? []),
  ])

  const wmInSystemSet = new Set<string>(wmSkusRaw.map((s: any) => s.vendor_sku as string))

  const data: CacheData = {
    products,
    skus:     skus.slice(0, SKU_LIMIT),
    listings: listings.slice(0, LIST_LIMIT),
    items:    items.slice(0, ITEM_LIMIT),
    wmProducts,
    wmInSystemSet,
    zones3hk,
    countries,
    supportCountries,
    vendors,
    settings,
  }
  cache = { data, at: now }
  return data
}

function fmtWmData(p: any): string {
  if (p.is_unlimited) return p.is_daily ? `${p.data_gb ?? "?"}GB/d+Unlim` : "Unlimited"
  if (!p.data_gb) return "?"
  const gb = p.data_gb < 1 ? `${Math.round(p.data_gb * 1000)}MB` : `${p.data_gb}GB`
  return p.is_daily ? `${gb}/ngày` : gb
}

function fmtThrottle(kbps: number | null): string {
  if (!kbps) return "NoLimit"
  if (kbps >= 1000) return `${kbps / 1000}Mbps`
  return `${kbps}kbps`
}

function buildContext(d: CacheData, role: string): string {
  const isCost = role === "admin" || role === "manager"
  const { products, skus, listings, items, wmProducts, wmInSystemSet, zones3hk,
          countries, supportCountries, vendors, settings } = d

  const lines: string[] = [
    // ── GoHub system data ────────────────────────────────────────────────────
    `=== PRODUCTS hệ thống GoHub (${products.length}) ===`,
    ...products.map((p: any) =>
      `${p.product_code}|${p.tenant}|${p.type_of_sim}|${p.status}|nước:${p.supported_countries}`
    ),

    `\n=== SKUS hệ thống (${skus.length} active) ===`,
    ...skus.map((s: any) =>
      `${s.sku_code}|${s.product_code}|${s.sim_esim}` +
      `|${s.data_amount}${s.data_amount_unit}/${s.day_amount}${s.day_amount_unit}` +
      `|throttle:${s.throttle_speed}` +
      (isCost ? `|cogs_vnd:${s.final_cogs_included_vat_vnd}|cogs_usd:${s.final_cogs_usd}` : "")
    ),

    `\n=== LISTINGS (${listings.length} active) ===`,
    ...listings.map((l: any) =>
      `${l.listing_code}|${l.listing_name_vn}|${l.type_of_sim}` +
      `|op:${l.network_operator}|exp:${l.expirations_en}ngày`
    ),

    `\n=== ITEMS (${items.length} active) ===`,
    ...items.map((i: any) =>
      `${i.item_name_vn}|listing:${i.listing_code}|${i.unitprice}${i.currency}` +
      `|${i.data_amount}${i.data_amount_unit}/${i.day_amount}${i.day_amount_unit}`
    ),

    // ── NCC: WORLDMOVE ───────────────────────────────────────────────────────
    `\n=== NCC WORLDMOVE — toàn bộ catalog (${wmProducts.length} sản phẩm) ===`,
    `Chú thích cột: vendor_id|vùng|loại|ngày|data|throttle` +
      (isCost ? `|giá(${wmProducts[0]?.cogs_currency ?? "TWD"})` : "") + `|HT=đã có trong GoHub`,
    ...wmProducts.map((p: any) =>
      `${p.vendor_product_id}|${p.region}|${p.sim_type}|${p.days}d` +
      `|${fmtWmData(p)}|${fmtThrottle(p.throttle_kbps)}` +
      (isCost ? `|${p.cogs ?? "?"}` : "") +
      (wmInSystemSet.has(p.vendor_product_id) ? "|HT" : "")
    ),

    // ── NCC: 3HK ─────────────────────────────────────────────────────────────
    `\n=== NCC 3HK — zone datapool (${zones3hk.length} zone-quốc gia) ===`,
    `3HK là datapool: GoHub tự tạo gói từ zone. KYC bắt buộc chỉ HK và TW.`,
    ...zones3hk.map((z: any) =>
      `Zone${z.zone}|${z.country}|${z.network}` +
      (isCost ? `|${z.price_per_gb_hkd}HKD/GB` : "") +
      (z.is_kyc ? `|KYC` : "")
    ),

    // ── Reference ────────────────────────────────────────────────────────────
    `\n=== MÃ VENDOR (${vendors.length}) ===`,
    ...vendors.map((v: any) =>
      `${v.vendor_code}=${v.name}` + (v.description ? ` (${v.description})` : "")
    ),

    `\n=== MÃ NƯỚC ISO (${countries.length}) ===`,
    ...countries.map((c: any) => `${c.code}=${c.name}`),

    `\n=== NHÓM NƯỚC HỖ TRỢ GoHub (${supportCountries.length}) ===`,
    ...supportCountries.map((sc: any) =>
      `${sc.code}: ${sc.support_country ?? ""}${sc.country_codes ? ` [${sc.country_codes}]` : ""}`
    ),

    // ── Tỷ giá (admin/manager only) ──────────────────────────────────────────
    ...(isCost && settings.length ? [
      `\n=== TỶ GIÁ NỘI BỘ ===`,
      ...settings.map((s: any) => `${s.key}=${s.value}`),
    ] : []),
  ]

  return lines.join("\n")
}

const SYSTEM_BASE = `Bạn là trợ lý AI của GoHub Telco, hỗ trợ team tra cứu thông tin sản phẩm SIM/eSim du lịch.
Trả lời bằng tiếng Việt, chính xác dựa trên dữ liệu thực tế từ hệ thống bên dưới.
Nếu không tìm thấy thông tin trong dữ liệu, hãy nói rõ là không có thay vì đoán.
Khi hiển thị giá, ưu tiên VND. Nếu chỉ có ngoại tệ thì ghi rõ đơn vị.

Quy tắc định dạng:
- Dùng danh sách gạch đầu dòng khi liệt kê 3+ mục.
- In đậm tên sản phẩm, giá, thông số quan trọng nhất.
- Câu trả lời ngắn gọn, đúng trọng tâm. Không dùng tiêu đề ## trừ khi câu trả lời rất dài.

Về nhà cung cấp:
- WORLDMOVE (WM): catalog cố định, không KYC. Cột HT = đã có trong hệ thống GoHub.
- 3HK: datapool theo zone, GoHub tự cấu hình gói. KYC chỉ HK và TW.

Dữ liệu hệ thống:`

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { messages, userName } = await req.json()
  const role = session.user.role || "standard"
  const name = userName || session.user.name || "bạn"

  try {
    const rawData = await getRawData()
    const context = buildContext(rawData, role)
    const systemInstruction = `${SYSTEM_BASE}\n${context}\n\n---\nNgười đang chat: ${name}`

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash", systemInstruction })

    const history = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
      role:  m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }))

    const chat   = model.startChat({ history })
    const result = await chat.sendMessageStream(messages.at(-1).content)

    const encoder = new TextEncoder()
    const stream  = new ReadableStream({
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
