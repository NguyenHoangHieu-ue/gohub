import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const ALLOWED = ["admin", "creator", "manager"]

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session || !ALLOWED.includes(session.user.role)) throw new Error("Unauthorized")
  return session
}

export interface StaffTarget {
  cm1_strategic:     number
  cm1_non_strategic: number
  hk3_rev:           number
  updated_at?:       string
  updated_by_email?: string
  updated_by_name?:  string
}

// GET ?months=2026-07,2026-08
// Returns: { [staffCode]: { [month]: StaffTarget } }
export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const monthsParam = req.nextUrl.searchParams.get("months") ?? ""
    const months = monthsParam.split(",").map(m => m.trim()).filter(Boolean)

    let query = supabaseAdmin
      .from("staff_targets")
      .select("staff_code, month, cm1_strategic, cm1_non_strategic, hk3_rev, updated_at, updated_by_email, updated_by_name")

    if (months.length > 0) query = query.in("month", months)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const result: Record<string, Record<string, StaffTarget>> = {}
    for (const row of data ?? []) {
      if (!result[row.staff_code]) result[row.staff_code] = {}
      result[row.staff_code][row.month] = {
        cm1_strategic:     Number(row.cm1_strategic)     || 0,
        cm1_non_strategic: Number(row.cm1_non_strategic) || 0,
        hk3_rev:           Number(row.hk3_rev)           || 0,
        updated_at:        row.updated_at,
        updated_by_email:  row.updated_by_email,
        updated_by_name:   row.updated_by_name,
      }
    }
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// PATCH — batch upsert với month
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { updates } = await req.json() as {
      updates: Array<{
        staffCode:         string
        month:             string
        cm1_strategic:     number
        cm1_non_strategic: number
        hk3_rev:           number
      }>
    }
    if (!Array.isArray(updates) || updates.length === 0)
      return NextResponse.json({ error: "updates required" }, { status: 400 })

    const now   = new Date().toISOString()
    const email = session.user.email ?? ""
    const name  = session.user.name  ?? session.user.email ?? ""

    const rows = updates.map(u => ({
      staff_code:        u.staffCode,
      month:             u.month,
      cm1_strategic:     u.cm1_strategic     || 0,
      cm1_non_strategic: u.cm1_non_strategic || 0,
      hk3_rev:           u.hk3_rev           || 0,
      updated_at:        now,
      updated_by_email:  email,
      updated_by_name:   name,
    }))

    const { error } = await supabaseAdmin
      .from("staff_targets")
      .upsert(rows, { onConflict: "staff_code,month" })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, updated: rows.length })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
