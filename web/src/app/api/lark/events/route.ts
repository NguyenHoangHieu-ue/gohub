import { NextRequest, NextResponse }  from "next/server"
import { waitUntil }                  from "@vercel/functions"
import { createDecipheriv, createHash } from "crypto"
import { supabaseAdmin }             from "@/lib/supabase"
import { getRefCache }               from "@/lib/agents/cache"
import { AGENTS }                    from "@/lib/agents/agents"
import { route, type ExtractedParams } from "@/lib/agents/router"
import { GoogleGenerativeAI }        from "@google/generative-ai"
import {
  sendLarkMessage, replyLarkMessage, replyLarkTable,
  parseMarkdownTable, splitTextAndTable,
  getLarkUserInfo, stripMarkdown,
} from "@/lib/lark"
import {
  searchSkus, getProductDetail, getProductByCode, decodeSkuCode,
  getCountryInfo, getVendorInfo,
  getFxRates, getSkuCogs,
  findGaps, getItems, searchListings, identifyCode,
} from "@/lib/agents/tools"
import type { Message, UserRole }    from "@/lib/agents/types"

// Max history to pull per Lark user
const HISTORY_LIMIT = 10

// Get conversation history for a specific Lark thread
async function getLarkHistory(openId: string, threadId: string): Promise<Message[]> {
  const { data } = await supabaseAdmin
    .from("lark_chat_history")
    .select("role,content")
    .eq("lark_open_id", openId)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT)
  if (!data || data.length === 0) return []

  const msgs = data.reverse() as Message[]

  // Gemini requires history to start with 'user' and strictly alternate user/model.
  // Trim leading assistant messages (happens when HISTORY_LIMIT cuts mid-pair).
  let start = 0
  while (start < msgs.length && msgs[start].role !== "user") start++
  const trimmed = msgs.slice(start)

  // Ensure strict alternating: drop consecutive same-role messages
  const clean: Message[] = []
  for (const m of trimmed) {
    const last = clean[clean.length - 1]
    if (!last || last.role !== m.role) clean.push(m)
    // If same role consecutive, skip — prefer keeping the later one
  }

  return clean
}

