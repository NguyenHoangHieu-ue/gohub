import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { GoogleGenerativeAI }       from "@google/generative-ai"
import { getRefCache }              from "@/lib/agents/cache"
import { AGENTS }                   from "@/lib/agents/agents"
import { route }                    from "@/lib/agents/router"
import {
  searchSkus, getProductDetail, getProductByCode, decodeSkuCode,
  getCountryInfo, getVendorInfo,
  getFxRates, getSkuCogs, calculate3hkCogs,
  searchNccWm, searchNcc3hk, findGaps,
  getItems, searchListings, identifyCode,
} from "@/lib/agents/tools"
import type { Message, UserRole }   from "@/lib/agents/types"

// Convert COGS to USD + VND using fx rates
function convertCogs(cogs: number, currency: string, fx: Record<string, number>): { usd: number; vnd: number } {
  const usdVnd = fx["fx.usd_vnd"] ?? 26000
  const hkdUsd = fx["fx.hkd_usd"] ?? 0.128
  const twdUsd = fx["fx.twd_usd"] ?? 0.031
  let usd = 0
  switch (currency?.toUpperCase()) {
    case "USD": usd = cogs; break
    case "VND": usd = cogs / usdVnd; break
    case "HKD": usd = cogs * hkdUsd; break
    case "TWD": usd = cogs * twdUsd; break
    default:    usd = cogs; break
  }
  return { usd: Math.round(usd * 10000) / 10000, vnd: Math.round(usd * usdVnd) }
}

