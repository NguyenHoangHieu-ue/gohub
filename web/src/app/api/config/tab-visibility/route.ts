import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const KEY = "tab_visibility"

// GET — trả về config ẩn tab: { [role]: string[] } — danh sách tab bị ẩn cho role đó
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle()
    return NextResponse.json(data?.value ? JSON.parse(data.value) : {})
  } catch { return NextResponse.json({}) }
}

// POST — chỉ creator được set (override toàn bộ config)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") {
    return NextResponse.json({ error: "Forbidden — Creator only" }, { status: 403 })
  }
  try {
    const body = await req.json()
    await supabaseAdmin.from("app_settings").upsert({ key: KEY, value: JSON.stringify(body), category: "system" }, { onConflict: "key" })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