// Save a message to lark_chat_history
function saveLarkMessage(openId: string, threadId: string, role: "user" | "assistant", content: string) {
  // Fire-and-forget — không throw để tránh trigger catch block của processAndReply
  (supabaseAdmin
    .from("lark_chat_history")
    .insert({ lark_open_id: openId, thread_id: threadId, role, content }) as any)
    .then(() => {})
    .catch((e: any) => console.error("[Lark] saveLarkMessage failed:", e?.message))
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
  params:  ExtractedParams,
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
    const { skus, note } = await searchSkus({ country: params.country, days: params.days, data_gb: params.dataGB, is_unlimited: params.isUnlimited, vendor: params.vendor, sim_type: params.simType }, ref)
    const rows = skus.map(s => {
      const dataStr = s.is_unlimited || (s.data_amount ?? 0) >= 9999 ? "Unlimited"
        : s.data_amount != null ? `${s.data_amount}${s.data_amount_unit ?? "GB"}${s.is_daily ? "/ngày" : ""}` : null
      let cogsVnd: string | null = null
      let cogsUsd: string | null = null
      if (isCost && s.latest_cogs != null) {
        const { usd, vnd } = convertCogs(s.latest_cogs, s.latest_cogs_currency, fx)
        cogsVnd = vnd.toLocaleString("en-US")
        cogsUsd = `$${usd}`
      }
      const parts = [s.sku_code, s.tenant, s.sim_esim ?? null, dataStr, `${s.day_amount}d`,
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
    sections.push(`=== KẾT QUẢ TÌM KIẾM: ${skus.length} SKU (nước=${params.country}) ===`, note ?? "", ...rows)
  }

  if (agentId === "tra-cuu") {
    const productCodes = params.productCodes ?? (params.productCode ? [params.productCode] : [])
    const skuCodes     = params.skuCodes     ?? (params.skuCode     ? [params.skuCode]     : [])
    const listingCodes = params.listingCodes ?? (params.listingCode ? [params.listingCode] : [])
    const allCodes = [...skuCodes, ...listingCodes]
    const isMulti = (productCodes.length + allCodes.length) > 1

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
        sections.push(`=== CHI TIẾT PRODUCT CODE: ${productCodes[0]} ===`, JSON.stringify(results[0], null, 2))
      }
    }

    if (allCodes.length) {
      const identified = await Promise.all(allCodes.map(c => identifyCode(c)))
      if (isMulti || allCodes.length > 1) {
        sections.push(`=== MULTI LOOKUP: ${allCodes.length} mã ===`)
        const detailResults = await Promise.all(allCodes.map(async (code, i) => {
          const id = identified[i]
          if (!id.found) return `[${i+1}] ${code}: Không tìm thấy`
          if (id.type === "SKU") {
            const d = await getProductDetail(code)
            if (!d || d.error) return `[${i+1}] ${code}: Lỗi`
            const s = d.sku
            const dataStr = s.data_amount ? `${s.data_amount}${s.data_amount_unit ?? "GB"}` : "Unlimited"
            const cogsStr = isCost && s.latest_cogs
              ? ` | cogs:${convertCogs(s.latest_cogs, s.latest_cogs_currency, fx).vnd.toLocaleString("en-US")} VND ($${convertCogs(s.latest_cogs, s.latest_cogs_currency, fx).usd} USD)` : ""
            return `[${i+1}] SKU:${code} | ${s.status} | ${dataStr} | ${s.day_amount ?? "?"}d${cogsStr}`
          }
          return `[${i+1}] ${code}: loại ${id.type}`
        }))
        sections.push(...detailResults)
      } else {
        const code = allCodes[0]
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
          } else if (id.type === "Alias (Item)") {
            const items = await getItems({ listing_code: id.item_code })
            sections.push(`=== ITEM / ALIAS ===`, JSON.stringify(items, null, 2))
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

  // Bot được add vào group → gửi welcome để kích hoạt subscription
  if (eventType === "im.chat.member.bot.added_v1" && event?.chat_id) {
    console.log("[Lark] bot added to group:", event.chat_id)
    waitUntil(
      sendLarkMessage(event.chat_id, "chat_id",
        `👋 Xin chào! Tôi là ${process.env.LARK_BOT_NAME ?? "Bot GoHub"}.\n@mention tôi trong group để đặt câu hỏi về sản phẩm SIM/eSIM.`
      ).catch((e: any) => console.error("[Lark] welcome msg failed:", e?.message))
    )
    return NextResponse.json({ ok: true })
  }

  if (!event || eventType !== "im.message.receive_v1") {
    console.log("[Lark] skip non-message event:", eventType)
    return NextResponse.json({ ok: true })
  }

  // Only handle text messages sent directly to the bot (not group chats where bot is @mentioned)
  const msg        = event.message
  const sender     = event.sender
  const openId     = sender?.sender_id?.open_id as string | undefined
  const chatId     = msg?.chat_id as string | undefined
  const msgType    = msg?.message_type as string

  const messageId  = msg?.message_id as string | undefined
  const rootId     = msg?.root_id as string | undefined
  const threadId   = (rootId ?? messageId) as string | undefined
  const chatType   = msg?.chat_type as string  // "p2p" | "group" | "thread"
  const isInThread = !!rootId && rootId !== messageId  // message là reply trong thread

  console.log("[Lark] event | type:", eventType, "| chatType:", chatType,
    "| msgType:", msgType, "| openId:", openId ? "ok" : "MISSING",
    "| chatId:", chatId ? "ok" : "MISSING", "| messageId:", messageId ? "ok" : "MISSING")

  // Chỉ xử lý "text" và "post" (rich text khi @mention trong group)
  if (!openId || !chatId || !messageId || !threadId ||
      (msgType !== "text" && msgType !== "post")) {
    console.log("[Lark] skip: missing field or unsupported msgType:", msgType)
    return NextResponse.json({ ok: true })
  }

  // Parse content — xử lý cả "text" và "post" format
  let userText = ""
  let postMentions: any[] = []
  try {
    const rawContent = JSON.parse(msg.content)

    if (msgType === "text") {
      // Format: { "text": "hello @_user_1" }
      userText = (rawContent.text ?? "").replace(/@\S+\s*/g, "").trim()

    } else {
      // Format post: { "zh_cn": { "content": [[{tag,text/user_name},...]] } }
      const body = rawContent.zh_cn ?? rawContent.en_us
        ?? (Object.values(rawContent)[0] as any) ?? {}
      const blocks: any[][] = body.content ?? []
      const textParts: string[] = []
      for (const block of blocks) {
        for (const el of block) {
          if (el.tag === "text") {
            textParts.push(el.text ?? "")
          } else if (el.tag === "at") {
            // Collect bot mention, skip @mention text in user query
            postMentions.push({ name: el.user_name, id: { open_id: el.user_id } })
          }
        }
      }
      userText = textParts.join("").trim()
    }
  } catch {
    return NextResponse.json({ ok: true })
  }
  if (!userText) return NextResponse.json({ ok: true })

  // Group chat + thread: chỉ reply khi được @mention tên bot
  if (chatType === "group") {
    const topMentions: any[] = msg?.mentions ?? []
    const allMentions = [...topMentions, ...postMentions]
    const botName = (process.env.LARK_BOT_NAME ?? "").trim().toLowerCase()

    console.log("[Lark] group msg | msgType:", msgType, "| chatId:", chatId,
      "| isInThread:", isInThread, "| botName:", botName,
      "| mentions:", JSON.stringify(allMentions), "| userText:", userText.slice(0, 80))

    const isMentioned = allMentions.length > 0 && allMentions.some((m: any) => {
      if (!botName) return true
      const mName = (m.name ?? "").trim().toLowerCase()
      const match = mName === botName || mName.includes(botName) || botName.includes(mName)
      if (!match) console.log("[Lark] mention mismatch | got:", m.name, "| expected:", botName)
      return match
    })

    // Fallback cho thread messages: msg.mentions có thể rỗng khi reply trong thread
    // → kiểm tra tên bot trong raw content string (chứa user_name của at-element)
    const threadFallback = !isMentioned && isInThread && botName
      && typeof msg.content === "string"
      && msg.content.toLowerCase().includes(botName)

    if (!isMentioned && !threadFallback) {
      console.log("[Lark] not mentioned → skip | mentions:", allMentions.length)
      return NextResponse.json({ ok: true })
    }
  }

  console.log("[Lark] processing | chatType:", chatType, "| isInThread:", isInThread,
    "| msgType:", msgType, "| text:", userText.slice(0, 60))

  // Respond 200 ngay, giữ function sống để processAndReply hoàn thành
  waitUntil(processAndReply(openId, chatId, messageId, threadId, userText))
  return NextResponse.json({ ok: true })
}

async function processAndReply(openId: string, chatId: string, messageId: string, threadId: string, userText: string) {
  let responseSent = false
  try {
    // Get user info
    const { role, name } = await getUserRole(openId)
    const isCost = true

    // Get history scoped to this thread
    const history = await getLarkHistory(openId, threadId)
    const messages: Message[] = [...history, { role: "user", content: userText }]

    // Route + refCache in parallel
    const [refCache, { agentId, params }] = await Promise.all([
      getRefCache(),
      route(userText, history, role),
    ])
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

    // Nếu response có bảng → gửi card + xlsx, còn lại strip markdown
    const split = splitTextAndTable(response)
    const table = split ? parseMarkdownTable(split.tableText) : null

    if (table) {
      const preText = split!.preText ? stripMarkdown(split!.preText) : ""
      await replyLarkTable(messageId, chatId, preText, table.headers, table.rows)
      responseSent = true  // card đã gửi (xlsx là optional, không throw)
    } else {
      await replyLarkMessage(messageId, stripMarkdown(response))
      responseSent = true
    }

    // Lưu full response vào history để Gemini có context đầy đủ ở turn sau
    // (display gửi Lark đã strip/card rồi, history cần giữ nguyên nội dung)
    saveLarkMessage(openId, threadId, "user",      userText)
    saveLarkMessage(openId, threadId, "assistant", response)

  } catch (err: any) {
    console.error("[Lark bot] ERROR:", err?.message ?? err)
    // Chỉ gửi error message nếu response chưa gửi được
    if (!responseSent) {
      // Lấy role để quyết định hiển thị lỗi chi tiết hay không
      let errRole = "standard"
      try {
        const { role } = await getUserRole(openId)
        errRole = role
      } catch {}
      const errMsg = errRole === "admin"
        ? `⚠️ Lỗi hệ thống: ${err?.message ?? "unknown error"}`
        : "Hệ thống đang xử lý, vui lòng thử lại sau."
      try {
        await replyLarkMessage(messageId, errMsg)
      } catch {}
    }
  }
}
