import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { finishCall } from "@/lib/argon/call-server"
import type { CallLine } from "@/lib/argon/call-pure"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// POST { vendor, goal, briefing?, lines, startedAt, endedAt } → tổng hợp cuối buổi, lưu Kho (Cuộc gọi/<vendor>) và trích sự việc có hạn vào sổ.
export async function POST(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { vendor?: string; goal?: string; briefing?: string; lines?: CallLine[]; startedAt?: number; endedAt?: number }
  const lines = (Array.isArray(b.lines) ? b.lines : []).slice(-2000).map((l, i) => ({
    id: Number(l.id) || i + 1, who: l.who === "me" ? "me" as const : "partner" as const, en: String(l.en ?? "").slice(0, 2000), vi: String(l.vi ?? "").slice(0, 2000), final: true, at: Number(l.at) || Date.now(),
  }))
  try {
    return NextResponse.json(await finishCall(username, { vendor: String(b.vendor ?? "").slice(0, 80), goal: String(b.goal ?? "").slice(0, 300), briefing: b.briefing ? String(b.briefing).slice(0, 7000) : undefined, lines, startedAt: Number(b.startedAt) || Date.now() - 60_000, endedAt: Number(b.endedAt) || Date.now() }))
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
