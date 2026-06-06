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

async function getRawData(): Promise<CacheData> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL) return cache.data

  const [
    skusRaw, productsRaw, listings, items,
    wmProducts, wmSkusRaw,
    zones3hk,
    countries, supportCountries,
    vendors, settings,
  ] = await Promise.all([
    // SKUs — chỉ cột có trong PM system (bỏ: sku_ref, product_type text, parents, synced_at, dates)
    supabaseAdmin.from("skus").select(
      "sku_code,product_code,tenant,status,sim_esim,data_amount,data_amount_unit,day_amount,day_amount_unit,throttle_speed,call,expirations,frame,datapack,call_sms_details,vendor_sku,vendor_sku_sim,latest_cogs,latest_cogs_currency,final_cogs_included_vat_vnd,final_cogs_usd,wr_group,currency"
    ).eq("status", "Active").limit(SKU_LIMIT).then(r => r.data ?? []),
    // Products — chỉ cột có trong PM system (bỏ: product_ref, gc_purchase_type, synced_at, dates)
    supabaseAdmin.from("products").select(
      "product_code,tenant,status,type_of_sim,product_type,operator_code,vendor_code,source_type,data_type,purchase_type,sku_type,import_type,supported_countries,network_type,onsite_carrier,local_phone_number,hotspot,kyc_code,kyc_needed,top_up_options,base_sim_esim_sku_code,daily_reset_time,activation_time,apn,local_number_country,kyc_links,activation,unsupported_apps,telco_perks,note,data_plan_type"
    ).then(r => r.data ?? []),
    // Listings — chỉ cột PM (bỏ: listing_ref, price_list, esim_type, raw_, backup, highlight, template codes, dates)
    supabaseAdmin.from("listings").select(
      "listing_code,tenant,status,listing_name_en,listing_name_vn,listing_type,reference_product_code,type_of_sim,product_type,network_operator,data_type_en,supported_countries,daily_reset_time_en,activation_time_en,network_type,apn,hotspot_en,kyc_needed_en,kyc_links_en,expirations_en,top_up_options_en,activation_en,unsupported_apps_en,telco_perks_en,note_en,note_vn,call_en,call_sms_details_en,local_phone_number_country,category_code"
    ).eq("status", "Active").limit(LIST_LIMIT).then(r => r.data ?? []),
    // Items — chỉ cột PM (bỏ: item_ref, alias, price_list, channel, pricelistcode, dates)
    supabaseAdmin.from("items").select(
      "item_code,sku_code,listing_code,tenant,status,item_type,item_name_en,item_name_vn,day_amount,day_amount_unit,data_amount,data_amount_unit,throttle_speed_en,call_en,call_sms_details_en,sales_channel,unitprice,currency,category_code"
    ).eq("status", "Active").limit(ITEM_LIMIT).then(r => r.data ?? []),
    supabaseAdmin.from("ncc_worldmove")
      .select("vendor_product_id,product_name,region,sim_type,days,data_gb,is_daily,is_unlimited,throttle_kbps,cogs,cogs_currency,is_kyc,is_lesim")
      .eq("status", "active").order("region").then(r => r.data ?? []),
    supabaseAdmin.from("skus").select("vendor_sku").ilike("vendor_sku", "WM-%")
      .then(r => r.data ?? []),
    supabaseAdmin.from("ncc_3hk").select("zone,country,network,price_per_gb_hkd,is_kyc")
      .order("zone").then(r => r.data ?? []),
    supabaseAdmin.from("ref_countries").select("code,name").order("code").then(r => r.data ?? []),
    supabaseAdmin.from("ref_support_countries").select("code,support_country,country_codes").order("code").then(r => r.data ?? []),
    supabaseAdmin.from("ref_vendors").select("vendor_code,name,description").order("vendor_code").then(r => r.data ?? []),
    supabaseAdmin.from("app_settings").select("key,value").then(r => r.data ?? []),
  ])

  // Enrich SKUs với product data
  const prodMap = Object.fromEntries((productsRaw as any[]).map((p: any) => [p.product_code, p]))
  const skus = (skusRaw as any[]).map((s: any) => {
    const p = prodMap[s.product_code] ?? {}
    return { ...s, note: p.note ?? null, kyc_needed: p.kyc_needed ?? null, network_type: p.network_type ?? null, operator_code: p.operator_code ?? null, supported_countries: p.supported_countries ?? null }
  })

  const wmInSystemSet = new Set<string>((wmSkusRaw as any[]).map((s: any) => s.vendor_sku as string))

  const data: CacheData = { skus, listings, items, wmProducts, wmInSystemSet, zones3hk, countries, supportCountries, vendors, settings }
  cache = { data, at: now }
  return data
}

function fmtData(amount: number | null, unit: string | null): string {
  if (!amount || amount >= 9999) return "Unlimited"
  return amount < 1 ? `${Math.round(amount * 1000)}MB` : `${amount}${unit ?? "GB"}`
}

