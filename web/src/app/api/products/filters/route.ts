import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from("products")
    .select("product_code,vendor_code,operator_code")
    .not("product_code", "is", null)
    .limit(5000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows  = data ?? []
  const codes = rows.map((r: any) => r.product_code as string).filter((c: string) => c?.length === 8)
  const uniq  = (arr: (string | null | undefined)[]) =>
    [...new Set(arr)].filter(Boolean).sort() as string[]

  return NextResponse.json({
    purchaseTypes: uniq(codes.map((c: string) => c[0])),
    productTypes:  uniq(codes.map((c: string) => c[1])),
    countries:     uniq(codes.map((c: string) => c.slice(2, 5))),
    vendors:       uniq(codes.map((c: string) => c.slice(5, 7))),
    dataTypes:     uniq(codes.map((c: string) => c[7])),
    vendorCodes:   uniq(rows.map((r: any) => r.vendor_code)),
    operatorCodes: uniq(rows.map((r: any) => r.operator_code)),
  })
}
