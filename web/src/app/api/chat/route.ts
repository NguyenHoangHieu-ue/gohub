import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { GoogleGenerativeAI }       from "@google/generative-ai"
import { supabaseAdmin }            from "@/lib/supabase"
import { getRefCache }              from "@/lib/agents/cache"
import { AGENTS }                   from "@/lib/agents/agents"
import { route, type ExtractedParams } from "@/lib/agents/router"
import {
  searchSkus, searchSkusSemantic,
  getProductDetail, getProductByCode, decodeSkuCode,
  getCountryInfo, getVendorInfo,
  getFxRates, findGaps,
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
  params:  ExtractedParams,
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
      country:      params.country,
      days:         params.days,
      data_gb:      params.dataGB,
      is_unlimited: params.isUnlimited,
      vendor:       params.vendor,
      sim_type:     params.simType,
    }, ref)

    const rows = skus.map(s => {
      const dataStr = s.is_unlimited || (s.data_amount ?? 0) >= 9999
        ? "Unlimited"
        : s.data_amount != null
          ? `${s.data_amount}${s.data_amount_unit ?? "GB"}${s.is_daily ? "/ngày" : ""}`
          : null
      let cogsVnd: string | null = null
      let cogsUsd: string | null = null
      if (isCost && s.latest_cogs != null) {
        const { usd, vnd } = convertCogs(s.latest_cogs, s.latest_cogs_currency, fx)
        cogsVnd = vnd.toLocaleString("en-US")
        cogsUsd = `$${usd}`
      }
      const parts = [
        s.sku_code, s.tenant, s.sim_esim ?? null, dataStr, `${s.day_amount}d`,
        s.throttle_speed ? `throttle:${s.throttle_speed}` : null,
        s.operator_code  ? `operator:${s.operator_code}`  : null,
        s.kyc_needed     ? `kyc:${s.kyc_needed}`           : null,
        s.call           ? `call:${s.call}`                : null,
        s.hotspot        ? `hotspot:${s.hotspot}`          : null,
        cogsVnd,
        cogsUsd,
        s.note           ? `[note:${s.note}]`              : null,
      ]
      return parts.filter(Boolean).join("|")
    })
    sections.push(
      `=== SẢN PHẨM GOHUB: ${skus.length} SKU (nước=${params.country}${params.days ? ` ${params.days}d` : ""}${params.dataGB ? ` ${params.dataGB}GB` : ""}${params.isUnlimited ? " Unlimited" : ""}) ===`,
      note ? `Lưu ý: ${note}` : "",
      `sku_code|tenant|sim|data|days|throttle|operator|kyc|call|hotspot${isCost ? "|cogs_vnd|cogs_usd" : ""}|[note nếu có]`,
      ...rows
    )

    // Semantic fallback: standard search trả về 0 → thử vector search
    if (skus.length === 0) {
      const semQuery = [params.country, params.days ? `${params.days} ngày` : "",
        params.isUnlimited ? "unlimited" : "", params.dataGB ? `${params.dataGB}GB` : "",
        params.simType || ""].filter(Boolean).join(" ")
      const semCodes = await searchSkusSemantic(semQuery, 10)
      if (semCodes.length) {
        const { data: semSkus } = await supabaseAdmin
          .from("sku_catalog")
          .select("sku_code,tenant,sim_esim,data_amount,data_amount_unit,is_unlimited,is_daily,day_amount,throttle_speed,call,kyc_needed,operator_code,latest_cogs,latest_cogs_currency,note")
          .eq("status", "Active").in("sku_code", semCodes)
        if (semSkus?.length) {
          const semRows = semSkus.map((s: any) => {
            const dataStr = s.is_unlimited || (s.data_amount ?? 0) >= 9999 ? "Unlimited"
              : s.data_amount != null ? `${s.data_amount}${s.data_amount_unit ?? "GB"}${s.is_daily ? "/ngày" : ""}` : null
            let cogsVnd: string | null = null, cogsUsd: string | null = null
            if (isCost && s.latest_cogs != null) {
              const { usd, vnd } = convertCogs(s.latest_cogs, s.latest_cogs_currency, fx)
              cogsVnd = vnd.toLocaleString("en-US"); cogsUsd = `$${usd}`
            }
            return [s.sku_code, s.tenant, s.sim_esim ?? null, dataStr, `${s.day_amount}d`,
              s.throttle_speed ? `throttle:${s.throttle_speed}` : null,
              s.operator_code  ? `operator:${s.operator_code}`  : null,
              s.kyc_needed     ? `kyc:${s.kyc_needed}`           : null,
              s.call           ? `call:${s.call}`                : null,
              cogsVnd, cogsUsd, s.note ? `[note:${s.note}]` : null,
            ].filter(Boolean).join("|")
          })
          sections.push(
            `=== SEMANTIC SEARCH: ${semSkus.length} SKU tương tự (gợi ý, xác nhận với team) ===`,
            `[Không có gói chính xác cho ${params.country} — kết quả tìm kiếm ngữ nghĩa]`,
            ...semRows
          )
        }
      }
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
              ? ` | ${convertCogs(s.latest_cogs, s.latest_cogs_currency, fx).vnd.toLocaleString("en-US")} | $${convertCogs(s.latest_cogs, s.latest_cogs_currency, fx).usd}` : ""
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
              ? ` | cogs:${convertCogs(s.latest_cogs, s.latest_cogs_currency, fx).vnd.toLocaleString("en-US")} VND ($${convertCogs(s.latest_cogs, s.latest_cogs_currency, fx).usd} USD)` : ""
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
    if (params.country) sections.push(`=== NHÓM NƯỚC "${params.country}" ===`, JSON.stringify(getCountryInfo(params.country, ref), null, 2))
  }

  // Inject FX rates cho tra-cuu (COGS display + query tỷ giá thuần)
  if (agentId === "tra-cuu" && isCost && Object.keys(fx).length) {
    sections.push(
      `=== TỶ GIÁ NỘI BỘ ===`,
      JSON.stringify(Object.entries(fx).map(([key, value]) => ({ key, value })), null, 2)
    )
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
    // Run classifier + refCache in parallel → zero extra latency
    const [refCache, { agentId, agentName, params }] = await Promise.all([
      getRefCache(),
      route(lastMsg, history, role),
    ])
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