function fmtWmData(p: any): string {
  if (p.is_unlimited || (p.data_gb ?? 0) >= 9999)
    return p.is_daily ? `${p.data_gb ?? "?"}GB/d+Unlim` : "Unlimited"
  if (!p.data_gb) return "?"
  const gb = p.data_gb < 1 ? `${Math.round(p.data_gb * 1000)}MB` : `${p.data_gb}GB`
  return p.is_daily ? `${gb}/ngày` : gb
}

function fmtThrottle(kbps: number | null): string {
  if (!kbps) return "NoLimit"
  return kbps >= 1000 ? `${kbps / 1000}Mbps` : `${kbps}kbps`
}

function buildContext(d: CacheData, role: string): string {
  const isCost = role === "admin" || role === "manager"
  const { skus, listings, items, wmProducts, wmInSystemSet, zones3hk, countries, supportCountries, vendors, settings } = d

  return [
    `=== SẢN PHẨM GOHUB ĐANG CÓ (${skus.length} SKU active) ===`,
    `sku_code|product_code|tenant|SIM/eSIM|data/days|throttle|vendor_sku|note|kyc|countries` +
      (isCost ? `|cogs_vnd|cogs_usd` : ""),
    ...skus.map((s: any) =>
      `${s.sku_code}|${s.product_code}|${s.tenant}|${s.sim_esim}` +
      `|${fmtData(s.data_amount, s.data_amount_unit)}/${s.day_amount}d` +
      `|${s.throttle_speed ?? "—"}|${s.vendor_sku ?? "—"}` +
      (s.note ? `|${s.note}` : "") +
      (s.kyc_needed ? `|kyc:${s.kyc_needed}` : "") +
      (s.supported_countries ? `|${s.supported_countries}` : "") +
      (isCost ? `|vnd:${s.final_cogs_included_vat_vnd ?? "?"}|usd:${s.final_cogs_usd ?? "?"}` : "")
    ),

    `\n=== LISTINGS GOHUB (${listings.length}) ===`,
    ...listings.map((l: any) =>
      `${l.listing_code}|${l.listing_name_vn}|${l.type_of_sim}|op:${l.network_operator}|exp:${l.expirations_en}ngày`
    ),

    `\n=== ITEMS GOHUB — giá bán theo kênh (${items.length}) ===`,
    ...items.map((i: any) =>
      `${i.item_name_vn}|listing:${i.listing_code}|${i.unitprice}${i.currency}|${fmtData(i.data_amount, i.data_amount_unit)}/${i.day_amount}d`
    ),

    `\n=== CATALOG NCC: WORLDMOVE (${wmProducts.length} SP — KHÔNG phải SP GoHub đang bán) ===`,
    `HT = đã có trong hệ thống GoHub. Không có HT = chưa được nhập.`,
    `vendor_id|vùng|loại|ngày|data|throttle` + (isCost ? `|giá(${wmProducts[0]?.cogs_currency ?? "TWD"})` : "") + `|[HT]`,
    ...(wmProducts as any[]).map((p: any) =>
      `${p.vendor_product_id}|${p.region}|${p.sim_type}|${p.days}d` +
      `|${fmtWmData(p)}|${fmtThrottle(p.throttle_kbps)}` +
      (isCost ? `|${p.cogs ?? "?"}` : "") +
      (wmInSystemSet.has(p.vendor_product_id) ? "|HT" : "")
    ),

    `\n=== CATALOG NCC: 3HK — zones (${zones3hk.length}) ===`,
    `zone|quốc gia|mạng` + (isCost ? `|giá/GB(HKD)` : "") + `|KYC`,
    ...(zones3hk as any[]).map((z: any) =>
      `${z.zone}|${z.country}|${z.network ?? "—"}` +
      (isCost ? `|${z.price_per_gb_hkd ?? "?"}` : "") +
      (z.is_kyc ? `|KYC` : "")
    ),

    `\n=== MÃ VENDOR (${vendors.length}) ===`,
    ...(vendors as any[]).map((v: any) => `${v.vendor_code}=${v.name}` + (v.description ? ` — ${v.description}` : "")),

    `\n=== MÃ NƯỚC ISO (${countries.length}) ===`,
    ...(countries as any[]).map((c: any) => `${c.code}=${c.name}`),

    `\n=== NHÓM NƯỚC HỖ TRỢ (${supportCountries.length}) ===`,
    ...(supportCountries as any[]).map((sc: any) =>
      `${sc.code}: ${sc.support_country ?? ""}${sc.country_codes ? ` [${sc.country_codes}]` : ""}`
    ),

    ...(isCost && (settings as any[]).length ? [
      `\n=== TỶ GIÁ NỘI BỘ ===`,
      ...(settings as any[]).map((s: any) => `${s.key}=${s.value}`),
    ] : []),
  ].join("\n")
}

