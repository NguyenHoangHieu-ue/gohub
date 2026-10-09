// Eval trí nhớ Gấu Pro (plan personal-agent.md P0). Chỉ gọi bằng CRON_SECRET (web/scripts/eval-memory.mjs), chỉ cho username "eval-*".
// reset: xoá mọi dữ liệu trí nhớ/hội thoại của user thử · turn: nạp 1 lượt qua đường rút trí nhớ thật (+ lưu hội thoại nếu có conv)
// summarize: tóm tắt 1 hội thoại như luồng thật · ask: hỏi qua runCreatorAI với trí nhớ bật · dump: liệt kê trí nhớ để soi rác.
import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { supabaseAdmin } from "@/lib/supabase"
import { runCreatorAI } from "@/lib/agents/creator-ai"
import { extractMemoriesFromTurn, summarizeConversation } from "@/lib/assistant-memory-auto"
import { buildMemoryBlock } from "@/lib/assistant-memory"

export const maxDuration = 300

export async function POST(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await req.json() as { action: string; user?: string; conv?: string; title?: string; userMsg?: string; assistantMsg?: string; question?: string }
  const user = b.user ?? ""
  if (!/^eval-[a-z0-9-]{1,30}$/.test(user)) return NextResponse.json({ error: "user phải dạng eval-xxx" }, { status: 400 })
  const t0 = Date.now()
  try {
    switch (b.action) {
      case "reset": {
        const { data: convs } = await supabaseAdmin.from("conversations").select("id").eq("username", user)
        const ids = (convs ?? []).map(c => c.id as string)
        if (ids.length) {
          await supabaseAdmin.from("gp_conversation_memory").delete().in("conversation_id", ids)
          await supabaseAdmin.from("conversation_messages").delete().in("conversation_id", ids)
          await supabaseAdmin.from("conversations").delete().in("id", ids)
        }
        await supabaseAdmin.from("assistant_memory").delete().eq("username", user)
        return NextResponse.json({ ok: true, conversationsRemoved: ids.length })
      }
      case "turn": {
        if (!b.userMsg) return NextResponse.json({ error: "userMsg required" }, { status: 400 })
        let convId = b.conv
        if (b.title && !convId) {
          const { data, error } = await supabaseAdmin.from("conversations").insert({ username: user, title: `[GP] ${b.title}` }).select("id").single()
          if (error) throw new Error(error.message)
          convId = data.id as string
        }
        if (convId) {
          const rows = [{ conversation_id: convId, role: "user", content: b.userMsg }, ...(b.assistantMsg ? [{ conversation_id: convId, role: "model", content: b.assistantMsg }] : [])]
          const { error } = await supabaseAdmin.from("conversation_messages").insert(rows)
          if (error) throw new Error(error.message)
        }
        const saved = await extractMemoriesFromTurn(user, b.userMsg, b.assistantMsg ?? "", "eval")
        return NextResponse.json({ ok: true, conv: convId, memoriesChanged: saved, ms: Date.now() - t0 })
      }
      case "summarize": {
        if (!b.conv) return NextResponse.json({ error: "conv required" }, { status: 400 })
        await summarizeConversation(user, b.conv)
        return NextResponse.json({ ok: true })
      }
      case "dump": {
        const { data } = await supabaseAdmin.from("assistant_memory").select("id,kind,content,archived,source,updated_at").eq("username", user).order("id")
        const { data: sums } = await supabaseAdmin.from("gp_conversation_memory").select("title,summary,message_count").eq("username", user)
        const block = await buildMemoryBlock(user)
        return NextResponse.json({ memories: data ?? [], conversationSummaries: sums ?? [], memoryBlockChars: block.length })
      }
      case "ask": {
        if (!b.question?.trim()) return NextResponse.json({ error: "question required" }, { status: 400 })
        const r = await runCreatorAI([], b.question, undefined, undefined, false, user, "web", { personal: true })
        return NextResponse.json({ text: r.text, toolsUsed: r.toolsUsed, tokensIn: r.tokensIn, tokensOut: r.tokensOut, ms: Date.now() - t0 })
      }
      default:
        return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, ms: Date.now() - t0 }, { status: 500 })
  }
}
