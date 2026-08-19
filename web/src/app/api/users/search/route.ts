import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!["creator", "admin"].includes(session?.user?.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) return NextResponse.json({ users: [] })

  const { data } = await supabaseAdmin
    .from("users")
    .select("username, name, role")
    .or(`username.ilike.%${q}%,name.ilike.%${q}%`)
    .neq("role", "creator")
    .limit(8)

  return NextResponse.json({ users: data ?? [] })
}
