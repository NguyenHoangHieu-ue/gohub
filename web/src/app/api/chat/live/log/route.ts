import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { supabaseAdmin } from "@/lib/supabase"
import { beGauLiveUser } from "@/lib/agents/be-gau-live"
import { summarizeConversation } from "@/lib/assistant-memory-auto"
import { loadFeatureMatrix, featureEnabled } from "@/lib/assistant-features"

// U3: kết thúc phiên Trực tiếp Bé Gấu → lưu phụ đề thành 1 hội thoại "🎙 …" (mở lại được trong Bé Gấu).
interface Turn { role: "user" | "assistant"; text: string }
export async function POST(req: NextRequest) {
  const u = await beGauLiveUser()
  if (!u) return NextResponse.json({ error: "Không có quyền" }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const turns: Turn[] = (Array.isArray(body.turns) ? body.turns : [])
    .filter((t: any) => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string" && t.text.trim())
    .slice(0, 200).map((t: any) => ({ role: t.role, text: String(t.text).slice(0, 4000) }))
  if (!turns.length) return NextResponse.json({ saved: false })

  const first = turns.find(t => t.role === "user")?.text ?? "Phiên giọng nói"
  const { data: conv } = await supabaseAdmin.from("conversations")
    .insert({ username: u.username, title: "🎙 " + first.slice(0, 48) }).select("id").single()
  const convId = (conv?.id as string) ?? null
  if (convId) {
    const { error } = await supabaseAdmin.from("conversation_messages").insert(turns.map(t => ({
      conversation_id: convId, role: t.role, content: t.text, agent_id: "be_gau_live", agent_name: "Bé Gấu (giọng nói)",
    })))
    if (error) console.error("[bg_live] save messages:", error.message)
    else if (featureEnabled(await loadFeatureMatrix(), "memory", u.role))
      waitUntil(summarizeConversation(u.username, convId).catch(e => console.error("[gp_conv_mem]", e?.message)))
  }
  return NextResponse.json({ saved: true, conversationId: convId })
}
