import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // item_type có ít distinct values → fetch 2000 rows là đủ bao phủ
  const { data, error } = await supabaseAdmin
    .from("items")
    .select("item_type")
    .not("item_type", "is", null)
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const itemTypes = [...new Set(
    (data ?? []).map((r: any) => r.item_type as string).filter(Boolean)
  )].sort()

  return NextResponse.json({ itemTypes })
}
