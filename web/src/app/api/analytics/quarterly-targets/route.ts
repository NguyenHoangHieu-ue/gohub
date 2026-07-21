import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const KEY = "quarterly_targets"

async function getAll(): Promise<Record<string, any>> {
  try {
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle()
    return data?.value ? JSON.parse(data.value) : {}
  } catch { return {} }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const quarter = req.nextUrl.searchParams.get("quarter") || ""
  const year    = req.nextUrl.searchParams.get("year")    || ""
  const k = `${quarter}:${year}`
  const all = await getAll()
  return NextResponse.json({ targets: all[k] ?? null })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["admin", "creator"].includes(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { quarter, year, targets } = await req.json()
  if (!quarter || !year) return NextResponse.json({ error: "quarter and year required" }, { status: 400 })

  const all = await getAll()
  all[`${quarter}:${year}`] = targets
  const { error } = await supabaseAdmin.from("app_settings").upsert({ key: KEY, value: JSON.stringify(all) }, { onConflict: "key" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
