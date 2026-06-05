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
  data: { products: any[]; skus: any[]; listings: any[]; items: any[]; zones3hk: any[]; wmInSystem: any[] }
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

  const [products, skus, listings, items, zones3hk, wmInSystem] = await Promise.all([
    fetchLimited("products", 1000),
    fetchLimited("skus",     SKU_LIMIT,  true),
    fetchLimited("listings", LIST_LIMIT, true),
    fetchLimited("items",    ITEM_LIMIT, true),
    // 3HK zone reference (45 rows)
    supabaseAdmin.from("ncc_3hk_zones").select("zone,country,network,price_per_gb_hkd,is_kyc")
      .order("zone").then(r => r.data ?? []),
    // WM products already in the system (via vendor_sku match)
    supabaseAdmin.from("skus")
      .select("sku_code,vendor_sku,sim_esim,data_amount,data_amount_unit,day_amount,throttle_speed,status")
      .ilike("vendor_sku", "WM-%")
      .limit(800)
      .then(r => r.data ?? []),
  ])
  cache = { data: { products, skus, listings, items, zones3hk, wmInSystem }, at: now }
  return cache.data
}

function buildContext(
  data: { products: any[]; skus: any[]; listings: any[]; items: any[]; zones3hk: any[]; wmInSystem: any[] },
  role: string
): string {
  const { products, skus, listings, items, zones3hk, wmInSystem } = data
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
  ]
  return lines.join("\n")
}

const SYSTEM = `Bạn là trợ lý AI của GoHub, hỗ trợ team sale tra cứu thông tin sản phẩm SIM/eSim du lịch.
Trả lời bằng tiếng Việt, ngắn gọn và chính xác dựa trên dữ liệu thực tế từ hệ thống PM bên dưới.
Nếu không tìm thấy thông tin trong dữ liệu, hãy nói rõ là không có dữ liệu thay vì đoán.
Khi hiển thị giá, luôn ưu tiên dùng giá VND. Nếu chỉ có ngoại tệ thì ghi rõ đơn vị.

Về NCC (nhà cung cấp):
- 3HK: datapool, GoHub TỰ TẠO gói theo yêu cầu. Dữ liệu zone cho biết 3HK HỖ TRỢ nước nào/mạng nào.
  Nếu hỏi "3HK có gói X chưa?" — kiểm tra xem GoHub đã tạo gói đó trên hệ thống chưa (WM-e-... vendor_sku).
  Nếu hỏi "3HK hỗ trợ nước X không?" — kiểm tra zone reference.
- WORLDMOVE: catalog cố định. Sản phẩm WM đã có trong hệ thống được liệt kê ở mục NCC WORLDMOVE.

Dữ liệu sản phẩm hiện tại:`

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { messages } = await req.json()
  const role = session.user.role || "sale"

  try {
    const rawData = await getRawData()
    const context = buildContext(rawData, role)

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model = genAI.getGenerativeModel({
      model:             "gemini-3.5-flash",
      systemInstruction: SYSTEM + "\n" + context,
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
