import { NextResponse }    from "next/server"
import { getServerSession } from "next-auth"
import { authOptions }      from "@/lib/auth"
import { supabaseAdmin }    from "@/lib/supabase"

// Default permissions (fallback nếu chưa có trong DB)
const DEFAULTS: Record<string, string> = {
  perm_ncc_import:         "admin",
  perm_ncc_view:           "admin,staff",
  perm_promotions_view:    "admin,staff",
  perm_skus_view:          "admin,staff",
  // dept → extra tabs (beyond chatbot/promotions/countries)
  perm_dept_sales_tabs:    "",
  perm_dept_product_tabs:  "skus,ncc",
  perm_dept_tech_tabs:     "skus,ncc",
  perm_dept_finance_tabs:  "skus",
}

const PERM_KEYS = Object.keys(DEFAULTS)

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("key, value")
    .in("key", PERM_KEYS)

  const perms: Record<string, string[]> = {}
  for (const key of PERM_KEYS) {
    const row = data?.find(r => r.key === key)
    const val = row?.value ?? DEFAULTS[key]
    perms[key] = val.split(",").map((r: string) => r.trim()).filter(Boolean)
  }

  return NextResponse.json({ perms })
}
