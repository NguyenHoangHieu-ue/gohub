import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [r1, r2, r3, r4] = await Promise.all([
    supabaseAdmin.from("ref_countries").select("*").order("code"),
    supabaseAdmin.from("ref_support_countries").select("*").order("code"),
    supabaseAdmin.from("ref_vendors").select("vendor_code,name,description").order("vendor_code"),
    supabaseAdmin.from("ref_categories").select("category_code,name_en,name_vn,iso_code,region_type").order("category_code"),
  ])

  if (r1.error) return NextResponse.json({ error: r1.error.message }, { status: 500 })
  if (r2.error) return NextResponse.json({ error: r2.error.message }, { status: 500 })

  return NextResponse.json({
    countries:       r1.data ?? [],
    supportCountries: r2.data ?? [],
    vendors:         r3.data ?? [],
    categories:      r4.data ?? [],
  })
}
