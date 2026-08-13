import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const ALLOWED = ["admin", "creator", "manager", "staff"]

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session || !ALLOWED.includes(session.user.role)) throw new Error("Unauthorized")
  return session
}

export async function GET() {
  try {
    await requireAuth()
    const { data, error } = await supabaseAdmin
      .from("vendor_balances")
      .select("*")
      .order("vendor")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { updates } = await req.json() as {
      updates: Array<{ vendor: string; balance: number; currency: string; credit_limit: number; note?: string }>
    }
    if (!Array.isArray(updates) || !updates.length)
      return NextResponse.json({ error: "updates required" }, { status: 400 })

    const now   = new Date().toISOString()
    const email = session.user.name ?? session.user.email ?? ""
    const rows  = updates.map(u => ({ ...u, updated_by: email, updated_at: now }))

    const { error } = await supabaseAdmin
      .from("vendor_balances")
      .upsert(rows, { onConflict: "vendor" })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
