import { NextResponse }    from "next/server"
import { getServerSession } from "next-auth"
import { authOptions }      from "@/lib/auth"
import { supabaseAdmin }    from "@/lib/supabase"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data } = await supabaseAdmin
    .from("users")
    .select("role, department, allowed_analytics, allowed_tabs")
    .eq("username", session.user.username)
    .single()

  return NextResponse.json({
    role:              data?.role              ?? session.user.role,
    department:        data?.department        ?? "none",
    allowed_analytics: data?.allowed_analytics ?? null,
    allowed_tabs:      data?.allowed_tabs      ?? null,
  })
}
