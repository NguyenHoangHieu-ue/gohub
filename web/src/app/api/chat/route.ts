import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { GoogleGenerativeAI }       from "@google/generative-ai"
import { getRefCache }              from "@/lib/agents/cache"
import { AGENTS }                   from "@/lib/agents/agents"
import { route }                    from "@/lib/agents/router"
import {
  searchSkus, getProductDetail, decodeSkuCode,
  getCountryInfo, getVendorInfo,
  getFxRates, getSkuCogs, calculate3hkCogs,
  searchNccWm, searchNcc3hk, findGaps,
} from "@/lib/agents/tools"
import type { Message, UserRole }   from "@/lib/agents/types"

// Pre-execute tools based on agent + extracted params, return context string
async function buildToolContext(
  agentId: string,
  params:  ReturnType<typeof import("@/lib/agents/router").route>["params"],
  ref:     Awaited<ReturnType<typeof getRefCache>>,
  isCost:  boolean
): Promise<string> {
  const sections: string[] = []

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
      const parts: string[] = [
        s.sku_code,
        s.tenant,
        s.sim_esim ?? null,
        dataStr,
        `${s.day_amount}d`,
        s.throttle_speed ? `throttle:${s.throttle_speed}` : null,
        s.operator_code  ? `operator:${s.operator_code}`  : null,
        s.kyc_needed     ? `kyc:${s.kyc_needed}`           : null,
        isCost && s.latest_cogs != null ? `cogs:${s.latest_cogs}${s.latest_cogs_currency ?? ""}` : null,
      ]
      return parts.filter(Boolean).join("|")
    })
    sections.push(
      `=== KẾT QUẢ TÌM KIẾM: ${skus.length} SKU (nước=${params.country}${params.days ? ` ${params.days}d` : ""}${params.dataGB ? ` ${params.dataGB}GB` : ""}${params.isUnlimited ? " Unlimited" : ""}) ===`,
      note ? `Lưu ý: ${note}` : "",
      `sku_code|tenant|sim|data|days|throttle|operator|kyc${isCost ? "|cogs" : ""}`,
      ...rows
    )
  }

  if (agentId === "tra-cuu" && params.skuCode) {
    const detail = await getProductDetail(params.skuCode)
    sections.push(
      `=== CHI TIẾT SKU: ${params.skuCode} ===`,
      JSON.stringify(detail, null, 2)
    )
    if (!params.skuCode.match(/\d/)) {
      // also decode if valid format
    } else {
      sections.push(`=== GIẢI MÃ ===`, JSON.stringify(decodeSkuCode(params.skuCode), null, 2))
    }
  }

  if (agentId === "giai-dap") {
    // Luôn inject vendor list (nhỏ, luôn cần)
    const vendors = getVendorInfo(undefined, ref)
    sections.push(
      `=== DANH SÁCH VENDOR (${vendors.length}) ===`,
      vendors.map((v: any) => `${v.vendor_code} = ${v.name}`).join("\n")
    )
    if (params.skuCode) {
      sections.push(`=== GIẢI MÃ SKU ===`, JSON.stringify(decodeSkuCode(params.skuCode), null, 2))
    }
    if (params.country) {
      const info = getCountryInfo(params.country, ref)
      sections.push(`=== NHÓM NƯỚC "${params.country}" ===`, JSON.stringify(info, null, 2))
    }
  }

  if (agentId === "gia-cogs") {
    const [rates] = await Promise.all([getFxRates()])
    sections.push(`=== TỶ GIÁ NỘI BỘ ===`, JSON.stringify(rates, null, 2))
    if (params.skuCode) {
      const cogs = await getSkuCogs(params.skuCode)
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
