import { NextRequest, NextResponse }  from "next/server"
import { waitUntil }                  from "@vercel/functions"
import { createDecipheriv, createHash } from "crypto"
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

function convertCogs(cogs: number, currency: string, fx: Record<string, number>) {
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

// Reuse buildToolContext logic (same as /api/chat)
async function buildToolContext(
  agentId: string,
  params:  ReturnType<typeof route>["params"],
  ref:     Awaited<ReturnType<typeof getRefCache>>,
  isCost:  boolean
): Promise<string> {
  const sections: string[] = []

  let fx: Record<string, number> = {}
  if (isCost) {
    const rates = await getFxRates()
    for (const r of rates) fx[r.key] = parseFloat(r.value)
  }

  if (agentId === "tu-van" && params.country) {
    const { skus, note } = await searchSkus({ country: params.country, days: params.days, data_gb: params.dataGB, is_unlimited: params.isUnlimited, vendor: params.vendor }, ref)
    const rows = skus.map(s => {
      const dataStr = s.is_unlimited || (s.data_amount ?? 0) >= 9999 ? "Unlimited"
        : s.data_amount != null ? `${s.data_amount}${s.data_amount_unit ?? "GB"}${s.is_daily ? "/ngày" : ""}` : null
      let cogsStr: string | null = null
      if (isCost && s.latest_cogs != null) {
        const { usd, vnd } = convertCogs(s.latest_cogs, s.latest_cogs_currency, fx)
        cogsStr = `cogs:$${usd} USD / ${vnd.toLocaleString("en-US")} VND`
      }
      const parts = [s.sku_code, s.tenant, s.sim_esim ?? null, dataStr, `${s.day_amount}d`,
        s.throttle_speed ? `throttle:${s.throttle_speed}` : null,
        s.operator_code  ? `operator:${s.operator_code}`  : null,
        s.kyc_needed     ? `kyc:${s.kyc_needed}`           : null,
        cogsStr,
      ]
      return parts.filter(Boolean).join("|")
    })
    sections.push(`=== KẾT QUẢ TÌM KIẾM: ${skus.length} SKU (nước=${params.country}) ===`, note ?? "", ...rows)
  }

  if (agentId === "tra-cuu" && params.skuCode) {
    const detail = await getProductDetail(params.skuCode)
    if (isCost && detail?.sku?.latest_cogs != null) {
      const { usd, vnd } = convertCogs(detail.sku.latest_cogs, detail.sku.latest_cogs_currency, fx)
      detail.sku.cogs_usd = usd
      detail.sku.cogs_vnd = vnd
    }
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
    sections.push(`=== GAP ANALYSIS ===`, JSON.stringify(gaps, null, 2))
  }

  return sections.filter(Boolean).join("\n")
}

// Debug GET — Lark sometimes pings with GET first
export async function GET() {
  return NextResponse.json({ ok: true, service: "lark-bot" })
}

function decryptLark(encrypted: string): any {
  const encryptKey = process.env.LARK_ENCRYPT_KEY!
  const key = createHash("sha256").update(encryptKey).digest()
  const buf = Buffer.from(encrypted, "base64")
  const iv         = buf.subarray(0, 16)
  const ciphertext = buf.subarray(16)
  const decipher   = createDecipheriv("aes-256-cbc", key, iv)
  const plain      = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(plain.toString("utf-8"))
}

export async function POST(req: NextRequest) {
  let body: any
  try {
    const raw = await req.text()
    const parsed = raw ? JSON.parse(raw) : {}

    // Decrypt if encrypted
    if (parsed.encrypt) {
      console.log("[Lark] decrypting...")
      body = decryptLark(parsed.encrypt)
      console.log("[Lark] decrypted:", JSON.stringify(body).slice(0, 200))
    } else {
      console.log("[Lark] raw body:", raw.slice(0, 200))
      body = parsed
    }
  } catch (e: any) {
    console.error("[Lark] parse/decrypt error:", e.message)
    return NextResponse.json({ ok: true })
  }

  // ── URL verification — schema 1.0 & 2.0 ──────────────────────────────────
  const challenge: string | undefined =
    body.type === "url_verification"                          ? body.challenge :
    body.schema === "2.0" && body.header?.event_type === "challenge" ? body.event?.challenge :
    undefined

  if (challenge) {
    console.log("[Lark] responding challenge:", challenge)
    const resBody = JSON.stringify({ challenge })
    return new Response(resBody, {
      status:  200,
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": String(Buffer.byteLength(resBody)),
      },
    })
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
  const chatId     = msg?.chat_id as string | undefined
  const msgType    = msg?.message_type as string

  if (!openId || !chatId || msgType !== "text") return NextResponse.json({ ok: true })

  // Parse text content
  let userText: string
  try {
    userText = JSON.parse(msg.content).text?.trim()
  } catch {
    return NextResponse.json({ ok: true })
  }
  if (!userText) return NextResponse.json({ ok: true })

  // Respond 200 ngay, giữ function sống để processAndReply hoàn thành
  waitUntil(processAndReply(openId, chatId, userText))
  return NextResponse.json({ ok: true })
}

async function processAndReply(openId: string, chatId: string, userText: string) {
  try {
    // Get user info
    const { role, name } = await getUserRole(openId)
    const isCost = true

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

    // Gửi thẳng vào chat (không tạo thread)
    await sendLarkMessage(chatId, "chat_id", replyText)
    await saveLarkMessage(openId, "user",      userText)
    await saveLarkMessage(openId, "assistant", replyText)

  } catch (err: any) {
    console.error("[Lark bot]", err.message)
    try {
      await sendLarkMessage(chatId, "chat_id", "Hệ thống đang xử lý, vui lòng thử lại sau.")
    } catch {}
  }
}
