import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { supabaseAdmin }             from "@/lib/supabase"
import { checkRateLimit }            from "@/lib/rate-limit"

// Feedback loop 👍/👎 (s196+13, ý tưởng #3 roadmap audit Bé Gấu) — mở cho mọi role đã login, giống
// mức tin cậy /api/chat (bot phục vụ cả công ty).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const identity = session.user.email || (session.user as any).username || "anon"
  const rl = await checkRateLimit(`chat-feedback:${identity}`, 30, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: "Quá nhiều yêu cầu" }, { status: 429 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }) }

  const rating = body?.rating === 1 || body?.rating === -1 ? body.rating : null
  if (rating === null) return NextResponse.json({ error: "rating phải là 1 hoặc -1" }, { status: 400 })

  try {
    await supabaseAdmin.from("chat_feedback").insert({
      user_email: identity, user_name: session.user.name || identity, user_role: session.user.role || null,
      agent_id: body?.agentId || "be-gau",
      question: String(body?.question || "").slice(0, 500),
      answer:   String(body?.answer   || "").slice(0, 3000),
      rating,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
