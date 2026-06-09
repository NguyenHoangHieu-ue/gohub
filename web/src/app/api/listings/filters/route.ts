import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from("listings")
    .select("listing_type")
    .not("listing_type", "is", null)
    .limit(20000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const listingTypes = [...new Set(
    (data ?? []).map((r: any) => r.listing_type as string).filter(Boolean)
  )].sort()

  return NextResponse.json({ listingTypes })
}
