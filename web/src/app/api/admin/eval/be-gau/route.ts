// Chấm điểm Bé Gấu (plan be-gau-upgrade.md U1): chạy 1 câu hỏi của bộ eval với vai trò chỉ định, trả câu trả lời + tool + token + thời gian.
// Chỉ gọi bằng CRON_SECRET (script web/scripts/eval-be-gau.mjs). Không ghi log hội thoại, không học KB. Mặc định không tạo file Lark;
// truyền larkOpenId (QA tính năng Lark) thì file tạo trong Lark của người đó.
import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { runBeGau } from "@/lib/agents/be-gau"
import { canViewCogs } from "@/lib/agents/guardian"

export async function POST(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { question, history = [], role = "staff", isCost, larkOpenId = null } = await req.json() as {
    question: string; history?: { role: "user" | "model"; text: string }[]; role?: string; isCost?: boolean; larkOpenId?: string | null
  }
  if (!question?.trim()) return NextResponse.json({ error: "question required" }, { status: 400 })
  const t0 = Date.now()
  try {
    const r = await runBeGau({
      geminiHistory: history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
      lastMsg: question, role, name: `eval-${role}`,
      isCost: isCost ?? await canViewCogs(role), larkOpenId,
    })
    return NextResponse.json({ text: r.text, toolsUsed: r.toolsUsed, tokensIn: r.tokensIn, tokensOut: r.tokensOut, ms: Date.now() - t0, trace: r.trace })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, ms: Date.now() - t0 }, { status: 500 })
  }
}
