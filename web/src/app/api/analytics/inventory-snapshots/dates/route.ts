import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabaseAdmin
      .from("inventory_snapshots")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const dates = [...new Set((data ?? []).map((r: any) => r.snapshot_date))]
    return NextResponse.json(dates)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
