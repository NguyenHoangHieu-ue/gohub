import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role  = (session.user as any).role
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "30"), 100)

  let query = supabaseAdmin
    .from("notifications")
    .select("id, type, title, body, data, visibility, created_at")
    .order("created_at", { ascending: false })
    .limit(limit)

  // Standard users: only see 'all' visibility (no price changes)
  if (role === "standard") query = query.eq("visibility", "all")

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
