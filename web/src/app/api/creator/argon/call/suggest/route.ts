import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { suggestReply } from "@/lib/argon/call-server"
import { checkRateLimit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// POST { briefing, vendor, goal, lines:[{who,en}], utterance } → 1–2 câu trả lời gợi ý (Anh + Việt) kèm căn cứ và điểm nên xác nhận lại.
export async function POST(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const rl = await checkRateLimit(`argon-call-suggest:${username}`, 40, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: "Gợi ý quá nhanh, chờ vài giây." }, { status: 429 })
  const b = (await req.json().catch(() => ({}))) as { briefing?: string; vendor?: string; goal?: string; lines?: { who: "partner" | "me"; en: string }[]; utterance?: string }
  const utterance = String(b.utterance ?? "").trim()
  if (!utterance) return NextResponse.json({ error: "Thiếu câu đối tác vừa nói" }, { status: 400 })
  try {
    const lines = (Array.isArray(b.lines) ? b.lines : []).slice(-12).map(l => ({ who: l.who === "me" ? "me" as const : "partner" as const, en: String(l.en ?? "").slice(0, 400) }))
    return NextResponse.json(await suggestReply(username, { briefing: String(b.briefing ?? ""), vendor: String(b.vendor ?? ""), goal: String(b.goal ?? ""), lines, utterance }))
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
