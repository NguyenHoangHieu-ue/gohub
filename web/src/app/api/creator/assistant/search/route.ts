import { NextRequest, NextResponse } from "next/server"
import { requireArgonMemberName } from "@/lib/argon/access"
import { routeQuestion } from "@/lib/assistant/route-pure"
import { searchAssistant } from "@/lib/assistant/search"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// GET ?q= → ô "Hỏi / Tìm": kết quả tìm trong Kho (theo ý nghĩa + từ khoá), thực thể, sự việc, luồng mail — KHÔNG gọi model trả lời — kèm gợi ý nên hỏi Argon hay Gấu Pro.
export async function GET(req: NextRequest) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim()
  if (q.length < 2) return NextResponse.json({ error: "Gõ ít nhất 2 ký tự" }, { status: 400 })
  try {
    return NextResponse.json({ route: routeQuestion(q), ...(await searchAssistant(username, q)) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
