import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { getDbRole } from "@/lib/db-role"

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.username) throw new Error("Unauthorized")
    const dbRole = await getDbRole(session.user.username)
    if (dbRole !== "creator") throw new Error("Creator only")

    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "30"), 100)
    const { data } = await supabaseAdmin
      .from("access_audit_log")
      .select("id, action, target_type, target_username, performed_by, performed_at")
      .order("performed_at", { ascending: false })
      .limit(limit)

    return NextResponse.json({ logs: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }
}
