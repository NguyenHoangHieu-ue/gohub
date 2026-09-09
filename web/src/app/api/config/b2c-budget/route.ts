import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { flushAnalyticsCache } from "@/lib/analytics-helpers"
import { canWrite } from "@/lib/writable-tabs"

const WRITE_ROLES = ["admin", "creator"]

// b2c_budget = { [month "YYYY-MM"]: { vn: number, us: number } } — ngân sách marketing B2C theo tháng × thị trường.
// Total = vn + us (tự cộng). Dùng tính spend pace = spend / budget ở Section 5. Backward-compat: format cũ
// { [month]: number } → { vn: number, us: 0 }.

export type BudgetCell = { vn: number; us: number }

function normalizeBudget(raw: unknown): Record<string, BudgetCell> {
  const out: Record<string, BudgetCell> = {}
  if (raw && typeof raw === "object") {
    for (const [m, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "number") out[m] = { vn: v, us: 0 }                    // format cũ (1 số) → gán hết vào VN
      else if (v && typeof v === "object") {
        const c = v as Record<string, unknown>
        out[m] = { vn: Number(c.vn) || 0, us: Number(c.us) || 0 }
      }
    }
  }
  return out
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", "b2c_budget").maybeSingle()
  let raw: unknown = {}
  try { raw = data?.value ? JSON.parse(data.value) : {} } catch {}
  return NextResponse.json(normalizeBudget(raw))
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !(await canWrite(session, "b2c", WRITE_ROLES))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await req.json()
  await supabaseAdmin.from("app_settings").upsert({
    key: "b2c_budget",
    value: JSON.stringify(body ?? {}),
    category: "analytics",
  }, { onConflict: "key" })
  // Nhất quán với b2c-kpi-targets: xoá cache để dashboard cập nhật ngay (dù b2c/monthly đọc budget tươi).
  await flushAnalyticsCache().catch(() => {})
  return NextResponse.json({ ok: true })
}
