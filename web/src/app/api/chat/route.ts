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

// ─── Decode lookup tables ────────────────────────────────────────────────────

const PRODUCT_TYPE: Record<string, string> = {
  A: "SIM/eSIM Data (Datapack)", B: "eSIM Profile", C: "eSIM Full (Profile+Data)",
  D: "SIM Frame (SIM trắng)",    E: "SIM Full (Frame+Data)", F: "Phí Ship",
  G: "Quà tặng", H: "Khác",
  "1": "eSIM Full VN", "2": "SIM Full VN", "3": "Phí Ship VN", "4": "Dịch vụ VAT VN",
}

const DATA_POLICY: Record<string, string> = {
  // Daily cap + sau khi hết cap reset hàng ngày → unlimited throttled
  A: "Daily-cap→Unlim-5Mbps",   // cap hàng ngày, hết → unlimited 5Mbps
  B: "Daily-cap→Unlim-10Mbps",  // cap hàng ngày, hết → unlimited 10Mbps
  // Fixed total cap + hết cap → unlimited throttled (KHÔNG reset ngày)
  E: "Fixed-cap→Unlim-5Mbps",   // tổng cap cố định, hết → unlimited 5Mbps
  G: "Fixed-cap→Unlim-10Mbps",  // tổng cap cố định, hết → unlimited 10Mbps
  // Không cap, tốc độ cố định không throttle
  C: "Unlim-fixed-20Mbps",
  D: "Unlim-fixed-100Mbps",
  H: "Unlim-fixed-5Mbps",
  // Throttle sau khi hết cap (không unlimited sau đó)
  F: "Fixed-throttle<2Mbps",    // tổng cap cố định, hết → throttle <2Mbps
  P: "Daily-throttle<2Mbps",    // cap hàng ngày, hết → throttle <2Mbps
  Y: "Fixed-no-throttle",       // tổng cap cố định, không throttle sau
  Z: "Daily-no-throttle",       // cap hàng ngày, không throttle sau
  K: "eSIM-Profile/SIM-Frame",  // không có data, ch�� là SIM vỏ hoặc eSIM profile
}

const SOURCE_TYPE: Record<string, string> = {
  "1": "VN-StockDirect", "2": "VN-StockInternal", "3": "VN-MonthlyInvoice",
  "4": "VN-TelcoBalance", "5": "VN-Datapool", "6": "VN-Others",
  A: "US-StockDirect", B: "US-StockInternal", C: "US-MonthlyInvoice",
  D: "US-TelcoBalance", E: "US-Datapool",
}

const SKU_TYPE: Record<string, string> = {
  "Base": "Base", "Base + Datapack": "Base+Datapack", "Datapack": "Datapack",
}

function decodeProductType(code: string | null): string {
  if (!code) return "?"
  return PRODUCT_TYPE[code] ? `${code}(${PRODUCT_TYPE[code]})` : code
}

function decodeDataPolicy(code: string | null): string {
  if (!code) return "?"
  return DATA_POLICY[code] ? `${code}(${DATA_POLICY[code]})` : code
}

