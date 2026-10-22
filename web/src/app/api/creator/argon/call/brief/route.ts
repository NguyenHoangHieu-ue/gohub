import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { buildBriefing } from "@/lib/argon/call-server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST { vendor, goal } → bản tóm tắt trước cuộc gọi (kế hoạch, sự việc còn hiệu lực của vendor, trích Kho) để gợi ý từng lượt không phải tra lại.
export async function POST(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { vendor?: string; goal?: string }
  try { return NextResponse.json(await buildBriefing(username, String(b.vendor ?? "").slice(0, 80), String(b.goal ?? "").slice(0, 300))) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
