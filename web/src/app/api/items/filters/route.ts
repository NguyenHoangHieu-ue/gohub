import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    // Pagination loop để không bị Supabase 1000-row cap
    const allTypes: string[] = []
    for (let off = 0; ; off += 1000) {
      const { data: batch, error } = await supabaseAdmin
        .from("items")
        .select("item_type")
        .not("item_type", "is", null)
        .range(off, off + 999)
      if (error) throw error
      if (!batch?.length) break
      allTypes.push(...batch.map((r: any) => r.item_type as string).filter(Boolean))
      if (batch.length < 1000) break
    }

    const itemTypes = [...new Set(allTypes)].sort()
    return NextResponse.json({ itemTypes })
  } catch (err: any) {
    console.error("[items/filters]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
