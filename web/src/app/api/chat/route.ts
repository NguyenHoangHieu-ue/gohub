import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { supabaseAdmin } from "@/lib/supabase"

const SKU_LIMIT  = 3_000
const LIST_LIMIT = 3_000
const ITEM_LIMIT = 2_000
const CACHE_TTL  = 30 * 60 * 1000

let cache: {
  data: {
    products: any[]; skus: any[]; listings: any[]; items: any[]
    zones3hk: any[]; wmInSystem: any[]
    countries: any[]; supportCountries: any[]
  }
  at: number
} | null = null

async function fetchLimited(table: string, limit: number, activeOnly = false) {
  let q = supabaseAdmin.from(table).select("*")
  if (activeOnly) q = (q as any).eq("status", "Active")
  const { data } = await (q as any).limit(limit)
  return data ?? []
}

async function getRawData() {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL) return cache.data

  const [products, skus, listings, items, zones3hk, wmInSystem, countries, supportCountries] = await Promise.all([
    fetchLimited("products", 1000),
    fetchLimited("skus",     SKU_LIMIT,  true),
    fetchLimited("listings", LIST_LIMIT, true),
    fetchLimited("items",    ITEM_LIMIT, true),
    supabaseAdmin.from("ncc_3hk_zones").select("zone,country,network,price_per_gb_hkd,is_kyc")
      .order("zone").then(r => r.data ?? []),
    supabaseAdmin.from("skus")
      .select("sku_code,vendor_sku,sim_esim,data_amount,data_amount_unit,day_amount,throttle_speed,status")
      .ilike("vendor_sku", "WM-%").limit(800).then(r => r.data ?? []),
    supabaseAdmin.from("ref_countries").select("code,name").order("code").then(r => r.data ?? []),
    supabaseAdmin.from("ref_support_countries").select("code,support_country,country_codes").order("code").then(r => r.data ?? []),
  ])
  cache = { data: { products, skus, listings, items, zones3hk, wmInSystem, countries, supportCountries }, at: now }
  return cache.data
}

function buildContext(
  data: {
    products: any[]; skus: any[]; listings: any[]; items: any[]
    zones3hk: any[]; wmInSystem: any[]
    countries: any[]; supportCountries: any[]
  },
  role: string
): string {
  const { products, skus, listings, items, zones3hk, wmInSystem, countries, supportCountries } = data
  const isCostRole = role === "admin" || role === "manager"

  const lines = [
    `=== PRODUCTS (${products.length}) ===`,
    ...products.map((p: any) =>
      `- ${p.product_code}|${p.tenant}|${p.type_of_sim}|${p.supported_countries}|${p.status}`
    ),

    `\n=== SKUS (${skus.length} active) ===`,
    ...skus.map((s: any) =>
      `- ${s.sku_code}|${s.product_code}|${s.sim_esim}` +
      `|${s.data_amount}${s.data_amount_unit}/${s.day_amount}${s.day_amount_unit}` +
      (isCostRole ? `|cogs_vnd:${s.final_cogs_included_vat_vnd}` : "")
    ),

    `\n=== LISTINGS (${listings.length} active) ===`,
    ...listings.map((l: any) =>
      `- ${l.listing_code}|${l.listing_name_vn}|${l.type_of_sim}` +
      `|op:${l.network_operator}|exp:${l.expirations_en}ngày|${l.status}`
    ),

    `\n=== ITEMS (${items.length} active) ===`,
    ...items.map((i: any) =>
      `- ${i.item_name_vn}|listing:${i.listing_code}|${i.unitprice}${i.currency}` +
      `|${i.data_amount}${i.data_amount_unit}/${i.day_amount}${i.day_amount_unit}`
    ),

    // ── NCC: 3HK ──────────────────────────────────────────────────────────────
    `\n=== NCC: 3HK ZONE REFERENCE (datapool — GoHub tự tạo gói) ===`,
    `Lưu ý: 3HK là datapool, GoHub có thể tạo bất kỳ gói nào (GB, ngày) với nước hỗ trợ dưới đây.`,
    `KYC bắt buộc: chỉ Hong Kong và Taiwan.`,
    `Giá cost = GB × Price/GB_HKD × tỷ giá (chỉ admin/manager biết).`,
    ...zones3hk.map((z: any) =>
      `- Zone ${z.zone}|${z.country}|${z.network}` +
      (isCostRole ? `|${z.price_per_gb_hkd}HKD/GB` : "") +
      (z.is_kyc ? `|KYC=YES` : `|KYC=NO`)
    ),

    // ── NCC: WORLDMOVE — sản phẩm đã có trên hệ thống ─────────────────────────
    `\n=== NCC: WORLDMOVE — sản phẩm đã có trên hệ thống GoHub (${wmInSystem.length}) ===`,
    `Lưu ý: WORLDMOVE không yêu cầu KYC. WM cung cấp eSIM/SIM cố định theo gói.`,
    `Throttle: Unlimited standard=2GB/ngày rồi 5Mbps, Premium=1GB/ngày rồi 10Mbps, AYCE=không giới hạn.`,
    ...wmInSystem.map((s: any) =>
      `- ${s.vendor_sku}|${s.sim_esim}|${s.data_amount}${s.data_amount_unit}/${s.day_amount}ngày` +
      `|throttle:${s.throttle_speed}|${s.status}`
    ),

    // ── Country reference ────────────────────────────────────────────────────
    `\n=== MÃ NƯỚC ISO (${countries.length}) ===`,
    ...countries.map((c: any) => `${c.code}=${c.name}`),

    `\n=== MÃ NHÓM NƯỚC HỆ THỐNG (${supportCountries.length}) ===`,
    ...supportCountries.map((sc: any) =>
      `${sc.code}: ${sc.support_country ?? ""}` +
      (sc.country_codes ? ` [${sc.country_codes}]` : "")
    ),
  ]
  return lines.join("\n")
}

const SYSTEM_BASE = `Bạn là trợ lý AI của GoHub, hỗ trợ team tra cứu thông tin sản phẩm SIM/eSim du lịch.
Trả lời bằng tiếng Việt, chính xác dựa trên dữ liệu thực tế từ hệ thống PM bên dưới.
Nếu không tìm thấy thông tin trong dữ liệu, hãy nói rõ là không có dữ liệu thay vì đoán.
Khi hiển thị giá, luôn ưu tiên dùng giá VND. Nếu chỉ có ngoại tệ thì ghi rõ đơn vị.

Quy tắc định dạng câu trả lời:
- Dùng danh sách gạch đầu dòng khi liệt kê nhiều mục (3+ mục).
- Dùng in đậm cho tên sản phẩm, giá, thông số quan trọng.
- Câu trả lời ngắn gọn, đúng trọng tâm. Không dùng tiêu đề lớn (##) trừ khi câu trả lời dài.
- Không lạm dụng in đậm — chỉ in đậm thông tin quan trọng nhất.

Về NCC (nhà cung cấp):
- 3HK: datapool, GoHub tự tạo gói. Dữ liệu zone cho biết 3HK hỗ trợ nước nào và mạng nào.
- WORLDMOVE: catalog cố định, không yêu cầu KYC. Sản phẩm WM đã có trong hệ thống ở mục NCC WORLDMOVE.

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
    const systemInstruction = `${SYSTEM_BASE}\n${context}\n\n---\nNgười đang chat với bạn: ${name}`

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model = genAI.getGenerativeModel({
      model:             "gemini-3.5-flash",
      systemInstruction,
    })

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

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
