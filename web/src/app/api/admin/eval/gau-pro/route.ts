// Eval Gấu Pro (so sánh model): chạy 1 câu hỏi qua runCreatorAI với model chỉ định. Chỉ gọi bằng CRON_SECRET (scripts/eval-be-gau.mjs --endpoint gau-pro).
// channel "cron" → mọi tool cần duyệt trả lỗi "không có người duyệt" (không tạo hành động chờ duyệt, không ghi/gửi gì); personal=false → không đụng trí nhớ.
// Bộ câu hỏi chỉ nên là câu đọc dữ liệu. Có ghi 1 dòng gp_runs (username eval-gaupro).
import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { runCreatorAI } from "@/lib/agents/creator-ai"

export const maxDuration = 300

export async function POST(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { question, history = [], model } = await req.json() as { question: string; history?: { role: "user" | "model"; text: string }[]; model?: string }
  if (!question?.trim()) return NextResponse.json({ error: "question required" }, { status: 400 })
  if (model && !/^gemini-[a-z0-9.\-]+$/.test(model)) return NextResponse.json({ error: "model không hợp lệ" }, { status: 400 })
  const t0 = Date.now()
  try {
    const r = await runCreatorAI(
      history.map(h => ({ role: h.role, parts: [{ text: h.text }] })), question, undefined, undefined,
      true, "eval-gaupro", "cron", { personal: false, ...(model ? { model } : {}) },
    )
    return NextResponse.json({ text: r.text, toolsUsed: r.toolsUsed, tokensIn: r.tokensIn, tokensOut: r.tokensOut, ms: Date.now() - t0, trace: { model: model ?? "default", pending: r.pendingActions.length } })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, ms: Date.now() - t0 }, { status: 500 })
  }
}
