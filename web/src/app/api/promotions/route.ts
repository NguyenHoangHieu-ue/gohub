import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("product_code, vendor_code, type_of_sim, product_type, supported_countries, telco_perks, tenant, status")
    .not("telco_perks", "is", null)
    .neq("telco_perks", "")
    .order("vendor_code")
    .order("product_code")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