const SYSTEM_PROMPT = `Bạn là trợ lý AI của GoHub Telco, giúp team tra cứu thông tin sản phẩm SIM/eSIM du lịch.
Trả lời bằng tiếng Việt, dựa trên dữ liệu thực tế. Không đề cập tên bảng/cột database trong câu trả lời.
Giọng văn chuyên nghiệp, thân thiện vừa phải. Không dùng emoji.

━━━ NGHIỆP VỤ — ĐỌC KỸ TRƯỚC ━━━

CẤU TRÚC MÃ:
- Product code (8 ký tự): [source_type(1)][product_type(1)][country(3)][vendor(2)][data_policy(1)]
- SKU code (13 ký tự): [product_code(8)][data_amount_code(3)][day_amount(2)]

PRODUCT TYPE (loại sản phẩm):
  A=SIM/eSIM Data (Datapack)  B=eSIM Profile  C=eSIM Full (A+B)
  D=SIM Frame (SIM trắng)     E=SIM Full (A+D) F=Phí Ship  G=Quà tặng  H=Khác
  Số (VN only): 1=eSIM Full VN  2=SIM Full VN  3=Phí Ship  4=Dịch vụ VAT khác
  → product_type trong skus là tên text: ví dụ C → "eSIM full"

SOURCE TYPE (nguồn/kênh nhập hàng — ký tự đầu product_code):
  VN: 1=Stock Direct  2=Stock Internal GHI  3=Monthly Invoice GHI  4=Telco Balance  5=Datapool  6=Others
  US: A=Stock Direct  B=Stock Internal GHV  C=Monthly Invoice GHV  D=Telco Balance  E=Datapool

DATA POLICY CODE (ký tự cuối product_code — loại & tốc độ data):
  A=Daily Unlimited 5Mbps    B=Daily Unlimited 10Mbps   C=Unlimited 20Mbps
  D=Unlimited 100Mbps        E=Fixed Unlimited 5Mbps    G=Fixed Unlimited 10Mbps
  F=Fixed throttle <2Mbps    P=Daily throttle <2Mbps    Y=Fixed không throttle
  Z=Daily không throttle     K=Dành cho eSIM profile và SIM frame

PURCHASE TYPE (phương thức mua): Manual Purchase / API Purchase / Only Stock

SKU TYPE: Base (product_type B hoặc D) | Base+Datapack (C hoặc E) | Datapack (A)

FRAME SKU & DATAPACK SKU: dùng cho sản phẩm type Base+Datapack.
  Frame SKU = WMBLANKSIM/WMBLANKESIM hoặc 3HKDATAPOOLSIM/3HKDATAPOOLESIM
  Datapack SKU = mã SKU data riêng ghép vào SIM frame

CHUỖI GIÁ (SKU): original_cost → latest_cogs → final_cogs_not_vat → final_cogs_incl_vat_vnd / final_cogs_usd
  "Giá" = final_cogs_incl_vat_vnd (VND) hoặc final_cogs_usd (USD)

EXPIRATIONS: số ngày SIM còn hiệu lực sau kích hoạt (≥ day_amount, ví dụ gói 7 ngày nhưng SIM hết hạn sau 90 ngày).

━━━ CÁCH TRẢ LỜI ━━━

- Tìm trong SẢN PHẨM GOHUB ĐANG CÓ trước. Đây là sản phẩm GoHub đang quản lý và bán.
- Khi đề cập sản phẩm: CHỈ dùng sku_code hoặc product_code. TUYỆT ĐỐI không nhắc listing_code hay item_code trừ khi người dùng hỏi rõ "listing" hoặc "item".
- Khi hỏi về giá: chỉ dùng chữ "Giá" — không dùng "giá bán", "giá gốc", "COGS".
- Data 9999GB = "Unlimited data".
- Nếu không rõ SIM hay eSIM: xuất cả 2, hoặc hỏi lại nếu cần gợi ý cụ thể.
- Khi hỏi chung "có gói nào": liệt kê ~10 kết quả phù hợp, hỏi thêm "Bạn cần thêm thông tin về sản phẩm nào không?"

KHI HỆ THỐNG CÓ ÍT HƠN 3 KẾT QUẢ PHÙ HỢP:
Tìm thêm trong CATALOG NCC (WM hoặc 3HK) — hàng NCC có nhưng GoHub chưa nhập.
Gợi ý 2–3 SP tương tự, kèm dòng: "**Nếu muốn request sản phẩm này, nhắn Hiếu nha.**"
CATALOG NCC ≠ sản phẩm GoHub đang bán — không được nhầm lẫn.

ĐỊNH DẠNG: Danh sách gạch đầu dòng khi liệt kê 3+ mục. In đậm sku_code, giá, thông số quan trọng.

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
    const systemInstruction = `${SYSTEM_PROMPT}\n${context}\n\n---\nNgười đang chat: ${name}`

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
