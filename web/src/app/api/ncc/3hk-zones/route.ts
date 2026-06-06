import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const canSeeCost = (role?: string) => role === "admin" || role === "manager"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as any).role as string | undefined

  const { data, error } = await supabaseAdmin
    .from("ncc_3hk")
    .select("*")
    .order("zone")
    .order("country")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = canSeeCost(role)
    ? (data ?? [])
    : (data ?? []).map((r: any) => ({ ...r, price_per_gb_hkd: null }))

  return NextResponse.json({ data: rows, canSeeCost: canSeeCost(role) })
}
