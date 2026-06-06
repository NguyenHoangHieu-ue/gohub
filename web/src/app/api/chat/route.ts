import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { supabaseAdmin } from "@/lib/supabase"

const SKU_LIMIT  = 3_000
const LIST_LIMIT = 3_000
const ITEM_LIMIT = 2_000
const CACHE_TTL  = 24 * 60 * 60 * 1000

let cache: { data: CacheData; at: number } | null = null

interface CacheData {
  skuView:          any[]
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

async function getRawData(): Promise<CacheData> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL) return cache.data

  const [
    skuViewRaw, listings, items,
    wmProducts, wmSkusRaw,
    zones3hk,
    countries, supportCountries,
    vendors, settings,
  ] = await Promise.all([
    // sku_view = skus JOIN products — nguồn chính cho SP GoHub
    supabaseAdmin.from("sku_view")
      .select("sku_code,product_code,tenant,status,sim_esim,data_amount,data_amount_unit,day_amount,throttle_speed,vendor_sku,final_cogs_included_vat_vnd,final_cogs_usd,latest_cogs,latest_cogs_currency,note,kyc_needed,supported_countries,network_type,operator_code")
      .eq("status", "Active")
      .limit(SKU_LIMIT)
      .then(r => r.data ?? []),

    supabaseAdmin.from("listings").select("listing_code,listing_name_vn,listing_name_en,type_of_sim,network_operator,expirations_en,status")
      .eq("status", "Active").limit(LIST_LIMIT).then(r => r.data ?? []),

    supabaseAdmin.from("items").select("item_name_vn,listing_code,unitprice,currency,data_amount,data_amount_unit,day_amount,status")
      .eq("status", "Active").limit(ITEM_LIMIT).then(r => r.data ?? []),

    // NCC WORLDMOVE — toàn bộ catalog, không lấy APN fields
    supabaseAdmin.from("ncc_worldmove")
      .select("vendor_product_id,product_name,region,sim_type,days,data_gb,is_daily,is_unlimited,throttle_kbps,cogs,cogs_currency,is_kyc,is_lesim")
      .eq("status", "active").order("region").then(r => r.data ?? []),

    // WM SKUs đang có trong hệ thống GoHub
    supabaseAdmin.from("skus").select("vendor_sku").ilike("vendor_sku", "WM-%")
      .then(r => r.data ?? []),

    supabaseAdmin.from("ncc_3hk").select("zone,country,network,price_per_gb_hkd,is_kyc")
      .order("zone").then(r => r.data ?? []),

    supabaseAdmin.from("ref_countries").select("code,name").order("code").then(r => r.data ?? []),
    supabaseAdmin.from("ref_support_countries").select("code,support_country,country_codes").order("code").then(r => r.data ?? []),
    supabaseAdmin.from("ref_vendors").select("vendor_code,name,description").order("vendor_code").then(r => r.data ?? []),
    supabaseAdmin.from("app_settings").select("key,value").then(r => r.data ?? []),
  ])

  const wmInSystemSet = new Set<string>(wmSkusRaw.map((s: any) => s.vendor_sku as string))

  const data: CacheData = { skuView: skuViewRaw, listings, items, wmProducts, wmInSystemSet, zones3hk, countries, supportCountries, vendors, settings }
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
  const { skuView, listings, items, wmProducts, wmInSystemSet, zones3hk, countries, supportCountries, vendors, settings } = d

  const lines: string[] = [
    // ── NGUỒN CHÍNH: sku_view ────────────────────────────────────────────────
    `=== [NGUỒN CHÍNH] SKU_VIEW — Sản phẩm GoHub ĐANG CÓ trong hệ thống (${skuView.length} SKU active) ===`,
    `Đây là danh sách sản phẩm GoHub đang quản lý và bán. Luôn tra ở đây trước khi tra các bảng khác.`,
    `Cột: sku_code|product_code|tenant|SIM/eSIM|data/days|throttle|vendor_sku|note|kyc|countries` +
      (isCost ? `|cogs_vnd|cogs_usd` : ""),
    ...skuView.map((s: any) =>
      `${s.sku_code}|${s.product_code}|${s.tenant}|${s.sim_esim}` +
      `|${s.data_amount}${s.data_amount_unit}/${s.day_amount}d` +
      `|${s.throttle_speed ?? "—"}|vendor:${s.vendor_sku ?? "—"}` +
      (s.note ? `|note:${s.note}` : "") +
      (s.kyc_needed ? `|kyc:${s.kyc_needed}` : "") +
      (s.supported_countries ? `|nước:${s.supported_countries}` : "") +
      (isCost ? `|vnd:${s.final_cogs_included_vat_vnd ?? "?"}|usd:${s.final_cogs_usd ?? "?"}` : "")
    ),

    // ── Listings ─────────────────────────────────────────────────────────────
    `\n=== LISTINGS GoHub (${listings.length} active) ===`,
    `Listing là tên hiển thị và thông số chung. Mỗi listing có nhiều item (giá bán theo kênh).`,
    ...listings.map((l: any) =>
      `${l.listing_code}|${l.listing_name_vn}|${l.type_of_sim}|op:${l.network_operator}|exp:${l.expirations_en}ngày`
    ),

    // ── Items ─────────────────────────────────────────────────────────────────
    `\n=== ITEMS GoHub (${items.length} active — giá bán theo kênh) ===`,
    ...items.map((i: any) =>
      `${i.item_name_vn}|listing:${i.listing_code}|${i.unitprice}${i.currency}` +
      `|${i.data_amount}${i.data_amount_unit}/${i.day_amount}d`
    ),

    // ── NCC: WORLDMOVE ───────────────────────────────────────────────────────
    `\n=== [NCC] WORLDMOVE — Catalog nhà cung cấp (${wmProducts.length} SP) ===`,
    `ĐÂY LÀ CATALOG NCC, KHÔNG PHẢI SP GOHUB ĐANG BÁN.`,
    `HT = vendor_product_id này ĐÃ được nhập vào hệ thống GoHub (có trong sku_view).`,
    `Không có HT = NCC có nhưng GoHub CHƯA nhập.`,
    `Cột: vendor_id|vùng|loại|ngày|data|throttle` + (isCost ? `|giá(${wmProducts[0]?.cogs_currency ?? "TWD"})` : "") + `|[HT nếu có]`,
    ...wmProducts.map((p: any) =>
      `${p.vendor_product_id}|${p.region}|${p.sim_type}|${p.days}d` +
      `|${fmtWmData(p)}|${fmtThrottle(p.throttle_kbps)}` +
      (isCost ? `|${p.cogs ?? "?"}` : "") +
      (wmInSystemSet.has(p.vendor_product_id) ? "|HT" : "")
    ),

    // ── NCC: 3HK ─────────────────────────────────────────────────────────────
    `\n=== [NCC] 3HK — Zone datapool (${zones3hk.length} zone-quốc gia) ===`,
    `3HK là datapool: GoHub tự cấu hình gói GB+ngày. KYC bắt buộc chỉ HK và TW.`,
    ...zones3hk.map((z: any) =>
      `Zone${z.zone}|${z.country}|${z.network}` +
      (isCost ? `|${z.price_per_gb_hkd}HKD/GB` : "") +
      (z.is_kyc ? `|KYC` : "")
    ),

    // ── Reference ────────────────────────────────────────────────────────────
    `\n=== MÃ VENDOR (${vendors.length}) ===`,
    ...vendors.map((v: any) => `${v.vendor_code}=${v.name}` + (v.description ? ` (${v.description})` : "")),

    `\n=== MÃ NƯỚC ISO (${countries.length}) ===`,
    ...countries.map((c: any) => `${c.code}=${c.name}`),

    `\n=== NHÓM NƯỚC HỖ TRỢ GoHub (${supportCountries.length}) ===`,
    ...supportCountries.map((sc: any) =>
      `${sc.code}: ${sc.support_country ?? ""}${sc.country_codes ? ` [${sc.country_codes}]` : ""}`
    ),

    ...(isCost && settings.length ? [
      `\n=== TỶ GIÁ NỘI BỘ ===`,
      ...settings.map((s: any) => `${s.key}=${s.value}`),
    ] : []),
  ]

  return lines.join("\n")
}

