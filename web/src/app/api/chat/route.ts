import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { supabaseAdmin } from "@/lib/supabase"

const SKU_LIMIT   = 3_000
const LIST_LIMIT  = 3_000
const ITEM_LIMIT  = 2_000
const CACHE_TTL   = 30 * 60 * 1000

const contextCache: Record<string, { data: string; at: number }> = {}

async function fetchLimited(table: string, limit: number, activeOnly = false) {
  let q = supabaseAdmin.from(table).select("*")
  if (activeOnly) q = q.eq("status", "Active")
  const { data } = await q.limit(limit)
  return data ?? []
}

async function buildContext(role: string): Promise<string> {
  const now = Date.now()
  if (contextCache[role] && now - contextCache[role].at < CACHE_TTL)
    return contextCache[role].data

  const [products, skus, listings, items] = await Promise.all([
    fetchLimited("products", 1000),
    fetchLimited("skus",     SKU_LIMIT,  true),
    fetchLimited("listings", LIST_LIMIT, true),
    fetchLimited("items",    ITEM_LIMIT, true),
  ])

  const lines = [
    `=== PRODUCTS (${products.length}) ===`,
    ...products.map((p: any) => `- ${p.product_code}|${p.tenant}|${p.type_of_sim}|${p.supported_countries}|${p.status}`),

    `\n=== SKUS (${skus.length} active) ===`,
    ...skus.map((s: any) =>
      `- ${s.sku_code}|${s.product_code}|${s.sim_esim}` +
      `|${s.data_amount}${s.data_amount_unit}/${s.day_amount}${s.day_amount_unit}` +
      (role === "admin" ? `|cogs_vnd:${s.final_cogs_included_vat_vnd}` : "")
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
  ]

  const ctx = lines.join("\n")
  contextCache[role] = { data: ctx, at: now }
  return ctx
}

const SYSTEM = `Bạn là trợ lý AI của GoHub, hỗ trợ team sale tra cứu thông tin sản phẩm SIM/eSim du lịch.
Trả lời bằng tiếng Việt, ngắn gọn và chính xác dựa trên dữ liệu thực tế từ hệ thống PM bên dưới.
Nếu không tìm thấy thông tin trong dữ liệu, hãy nói rõ là không có dữ liệu thay vì đoán.
Khi hiển thị giá, luôn ưu tiên dùng giá VND. Nếu chỉ có ngoại tệ thì ghi rõ đơn vị.

Dữ liệu sản phẩm hiện tại:`

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { messages } = await req.json()
  const role = session.user.role || "sale"

  try {
    const context = await buildContext(role)
    const genAI   = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model   = genAI.getGenerativeModel({
      model:             "gemini-3.5-flash",
      systemInstruction: SYSTEM + "\n" + context,
    })

    const history = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
      role:  m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }))

    const chat   = model.startChat({ history })
    const result = await chat.sendMessage(messages.at(-1).content)
    return NextResponse.json({ reply: result.response.text() })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
