import { NextRequest, NextResponse }  from "next/server"
import { supabaseAdmin }             from "@/lib/supabase"
import { getRefCache }               from "@/lib/agents/cache"
import { AGENTS }                    from "@/lib/agents/agents"
import { route }                     from "@/lib/agents/router"
import { GoogleGenerativeAI }        from "@google/generative-ai"
import {
  replyLarkMessage, getLarkUserInfo, stripMarkdown,
} from "@/lib/lark"
import {
  searchSkus, getProductDetail, decodeSkuCode,
  getCountryInfo, getVendorInfo,
  getFxRates, getSkuCogs,
  findGaps,
} from "@/lib/agents/tools"
import type { Message, UserRole }    from "@/lib/agents/types"

// Max history to pull per Lark user
const HISTORY_LIMIT = 10

// Get conversation history for a Lark open_id from DB
async function getLarkHistory(openId: string): Promise<Message[]> {
  const { data } = await supabaseAdmin
    .from("lark_chat_history")
    .select("role,content")
    .eq("lark_open_id", openId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT)
  if (!data) return []
  return data.reverse() as Message[]
}

// Save a message to lark_chat_history
async function saveLarkMessage(openId: string, role: "user" | "assistant", content: string) {
  await supabaseAdmin
    .from("lark_chat_history")
    .insert({ lark_open_id: openId, role, content })
    .then(() => {})  // fire-and-forget
}

// Look up user role by lark_open_id
async function getUserRole(openId: string): Promise<{ role: UserRole; name: string }> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("role,name")
    .eq("lark_open_id", openId)
    .maybeSingle()
  return {
    role: (data?.role as UserRole) ?? "standard",
    name: data?.name ?? "",
  }
}

