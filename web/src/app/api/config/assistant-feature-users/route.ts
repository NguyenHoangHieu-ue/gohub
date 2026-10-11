import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { loadPilotUsers, savePilotUsers, normalizePilot } from "@/lib/assistant-features"

// Người dùng thử theo từng người (P3): bật 1 tính năng Bé Gấu (vd trí nhớ) cho vài username dù vai trò của họ chưa được bật.
// Xem: creator/admin; sửa: chỉ creator. Username không có trong bảng users bị bỏ và trả lại ở `unknown` (tránh gõ nhầm âm thầm).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !["creator", "admin"].includes(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json({ pilot: await loadPilotUsers() })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") return NextResponse.json({ error: "Forbidden — Creator only" }, { status: 403 })
  try {
    const wanted = normalizePilot(await req.json())
    const all = [...new Set(Object.values(wanted).flat())]
    const known = new Set<string>()
    if (all.length) {
      const { data } = await supabaseAdmin.from("users").select("username").in("username", all)
      for (const u of data ?? []) known.add(u.username as string)
    }
    const unknown = all.filter(n => !known.has(n))
    const clean = Object.fromEntries(Object.entries(wanted).map(([f, names]) => [f, names.filter(n => known.has(n))]))
    return NextResponse.json({ ok: true, pilot: await savePilotUsers(clean), unknown })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