// Pre-execute tools based on agent + extracted params, return context string
async function buildToolContext(
  agentId: string,
  params:  ReturnType<typeof import("@/lib/agents/router").route>["params"],
  ref:     Awaited<ReturnType<typeof getRefCache>>,
  isCost:  boolean
): Promise<string> {
  const sections: string[] = []

  // Fetch FX rates once for any agent that shows COGS
  let fx: Record<string, number> = {}
  if (isCost) {
    const rates = await getFxRates()
    for (const r of rates) fx[r.key] = parseFloat(r.value)
  }

  if (agentId === "tu-van" && params.country) {
    const { skus, note } = await searchSkus({
      country:     params.country,
      days:        params.days,
      data_gb:     params.dataGB,
      is_unlimited: params.isUnlimited,
      vendor:      params.vendor,
    }, ref)

    const rows = skus.map(s => {
      const dataStr = s.is_unlimited || (s.data_amount ?? 0) >= 9999
        ? "Unlimited"
        : s.data_amount != null
          ? `${s.data_amount}${s.data_amount_unit ?? "GB"}${s.is_daily ? "/ngày" : ""}`
          : null
      let cogsStr: string | null = null
      if (isCost && s.latest_cogs != null) {
        const { usd, vnd } = convertCogs(s.latest_cogs, s.latest_cogs_currency, fx)
        cogsStr = `cogs:$${usd} USD / ${vnd.toLocaleString("en-US")} VND`
      }
      const parts = [
        s.sku_code, s.tenant, s.sim_esim ?? null, dataStr, `${s.day_amount}d`,
        s.throttle_speed ? `throttle:${s.throttle_speed}` : null,
        s.operator_code  ? `operator:${s.operator_code}`  : null,
        s.kyc_needed     ? `kyc:${s.kyc_needed}`           : null,
        cogsStr,
      ]
      return parts.filter(Boolean).join("|")
    })
    sections.push(
      `=== SẢN PHẨM GOHUB: ${skus.length} SKU (nước=${params.country}${params.days ? ` ${params.days}d` : ""}${params.dataGB ? ` ${params.dataGB}GB` : ""}${params.isUnlimited ? " Unlimited" : ""}) ===`,
      note ? `Lưu ý: ${note}` : "",
      `sku_code|tenant|sim|data|days|throttle|operator|kyc${isCost ? "|cogs(USD/VND)" : ""}`,
      ...rows
    )

    // ── Inject NCC catalog (WORLDMOVE) ──────────────────────────────────────────
    // exist=Yes  → WM product này GoHub ĐÃ TẠO thành SKU
    // exist=No   → WM product này GoHub CHƯA TẠO, không thể bán cho khách
    const wmResults = searchNccWm({ country: params.country, days: params.days }, ref)
    if (wmResults.length) {
      const existYes = wmResults.filter((p: any) => p.exist === "Yes").length
      const existNo  = wmResults.filter((p: any) => p.exist === "No").length
      const wmRows = wmResults.slice(0, 15).map((p: any) => {
        const dataStr2 = p.is_unlimited ? "Unlimited" : p.data_gb != null ? `${p.data_gb}GB` : "?"
        const cogsStr2 = isCost && p.cogs != null ? `${p.cogs}${p.cogs_currency ?? ""}` : null
        const status   = p.exist === "Yes" ? "ĐÃ CÓ trong GoHub" : "CHƯA TẠO trong GoHub"
        const notif    = p.notification ? `notification:${p.notification}` : null
        const apnStr   = p.apn ? `apn:${p.apn}` : null
        return [p.vendor_product_id, p.sim_type, `${p.days}d`, dataStr2, status, cogsStr2, apnStr, notif]
          .filter(Boolean).join("|")
      })
      sections.push(
        `=== WORLDMOVE CATALOG cho ${params.country} (tổng ${wmResults.length}: đã tạo=${existYes}, chưa tạo=${existNo}) ===`,
        `[Lưu ý: đây là danh sách NCC, KHÔNG phải sản phẩm GoHub. exist="ĐÃ CÓ trong GoHub" mới có thể bán]`,
        `vendor_id|sim_type|days|data|trạng_thái_GoHub${isCost ? "|cogs" : ""}|apn|notification`,
        ...wmRows,
        wmResults.length > 15 ? `... (còn ${wmResults.length - 15} sản phẩm WM khác cho nước này)` : ""
      )
    } else {
      sections.push(`=== WORLDMOVE CATALOG cho ${params.country}: 0 sản phẩm ===`)
    }

    // ── Inject NCC catalog (3HK) ─────────────────────────────────────────────
    const hkResults = searchNcc3hk(params.country, ref)
    if (hkResults.length) {
      sections.push(
        `=== 3HK ZONES cho ${params.country} (${hkResults.length} zones) — tham khảo, KHÔNG phải sản phẩm GoHub ===`,
        hkResults.map((z: any) =>
          `zone:${z.zone}|mạng:${z.network ?? "?"}|${isCost ? `giá:${z.price_per_gb_hkd}HKD/GB` : ""}|KYC:${z.is_kyc ? "Yes" : "No"}`
        ).join("\n")
      )
    }
  }

  if (agentId === "tra-cuu") {
    const productCodes = params.productCodes ?? (params.productCode ? [params.productCode] : [])
    const skuCodes     = params.skuCodes     ?? (params.skuCode     ? [params.skuCode]     : [])
    const listingCodes = params.listingCodes ?? (params.listingCode ? [params.listingCode] : [])
    const isMulti = (productCodes.length + skuCodes.length + listingCodes.length) > 1

    // ── Product codes ──────────────────────────────────────────────────────────
    if (productCodes.length) {
      const results = await Promise.all(productCodes.map(pc => getProductByCode(pc)))
      if (isMulti) {
        sections.push(`=== MULTI LOOKUP: ${productCodes.length} Product Code ===`)
        for (let i = 0; i < productCodes.length; i++) {
          const d = results[i]
          if (d?.error) { sections.push(`[${i+1}] ${productCodes[i]}: Không tìm thấy`); continue }
          const skuSummary = (d.skus ?? []).slice(0, 5).map((s: any) => {
            const dataStr = s.data_amount ? `${s.data_amount}${s.data_amount_unit ?? "GB"}` : "?"
            const cogsStr = isCost && s.latest_cogs
              ? ` cogs:${convertCogs(s.latest_cogs, s.latest_cogs_currency, fx).usd}USD` : ""
            return `${s.sku_code}|${dataStr}|${s.day_amount ?? "?"}d${cogsStr}`
          }).join("; ")
          sections.push(`[${i+1}] ${productCodes[i]} | ${d.product?.status ?? "?"} | SKUs: ${skuSummary}`)
        }
      } else {
        const d = results[0]
        if (isCost && d?.skus) {
          d.skus = d.skus.map((s: any) => {
            if (s.latest_cogs != null) {
              const { usd, vnd } = convertCogs(s.latest_cogs, s.latest_cogs_currency, fx)
              return { ...s, cogs_usd: usd, cogs_vnd: vnd }
            }
            return s
          })
        }
        sections.push(`=== CHI TIẾT PRODUCT CODE: ${productCodes[0]} ===`, JSON.stringify(d, null, 2))
      }
    }

    // ── SKU / Listing / Item codes ─────────────────────────────────────────────
    const otherCodes = [...skuCodes, ...listingCodes]
    if (otherCodes.length) {
      const identified = await Promise.all(otherCodes.map(c => identifyCode(c)))

      if (isMulti || otherCodes.length > 1) {
        sections.push(`=== MULTI LOOKUP: ${otherCodes.length} mã (SKU/Listing/Item) ===`)
        const detailResults = await Promise.all(otherCodes.map(async (code, i) => {
          const id = identified[i]
          if (!id.found) return `[${i+1}] ${code}: Không tìm thấy (${id.hint ?? ""})`
          if (id.type === "SKU") {
            const d = await getProductDetail(code)
            if (!d || d.error) return `[${i+1}] ${code}: Lỗi khi tìm`
            const s = d.sku
            const dataStr = s.data_amount ? `${s.data_amount}${s.data_amount_unit ?? "GB"}` : "Unlimited"
            const cogsStr = isCost && s.latest_cogs
              ? ` | cogs:${convertCogs(s.latest_cogs, s.latest_cogs_currency, fx).usd}USD` : ""
            return `[${i+1}] SKU:${code} | ${s.status} | ${s.sim_esim ?? "?"} | ${dataStr} | ${s.day_amount ?? "?"}d | throttle:${s.throttle_speed || "none"}${cogsStr}`
          }
          if (id.type === "Product Code") {
            const d = await getProductByCode(code)
            if (!d || d.error) return `[${i+1}] ${code}: Không tìm thấy`
            return `[${i+1}] Product:${code} | ${d.product?.status ?? "?"} | SKUs: ${(d.skus ?? []).length}`
          }
          return `[${i+1}] ${code}: loại ${id.type}`
        }))
        sections.push(...detailResults)
      } else {
        // Single code — full detail như cũ
        const code = otherCodes[0]
        const id   = identified[0]
        sections.push(`=== NHẬN DẠNG MÃ: ${code} ===`, JSON.stringify(id, null, 2))
        if (id.found) {
          if (id.type === "SKU") {
            const detail = await getProductDetail(code)
            if (isCost && detail?.sku?.latest_cogs != null) {
              const { usd, vnd } = convertCogs(detail.sku.latest_cogs, detail.sku.latest_cogs_currency, fx)
              detail.sku.cogs_usd = usd; detail.sku.cogs_vnd = vnd
            }
            sections.push(`=== CHI TIẾT SKU ===`, JSON.stringify(detail, null, 2))
            sections.push(`=== GIẢI MÃ ===`, JSON.stringify(decodeSkuCode(code), null, 2))
          } else if (id.type === "Product Code") {
            const detail = await getProductByCode(code)
            if (isCost && detail?.skus) {
              detail.skus = detail.skus.map((s: any) => {
                if (s.latest_cogs != null) {
                  const { usd, vnd } = convertCogs(s.latest_cogs, s.latest_cogs_currency, fx)
                  return { ...s, cogs_usd: usd, cogs_vnd: vnd }
                }
                return s
              })
            }
            sections.push(`=== CHI TIẾT PRODUCT CODE: ${code} ===`, JSON.stringify(detail, null, 2))
          } else if (id.type === "Alias (Item)") {
            const [items, skuDetail] = await Promise.all([
              getItems({ sku_code: id.sku_code }),
              id.sku_code ? getProductDetail(id.sku_code) : Promise.resolve(null),
            ])
            sections.push(`=== ITEM / ALIAS ===`, JSON.stringify(items, null, 2))
            if (skuDetail) sections.push(`=== SKU LIÊN KẾT ===`, JSON.stringify(skuDetail, null, 2))
          } else if (id.type === "Listing Code") {
            const [listings, items] = await Promise.all([
              searchListings({ product_code: code }),
              getItems({ listing_code: code }),
            ])
            sections.push(`=== LISTING ===`, JSON.stringify(listings, null, 2))
            sections.push(`=== ITEMS ===`, JSON.stringify(items, null, 2))
          }
        }
      }
    }
  }

  if (agentId === "giai-dap") {
    const vendors = getVendorInfo(undefined, ref)
    sections.push(
      `=== DANH SÁCH VENDOR (${vendors.length}) ===`,
      vendors.map((v: any) => `${v.vendor_code} = ${v.name}`).join("\n")
    )
    if (params.skuCode) sections.push(`=== GIẢI MÃ SKU ===`, JSON.stringify(decodeSkuCode(params.skuCode), null, 2))
    if (params.country) {
      sections.push(`=== NHÓM NƯỚC "${params.country}" ===`, JSON.stringify(getCountryInfo(params.country, ref), null, 2))
      // Inject NCC nếu hỏi về nước cụ thể
      const wmR = searchNccWm({ country: params.country }, ref)
      if (wmR.length) {
        const existYes = wmR.filter((p: any) => p.exist === "Yes").length
        sections.push(
          `=== WORLDMOVE cho ${params.country} (${wmR.length} SP: đã tạo GoHub=${existYes}, chưa tạo=${wmR.length - existYes}) ===`,
          `[Đây là catalog NCC — exist="ĐÃ CÓ trong GoHub" mới có thể bán]`
        )
      }
    }
    // Inject NCC nếu hỏi trực tiếp về WM/3HK
    if (params.nccVendor === "wm") {
      const wmAll = searchNccWm({}, ref)
      const existYes = wmAll.filter((p: any) => p.exist === "Yes").length
      sections.push(
        `=== WORLDMOVE CATALOG — TỔNG QUAN ===`,
        `Tổng: ${wmAll.length} SP | Đã tạo trong GoHub: ${existYes} | Chưa tạo: ${wmAll.length - existYes}`,
        `[Đây là catalog NCC — KHÔNG phải sản phẩm GoHub]`
      )
    }
  }

  if (agentId === "gia-cogs") {
    sections.push(`=== TỶ GIÁ NỘI BỘ ===`, JSON.stringify(Object.entries(fx).map(([key, value]) => ({ key, value })), null, 2))
    if (params.skuCode) {
      const cogs = await getSkuCogs(params.skuCode)
      if (cogs && !cogs.error && cogs.latest_cogs != null) {
        const { usd, vnd } = convertCogs(cogs.latest_cogs, cogs.latest_cogs_currency, fx)
        cogs.cogs_usd = usd
        cogs.cogs_vnd = vnd
      }
      sections.push(`=== COGS SKU ${params.skuCode} ===`, JSON.stringify(cogs, null, 2))
    }
  }

  if (agentId === "gap-analysis") {
    const gaps = findGaps({ country: params.country, vendor: params.nccVendor }, ref)
    sections.push(
      `=== GAP ANALYSIS${params.country ? ` — ${params.country}` : ""} ===`,
      JSON.stringify(gaps, null, 2)
    )
  }

  const filtered = sections.filter(Boolean)
  return filtered.length ? filtered.join("\n") : ""
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { messages, userName } = await req.json()
  const role    = (session.user.role || "standard") as UserRole
  const name    = userName || session.user.name || "bạn"
  const history = (messages as Message[]).slice(0, -1)
  const lastMsg = (messages as Message[]).at(-1)?.content ?? ""
  const isCost  = true

  try {
    const refCache = await getRefCache()

    // Route (rule-based, instant)
    const { agentId, agentName, params } = route(lastMsg, history, role)
    const agent = AGENTS[agentId]

    // Pre-execute tools, build context
    const toolCtx = await buildToolContext(agentId, params, refCache, isCost)

    // Build system prompt with injected data
    const systemInstruction = [
      agent.systemPrompt,
      toolCtx ? `\n\n=== DỮ LIỆU TỪ HỆ THỐNG ===\n${toolCtx}` : "",
      `\nNgười dùng: ${name} (vai trò: ${role})`,
    ].join("")

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash", systemInstruction })

    const geminiHistory = history.map((m: Message) => ({
      role:  m.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: m.content }],
    }))

    const result = await model.startChat({ history: geminiHistory }).sendMessageStream(lastMsg)

    const encoder = new TextEncoder()
    const stream  = new ReadableStream({
      async start(controller) {
        try {
          // Send agent metadata first
          controller.enqueue(encoder.encode(`__AGENT__:${agentId}:${agentName}\n`))
          for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) controller.enqueue(encoder.encode(text))
          }
          controller.close()
        } catch (err: any) {
          const msg = role === "admin" ? `Lỗi: ${err.message}` : "Hiếu đang fix, vui lòng đợi 🔧"
          controller.enqueue(encoder.encode(msg))
          controller.close()
        }
      },
    })

    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