// Reuse buildToolContext logic (same as /api/chat)
async function buildToolContext(
  agentId: string,
  params:  ReturnType<typeof route>["params"],
  ref:     Awaited<ReturnType<typeof getRefCache>>,
  isCost:  boolean
): Promise<string> {
  const sections: string[] = []

  if (agentId === "tu-van" && params.country) {
    const { skus, note } = await searchSkus({ country: params.country, days: params.days, data_gb: params.dataGB, is_unlimited: params.isUnlimited, vendor: params.vendor }, ref)
    const rows = skus.map(s => {
      const dataStr = s.is_unlimited || (s.data_amount ?? 0) >= 9999 ? "Unlimited"
        : s.data_amount != null ? `${s.data_amount}${s.data_amount_unit ?? "GB"}${s.is_daily ? "/ngày" : ""}` : null
      const parts = [s.sku_code, s.tenant, s.sim_esim ?? null, dataStr, `${s.day_amount}d`,
        s.throttle_speed ? `throttle:${s.throttle_speed}` : null,
        s.operator_code  ? `operator:${s.operator_code}`  : null,
        s.kyc_needed     ? `kyc:${s.kyc_needed}`           : null,
        isCost && s.latest_cogs != null ? `cogs:${s.latest_cogs}${s.latest_cogs_currency ?? ""}` : null,
      ]
      return parts.filter(Boolean).join("|")
    })
    sections.push(`=== KẾT QUẢ TÌM KIẾM: ${skus.length} SKU (nước=${params.country}) ===`, note ?? "", ...rows)
  }

  if (agentId === "tra-cuu" && params.skuCode) {
    const detail = await getProductDetail(params.skuCode)
    sections.push(`=== CHI TIẾT SKU: ${params.skuCode} ===`, JSON.stringify(detail, null, 2))
    sections.push(`=== GIẢI MÃ ===`, JSON.stringify(decodeSkuCode(params.skuCode), null, 2))
  }

  if (agentId === "giai-dap") {
    const vendors = getVendorInfo(undefined, ref)
    sections.push(`=== DANH SÁCH VENDOR ===`, vendors.map((v: any) => `${v.vendor_code} = ${v.name}`).join("\n"))
    if (params.skuCode) sections.push(`=== GIẢI MÃ SKU ===`, JSON.stringify(decodeSkuCode(params.skuCode), null, 2))
    if (params.country) sections.push(`=== NHÓM NƯỚC "${params.country}" ===`, JSON.stringify(getCountryInfo(params.country, ref), null, 2))
  }

  if (agentId === "gia-cogs") {
    const rates = await getFxRates()
    sections.push(`=== TỶ GIÁ NỘI BỘ ===`, JSON.stringify(rates, null, 2))
    if (params.skuCode) {
      const cogs = await getSkuCogs(params.skuCode)
      sections.push(`=== COGS SKU ${params.skuCode} ===`, JSON.stringify(cogs, null, 2))
    }
  }

  if (agentId === "gap-analysis") {
    const gaps = findGaps({ country: params.country, vendor: params.nccVendor }, ref)
    sections.push(`=== GAP ANALYSIS ===`, JSON.stringify(gaps, null, 2))
  }

  return sections.filter(Boolean).join("\n")
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // ── URL verification — schema 1.0 ─────────────────────────────────────────
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge })
  }

  // ── URL verification — schema 2.0 ─────────────────────────────────────────
  if (body.schema === "2.0" && body.header?.event_type === "challenge") {
    return NextResponse.json({ challenge: body.event?.challenge })
  }

  // ── Message event ──────────────────────────────────────────────────────────
  const event = body.event
  const eventType = body.header?.event_type ?? body.type
  if (!event || eventType !== "im.message.receive_v1") {
    return NextResponse.json({ ok: true })
  }

  // Only handle text messages sent directly to the bot (not group chats where bot is @mentioned)
  const msg        = event.message
  const sender     = event.sender
  const openId     = sender?.sender_id?.open_id as string | undefined
  const messageId  = msg?.message_id as string | undefined
  const msgType    = msg?.message_type as string

  if (!openId || !messageId || msgType !== "text") return NextResponse.json({ ok: true })

  // Parse text content
  let userText: string
  try {
    userText = JSON.parse(msg.content).text?.trim()
  } catch {
    return NextResponse.json({ ok: true })
  }
  if (!userText) return NextResponse.json({ ok: true })

  // Respond immediately (Lark timeout = 3s), process async
  processAndReply(openId, messageId, userText).catch(console.error)
  return NextResponse.json({ ok: true })
}

async function processAndReply(openId: string, messageId: string, userText: string) {
  try {
    // Get user info
    const { role, name } = await getUserRole(openId)
    const isCost = role === "admin" || role === "manager"

    // Get history
    const history = await getLarkHistory(openId)
    const messages: Message[] = [...history, { role: "user", content: userText }]

    // Route + build context
    const refCache = await getRefCache()
    const { agentId, params } = route(userText, history, role)
    const agent    = AGENTS[agentId]
    const toolCtx  = await buildToolContext(agentId, params, refCache, isCost)

    const systemInstruction = [
      agent.systemPrompt,
      toolCtx ? `\n\n=== DỮ LIỆU TỪ HỆ THỐNG ===\n${toolCtx}` : "",
      `\nNgười dùng: ${name || openId} (vai trò: ${role}, kênh: Lark)`,
    ].join("")

    // Call Gemini (non-streaming for Lark)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash", systemInstruction })

    const geminiHistory = history.map(m => ({
      role:  m.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: m.content }],
    }))

    const result   = await model.startChat({ history: geminiHistory }).sendMessage(userText)
    const response = result.response.text()

    // Strip markdown for Lark plain text
    const replyText = stripMarkdown(response)

    // Reply and save history
    await replyLarkMessage(messageId, replyText)
    await saveLarkMessage(openId, "user",      userText)
    await saveLarkMessage(openId, "assistant", replyText)

  } catch (err: any) {
    console.error("[Lark bot]", err.message)
    try {
      await replyLarkMessage(messageId, "Hệ thống đang xử lý, vui lòng thử lại sau.")
    } catch {}
  }
}
