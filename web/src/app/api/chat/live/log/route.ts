import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { supabaseAdmin } from "@/lib/supabase"
import { beGauLiveUser } from "@/lib/agents/be-gau-live"
import { summarizeConversation } from "@/lib/assistant-memory-auto"
import { loadFeatureMatrix, featureEnabled } from "@/lib/assistant-features"
import { isDataTask } from "@/lib/okr-helpers"

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
  // Danh sách hội thoại Bé Gấu lọc theo TÊN hiển thị (session.user.name), không phải username.
  const { data: conv } = await supabaseAdmin.from("conversations")
    .insert({ username: u.name, title: "🎙 " + first.slice(0, 48) }).select("id").single()
  const convId = (conv?.id as string) ?? null
  if (convId) {
    const { error } = await supabaseAdmin.from("conversation_messages").insert(turns.map(t => ({
      conversation_id: convId, role: t.role, content: t.text, agent_id: "be_gau_live", agent_name: "Bé Gấu (giọng nói)",
    })))
    if (error) console.error("[bg_live] save messages:", error.message)
    else if (featureEnabled(await loadFeatureMatrix(), "memory", u.role))
      waitUntil(summarizeConversation(u.username, convId).catch(e => console.error("[gp_conv_mem]", e?.message)))
  }
  // My Metrics "Tasks via Bé Gấu": 1 phiên Trực tiếp = 1 task nếu có tool đọc dữ liệu chạy thành công.
  const tools = Array.from(new Set(
    (Array.isArray(body.tools) ? body.tools.slice(0, 100) : [])
      .filter((t: any) => t && typeof t.name === "string" && !t.err).map((t: any) => String(t.name)),
  )) as string[]
  const reply = turns.filter(t => t.role === "assistant").map(t => t.text).join("\n")
  try {
    await supabaseAdmin.from("app_usage_events").insert({
      event_type: "chat", agent_id: "be-gau-live", user_email: u.username, user_name: u.name, user_role: u.role,
      user_message: first.slice(0, 500), ai_response: reply.slice(0, 3000) || null,
      tools_used: tools.length ? tools : null, used_db_tool: isDataTask(tools, u.role),
    })
  } catch (e) { console.error("[bg_live] log task:", e) }
  return NextResponse.json({ saved: true, conversationId: convId })
}
