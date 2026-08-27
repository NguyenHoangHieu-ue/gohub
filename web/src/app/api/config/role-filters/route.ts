import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWrite } from "@/lib/writable-tabs"

const WRITE_ROLES = ["admin", "creator"]

// role_filters = { [role]: "câu mô tả giới hạn dữ liệu (SQL/ngôn ngữ tự nhiên)" }
// Áp cho BI analyst: non-admin → inject "DATA ACCESS RESTRICTION" vào prompt.

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", "role_filters").maybeSingle()
  let filters: Record<string, string> = {}
  try { filters = data?.value ? JSON.parse(data.value) : {} } catch {}
  return NextResponse.json(filters)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !(await canWrite(session, "users", WRITE_ROLES))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await req.json()
  await supabaseAdmin.from("app_settings").upsert({
    key: "role_filters",
    value: JSON.stringify(body ?? {}),
    category: "analytics",
  }, { onConflict: "key" })
  return NextResponse.json({ ok: true })
}