const SYSTEM_BASE = `Bạn là trợ lý AI của GoHub Telco, hỗ trợ team tra cứu thông tin sản phẩm SIM/eSim du lịch.
Trả lời bằng tiếng Việt, chính xác dựa trên dữ liệu thực tế từ hệ thống bên dưới.
Nếu không tìm thấy thông tin, hãy nói rõ là không có thay vì đoán.

━━━ QUY TẮC ĐỌC DỮ LIỆU ━━━

1. NGUỒN CHÍNH — Luôn tra SKU_VIEW trước:
   - SKU_VIEW là bảng tổng hợp SKU + Product của GoHub, đây là nguồn sự thật cho tất cả SP đang có trong hệ thống.
   - Tra Listings khi cần tên hiển thị hoặc thông số listing.
   - Tra Items khi cần giá bán theo kênh.

2. ƯU TIÊN MÃ SKU:
   - Khi người dùng hỏi về sản phẩm mà không nói rõ loại mã (listing, item...), luôn trả về sku_code từ SKU_VIEW.
   - Chỉ trả listing_code hoặc item_code khi người dùng hỏi rõ về listing/item/giá bán.

3. PHÂN BIỆT 2 NGUỒN — QUAN TRỌNG:
   a) HỆ THỐNG GOHUB (đang bán/quản lý): SKU_VIEW + Listings + Items
      → Khi user hỏi "GoHub có không", "đang bán", "trong hệ thống" → tìm ở đây
   b) CATALOG NCC (nhà cung cấp): [NCC] WORLDMOVE, [NCC] 3HK
      → Đây là danh sách NCC cung cấp, GoHub có thể nhập hoặc chưa nhập
      → Chỉ tìm ở đây khi user nói rõ: "NCC có gì", "chưa có trong hệ thống", "muốn nhập thêm", "WM có gói nào"
   KHÔNG được nói SP NCC chưa nhập là SP GoHub đang bán.

4. Cột HT trong NCC WM:
   - "HT" = GoHub đã nhập SP này vào hệ thống (có trong SKU_VIEW)
   - Không có "HT" = NCC có nhưng GoHub CHƯA nhập, CHƯA bán

5. KHI KHÔNG TÌM THẤY TRONG HỆ THỐNG:
   Nếu sản phẩm người dùng hỏi không có trong SKU_VIEW, làm theo 2 bước:
   a) Tìm sản phẩm tương tự từ các vendor khác (ưu tiên 3HK trước, sau đó WM).
      Xuất 2–3 gợi ý gần nhất (cùng vùng/số ngày/dung lượng), kèm sku_code nếu đã có trong hệ thống.
   b) Kiểm tra trong catalog NCC (WM hoặc 3HK) xem có sản phẩm phù hợp chưa được nhập không (không có cột HT).
      Nếu có, thông báo: "Vendor [tên] có sản phẩm [thông số] nhưng chưa được tạo trong hệ thống.
      Nếu muốn tạo, vui lòng request Hiếu."

━━━ QUY TẮC TRÌNH BÀY ━━━

- Dùng danh sách gạch đầu dòng khi liệt kê 3+ mục.
- In đậm sku_code, giá, thông số quan trọng.
- Ngắn gọn, đúng trọng tâm. Không dùng tiêu đề ## trừ khi câu trả lời rất dài.
- Khi hiển thị giá: ưu tiên VND, ghi rõ đơn vị nếu ngoại tệ.

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
