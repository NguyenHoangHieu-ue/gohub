import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { createMission, listMissions } from "@/lib/argon/missions-db"

export const dynamic = "force-dynamic"

// GET → danh sách sứ mệnh (kèm chi tiêu/lượt chạy/file/nguồn; ?archived=1 gồm cả đã lưu trữ) · POST { name, goal? } → tạo sứ mệnh (+ dự án nền, brief.md, decisions.md).
export async function GET(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json({ missions: await listMissions(username, req.nextUrl.searchParams.get("archived") === "1") })
}

export async function POST(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { name?: string; goal?: string }
  const name = String(b.name ?? "").trim().slice(0, 120)
  if (!name) return NextResponse.json({ error: "Thiếu tên sứ mệnh" }, { status: 400 })
  try { return NextResponse.json({ mission: await createMission(username, name, String(b.goal ?? "").trim().slice(0, 2000)) }) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