function decodeSourceType(code: string | null): string {
  if (!code) return "?"
  return SOURCE_TYPE[code] ? `${code}(${SOURCE_TYPE[code]})` : code
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

  // Build product map for decoding in SKU rows
  const prodMap: Record<string, any> = {}
  for (const s of skus) {
    if (s.product_code && !prodMap[s.product_code]) {
      prodMap[s.product_code] = {
        product_type: s.product_type,
        data_type: s.data_type,
        source_type: s.source_type,
        purchase_type: s.purchase_type,
        sku_type: s.sku_type,
        operator_code: s.operator_code,
      }
    }
  }

  return [
    // ── SKUs ────────────────────────────────────────────────────────────────
    `=== SẢN PHẨM GOHUB ĐANG CÓ (${skus.length} SKU active) ===`,
    `Cột: sku_code|product_code|tenant|SIM/eSIM|data/days|throttle|loại SP|data_policy|nguồn|nhà CC|vendor_sku|hết hạn|note|kyc|nước` +
      (isCost ? `|giá_vnd|giá_usd` : ""),
    ...skus.map((s: any) => {
      const p = prodMap[s.product_code] ?? {}
      return `${s.sku_code}|${s.product_code}|${s.tenant}|${s.sim_esim}` +
        `|${fmtData(s.data_amount, s.data_amount_unit)}/${s.day_amount}d` +
        `|${s.throttle_speed ?? "—"}` +
        `|${decodeProductType(p.product_type ?? null)}` +
        `|${decodeDataPolicy(p.data_type ?? null)}` +
        `|${decodeSourceType(p.source_type ?? null)}` +
        `|${p.operator_code ?? "—"}` +
        `|${s.vendor_sku ?? "—"}` +
        `|hh:${s.expirations ?? "—"}d` +
        (s.note ? `|${s.note}` : "") +
        (s.kyc_needed ? `|kyc:${s.kyc_needed}` : "") +
        (s.supported_countries ? `|${s.supported_countries}` : "") +
        (isCost ? `|vnd:${s.final_cogs_included_vat_vnd ?? "?"}|usd:${s.final_cogs_usd ?? "?"}` : "")
    }),

    // ── Listings ─────────────────────────────────────────────────────────────
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

━━━ NGHIỆP VỤ ━━━

2 PHÁP NHÂN:
- Gohub Inc (US): mua hàng từ vendor nước ngoài, nguồn A-E, bán lại cho Gohub JSC
- Gohub JSC (VN): mua từ Gohub Inc hoặc trực tiếp, nguồn 1-6, bán cho khách hàng VN
  → Tenant=US là sản phẩm của Gohub Inc, Tenant=VN là của Gohub JSC
  → VN mua từ US: source_type 2 hoặc 3 (Internal GHI)

CẤU TRÚC MÃ:
- Product code (8 ký tự): [source_type][product_type][country_3][vendor_2][data_policy]
- SKU code (13 ký tự): [product_code_8][data_amount_code_3][day_amount_2]
- Dữ liệu đã được decode inline (ví dụ: C(eSIM Full), F(Fixed<2Mbps), E(US-Datapool)).

QUAN HỆ PRODUCT ↔ SKU:
- 1 Product → nhiều SKU (khác nhau về data_amount và day_amount)
- Product: thông tin chung (loại SIM, nhà CC, mạng, APN, KYC, ghi chú)
- SKU: thông tin cụ thể (dung lượng, số ngày, giá, vendor_sku)

SKU TYPE:
- Base: SIM frame hoặc eSIM profile (không có data, ghép với Datapack)
- Datapack: gói data riêng, ghép vào Base
- Base+Datapack: sản phẩm hoàn chỉnh (thường gặp nhất)
  3HK có s���n frame SKU riêng → tạo sản phẩm 3HK phải có cả mã eSIM full (C) và eSIM data (A)

CHUỖI GIÁ: original_cost → latest_cogs → final_cogs_incl_vat_vnd (VND) / final_cogs_usd
  Khi nói "Giá" → dùng final_cogs_incl_vat_vnd (VND) hoặc final_cogs_usd.

EXPIRATIONS vs DAY_AMOUNT:
- day_amount = số ngày sử dụng data
- expirations = số ngày SIM còn hiệu lực sau kích hoạt (thường 90 ngày)
  → Mua gói 7 ngày nhưng SIM vẫn kích hoạt được trong 90 ngày.

COGS 3HK (US Datapool — source_type E) — chỉ admin/manager:
  Giá 3HK theo khu vực (HKD/GB): Châu Á 12 nước = 5 HKD | Châu Âu+US = 7 HKD | AU/NZ = 6.5 HKD
  Công thức tính COGS:
  - Fixed:     GB × giá_HKD/GB × 55% ÷ tỷ_giá_HKD/USD
  - Daily:     GB/ngày × số_ngày × giá_HKD/GB × 40% ÷ tỷ_giá_HKD/USD
  - Unlim 10Mbps: 1.8 GB/ngày × số_ngày × giá_HKD/GB ÷ tỷ_giá_HKD/USD
  - Unlim 5Mbps:  1.6 GB/ngày × số_ngày × giá_HKD/GB ÷ tỷ_giá_HKD/USD
  (Tỷ giá HKD/USD hiện tại ≈ 7.798; tra bảng Tỷ giá để lấy giá trị tháng hiện tại)

TỶ GIÁ NỘI BỘ (T03/2026 — tháng gần nhất có dữ liệu):
  USD/VND = 26,394 | HKD/USD = 7.798 | CNY/VND = 3,970 | GBP/VND = 35,957

━━━ CÁCH TRẢ LỜI ━━━

- Tìm trong SẢN PHẨM GOHUB ĐANG CÓ trước. Đây là sản phẩm GoHub đang quản lý và bán.
- Chỉ đề xuất SKU có product_type C (eSIM Full) hoặc E (SIM Full). Product_type A là Datapack — gói data riêng lẻ, chưa dùng được độc lập — KHÔNG giới thiệu cho người dùng.
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
