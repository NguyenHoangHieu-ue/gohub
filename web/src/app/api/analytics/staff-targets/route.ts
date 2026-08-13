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

export interface StaffTargetRow {
  cm1_strategic:     number
  cm1_non_strategic: number
  hk3_rev:           number
}

// GET — trả về toàn bộ targets dạng { [staffCode]: StaffTargetRow }
export async function GET() {
  try {
    await requireAuth()
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .like("key", "staff_target.%")

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const result: Record<string, StaffTargetRow> = {}
    for (const row of data ?? []) {
      const code = row.key.replace("staff_target.", "")
      try { result[code] = JSON.parse(row.value) } catch {}
    }
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// PATCH — lưu target cho 1 staff
export async function PATCH(req: NextRequest) {
  try {
    await requireAuth()
    const { staffCode, target } = await req.json() as {
      staffCode: string
      target: StaffTargetRow
    }
    if (!staffCode) return NextResponse.json({ error: "staffCode required" }, { status: 400 })

    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({
        key:        `staff_target.${staffCode}`,
        value:      JSON.stringify(target),
        category:   "staff_targets",
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
