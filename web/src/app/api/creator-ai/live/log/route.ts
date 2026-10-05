import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { supabaseAdmin } from "@/lib/supabase"
import { liveUser } from "@/lib/agents/creator/live-auth"
import { summarizeConversation } from "@/lib/assistant-memory-auto"

// G5: kết thúc phiên Live → lưu phụ đề thành 1 hội thoại "[GP] 🎙 …" (mở lại được, được tóm tắt cho searchPastConversations)
// + 1 dòng trace gp_runs (kênh live).
interface Turn { role: "user" | "assistant"; text: string }
export async function POST(req: NextRequest) {
  const u = await liveUser()
  if (!u) return NextResponse.json({ error: "Không có quyền" }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const turns: Turn[] = (Array.isArray(body.turns) ? body.turns : [])
    .filter((t: any) => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string" && t.text.trim())
    .slice(0, 200).map((t: any) => ({ role: t.role, text: String(t.text).slice(0, 4000) }))
  const tools: { name: string; ms: number; err?: string }[] = Array.isArray(body.tools) ? body.tools.slice(0, 100) : []
  if (!turns.length) return NextResponse.json({ saved: false })

  const first = turns.find(t => t.role === "user")?.text ?? "Phiên giọng nói"
  const { data: conv } = await supabaseAdmin.from("conversations")
    .insert({ username: u.username, title: "[GP] 🎙 " + first.slice(0, 44) }).select("id").single()
  const convId = (conv?.id as string) ?? null
  if (convId) {
    const { error } = await supabaseAdmin.from("conversation_messages").insert(turns.map(t => ({
      conversation_id: convId, role: t.role, content: t.text, agent_id: "gau_pro_live", agent_name: "Gấu Pro (giọng nói)",
    })))
    if (error) console.error("[gp_live] save messages:", error.message)
    else waitUntil(summarizeConversation(u.username, convId).catch(e => console.error("[gp_conv_mem]", e?.message)))
  }
  const { error: tErr } = await supabaseAdmin.from("gp_runs").insert({
    username: u.username, channel: "live", question: first.slice(0, 500),
    steps: tools.map(t => ({ tool: String(t.name), ms: Number(t.ms) || 0, ...(t.err ? { err: String(t.err).slice(0, 200) } : {}) })),
    duration_ms: Number(body.durationMs) || null, outcome: "done",
  })
  if (tErr) console.error("[gp_live] trace:", tErr.message)
  return NextResponse.json({ saved: true, conversationId: convId })
}
