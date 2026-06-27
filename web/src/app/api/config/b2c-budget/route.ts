import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

// b2c_budget = { [month "YYYY-MM"]: number } — ngân sách marketing B2C kế hoạch theo tháng (VND).
// Dùng tính spend pace = spend / budget ở Section 5.

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", "b2c_budget").maybeSingle()
  let budget: Record<string, number> = {}
  try { budget = data?.value ? JSON.parse(data.value) : {} } catch {}
  return NextResponse.json(budget)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (!["admin", "creator"].includes(session.user.role as string))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await req.json()
  await supabaseAdmin.from("app_settings").upsert({
    key: "b2c_budget",
    value: JSON.stringify(body ?? {}),
    category: "analytics",
  }, { onConflict: "key" })
  return NextResponse.json({ ok: true })
}
