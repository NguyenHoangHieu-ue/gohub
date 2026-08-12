import { NextResponse }    from "next/server"
import { getServerSession } from "next-auth"
import { authOptions }      from "@/lib/auth"
import { supabaseAdmin }    from "@/lib/supabase"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role     = (session.user as any).role ?? ""
  const username = (session.user as any).username ?? ""

  if (role !== "creator") {
    const { data: ps } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", "portal_access_users").maybeSingle()
    const allowed: string[] = ps?.value ? JSON.parse(ps.value) : []
    if (!allowed.includes(username)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", "portal_shopee_data").maybeSingle()
  if (!data?.value) return NextResponse.json({ data: null })

  try {
    return NextResponse.json({ data: JSON.parse(data.value) })
  } catch {
    return NextResponse.json({ data: null })
  }
}
